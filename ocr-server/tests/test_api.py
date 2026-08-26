"""API smoke tests: /health and /ocr/extract with a stubbed OCR engine.

The heavy PaddleOCR engine is monkeypatched so the full FastAPI stack
(routing, multipart parsing, Pydantic validation, suggestion wiring) is
exercised without loading any model.
"""

import io

import pytest
from fastapi.testclient import TestClient

from app import main
from app.invoice_parser import OcrLine

# A 1x1 transparent PNG — never decoded when the engine is stubbed.
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082"
)

FR_LINES = [
    OcrLine("Proximus SA", 0.95, 100, 40, 400, 14, 0),
    OcrLine("TVA BE 0202.239.951", 0.95, 100, 110, 400, 14, 0),
    OcrLine("Facture N° PROX-2026-9912", 0.95, 100, 150, 400, 14, 0),
    OcrLine("Date de la facture: 12/02/2026", 0.95, 100, 170, 400, 14, 0),
    OcrLine("Échéance: 14/03/2026", 0.95, 100, 190, 400, 14, 0),
    OcrLine("Sous-total HTVA 245,00", 0.95, 100, 350, 400, 14, 0),
    OcrLine("TVA 21% 51,45", 0.95, 100, 370, 400, 14, 0),
    OcrLine("Total TVAC à payer 296,45", 0.95, 100, 390, 400, 14, 0),
]

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def _stub_engine(monkeypatch):
    def fake_extract_lines(image_path: str):
        return [line.__dict__ if hasattr(line, "__dict__") else _to_dict(line) for line in FR_LINES], 1

    def _to_dict(line):
        return {"text": line.text, "score": line.score, "x": line.x, "y": line.y, "w": line.w, "h": line.h, "page": line.page}

    monkeypatch.setattr(main.engine, "extract_lines", fake_extract_lines)
    monkeypatch.setattr(main.engine, "version", "9.9.9-test")
    monkeypatch.setattr(
        main.engine,
        "health",
        lambda: {"status": "ok", "engine": "paddleocr", "engineVersion": "9.9.9-test", "lang": "latin", "cpu": True, "device": "CPU"},
    )
    yield


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["engine"] == "paddleocr"


def test_extract_french_invoice():
    resp = client.post(
        "/ocr/extract",
        files={"file": ("facture.png", io.BytesIO(PNG_BYTES), "image/png")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["engine"] == "paddleocr"
    assert body["engineVersion"] == "9.9.9-test"
    assert body["pages"] == 1
    assert body["confidence"] == pytest.approx(0.95)

    fields = body["fields"]
    assert fields["supplierName"]["value"] == "Proximus SA"
    assert fields["supplierBce"]["value"] == "BE 0202.239.951"
    assert fields["invoiceNumber"]["value"] == "PROX-2026-9912"
    assert fields["invoiceDate"]["value"] == "2026-02-12"
    assert fields["dueDate"]["value"] == "2026-03-14"
    assert fields["totalExclVat"]["value"] == 245.0
    assert fields["vatAmount"]["value"] == 51.45
    assert fields["totalInclVat"]["value"] == 296.45
    assert fields["vatRate"]["value"] == 21

    # Suggestion: "Proximus" -> PCMN 616100 Télécom, fully deductible.
    sug = body["suggestion"]
    assert sug["pcmnAccount"] == "616100"
    assert sug["category"] == "Télécom & Internet"
    assert sug["deductibilityRate"] == 100
    assert sug["deductibleVatRate"] == 100
    assert body["warnings"] == []


def test_extract_rejects_unsupported_type():
    resp = client.post(
        "/ocr/extract",
        files={"file": ("doc.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert resp.status_code == 415


def test_extract_rejects_empty_file():
    resp = client.post(
        "/ocr/extract",
        files={"file": ("facture.png", io.BytesIO(b""), "image/png")},
    )
    assert resp.status_code == 422


def test_extract_rejects_oversized_file(monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 10)
    resp = client.post(
        "/ocr/extract",
        files={"file": ("facture.png", io.BytesIO(PNG_BYTES * 10), "image/png")},
    )
    assert resp.status_code == 413


def test_extract_rejects_spoofed_extension():
    """Magic bytes matter more than the filename extension."""
    resp = client.post(
        "/ocr/extract",
        files={"file": ("facture.png", io.BytesIO(b"definitely not an image"), "image/png")},
    )
    assert resp.status_code == 415
    assert "non reconnu" in resp.json()["detail"]


def test_extract_requires_internal_token(monkeypatch):
    monkeypatch.setattr(main, "SERVICE_TOKEN", "super-secret")
    resp = client.post(
        "/ocr/extract",
        files={"file": ("facture.png", io.BytesIO(PNG_BYTES), "image/png")},
    )
    assert resp.status_code == 401

    resp = client.post(
        "/ocr/extract",
        files={"file": ("facture.png", io.BytesIO(PNG_BYTES), "image/png")},
        headers={"X-OCR-Token": "super-secret"},
    )
    assert resp.status_code == 200


def test_extract_rejects_decompression_bomb(monkeypatch):
    monkeypatch.setattr(main, "MAX_IMAGE_PIXELS", 0)  # any image now exceeds the cap
    resp = client.post(
        "/ocr/extract",
        files={"file": ("facture.png", io.BytesIO(PNG_BYTES), "image/png")},
    )
    assert resp.status_code == 413


def test_metrics_endpoint():
    resp = client.get("/metrics")
    assert resp.status_code == 200
    body = resp.text
    assert "brabo_ocr_engine_loaded" in body
    assert "brabo_ocr_requests_total" in body
    assert "brabo_ocr_request_duration_seconds" in body
