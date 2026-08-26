"""BRABO OCR server — self-hosted invoice OCR.

Run locally:
    uvicorn app.main:app --host 0.0.0.0 --port 8000

Endpoints:
    GET  /health          engine status (liveness — always reachable)
    GET  /metrics         Prometheus text metrics
    POST /ocr/extract     multipart image/PDF -> structured invoice fields
                          (protected by OCR_SERVICE_TOKEN when set)
"""

from __future__ import annotations

import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from . import __version__
from .invoice_parser import OcrLine, parse_invoice
from .metrics import metrics
from .models import HealthResponse, OcrExtractResult, OcrField, OcrSuggestion
from .ocr_engine import OcrEngine, OCR_MAX_PAGES, rasterize_pdf
from .suggest import suggest

log = logging.getLogger("brabo.ocr")

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".pdf"}
MAX_UPLOAD_MB = int(os.environ.get("OCR_MAX_UPLOAD_MB", "15"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
# Decompression-bomb guard: reject images above this many pixels (e.g. 5000x5000).
MAX_IMAGE_PIXELS = int(os.environ.get("OCR_MAX_IMAGE_PIXELS", "25_000_000"))
# Internal shared secret between the Express API and this service (defense in depth).
SERVICE_TOKEN = os.environ.get("OCR_SERVICE_TOKEN", "")

app = FastAPI(
    title="BRABO OCR API",
    description="Self-hosted invoice OCR (PaddleOCR PP-OCRv5) + Belgian field extraction.",
    version=__version__,
)

# CORS — dev defaults + configurable via OCR_CORS_ORIGINS (comma separated).
_cors_env = os.environ.get("OCR_CORS_ORIGINS", "")
if _cors_env:
    origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://(?:[\w-]+\.)*clixite-prod\.cloud",
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = OcrEngine()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Internal token guard (defense in depth; the service is already network-isolated)
# ---------------------------------------------------------------------------
def require_internal_token(request: Request) -> None:
    if not SERVICE_TOKEN:
        return
    provided = request.headers.get("x-ocr-token", "")
    if provided != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Jeton OCR interne invalide.")


# ---------------------------------------------------------------------------
# File validation (magic bytes + pixel guard)
# ---------------------------------------------------------------------------
def sniff_mime(header: bytes) -> str | None:
    """Return a canonical extension based on magic bytes, or None if unknown."""
    if header.startswith(b"\x89PNG"):
        return ".png"
    if header.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return ".webp"
    if header.startswith(b"BM"):
        return ".bmp"
    if header.startswith((b"II*\x00", b"MM\x00*")):
        return ".tif"
    if header.startswith(b"%PDF"):
        return ".pdf"
    return None


def guard_image_pixels(path: str) -> None:
    """Reject decompression bombs / absurd resolutions before OCR runs."""
    try:
        with Image.open(path) as img:
            width, height = img.size
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Image illisible: {type(exc).__name__}") from exc
    if width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(
            status_code=413,
            detail=f"Image trop grande ({width}x{height} px > {MAX_IMAGE_PIXELS} px).",
        )


@app.middleware("http")
async def observe_requests(request: Request, call_next):
    started = time.perf_counter()
    status = 200
    try:
        response = await call_next(request)
        status = response.status_code
    except HTTPException as exc:
        status = exc.status_code
        raise
    except Exception:
        status = 500
        raise
    finally:
        if request.url.path.startswith("/ocr/"):
            metrics.observe("extract", status, time.perf_counter() - started)
            log.info(
                "%s %s -> %s (%.3fs)",
                request.method,
                request.url.path,
                status,
                time.perf_counter() - started,
            )
    return response


@app.get("/health", response_model=HealthResponse, tags=["system"])
@app.get("/ocr/health", response_model=HealthResponse, tags=["system"], include_in_schema=False)
def health() -> HealthResponse:
    return HealthResponse(**engine.health())


@app.get("/metrics", include_in_schema=False)
def metrics_endpoint() -> str:
    with engine._lock:
        loaded = engine._engine is not None
    return metrics.render(engine_loaded=loaded)


@app.post(
    "/ocr/extract",
    response_model=OcrExtractResult,
    tags=["ocr"],
    dependencies=[Depends(require_internal_token)],
)
async def extract_invoice(file: UploadFile = File(...)) -> OcrExtractResult:
    filename = file.filename or "upload"
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Type de fichier non supporté ({suffix or 'inconnu'}). Accepté: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Fichier trop volumineux ({len(content) / 1e6:.1f} MB > {MAX_UPLOAD_MB} MB).",
        )
    if len(content) == 0:
        raise HTTPException(status_code=422, detail="Fichier vide.")

    # Trust the content, not the extension.
    detected = sniff_mime(content[:12])
    if detected is None:
        raise HTTPException(status_code=415, detail="Fichier non reconnu (PNG/JPEG/WebP/BMP/TIFF/PDF attendus).")
    suffix = detected

    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="brabo-ocr-") as tmp:
        tmp_path = Path(tmp) / f"upload{suffix}"
        tmp_path.write_bytes(content)

        try:
            if suffix == ".pdf":
                pages = rasterize_pdf(str(tmp_path), tmp)
            else:
                guard_image_pixels(str(tmp_path))
                pages = [str(tmp_path)]

            all_lines: list[dict] = []
            for page_image in pages:
                if suffix == ".pdf":
                    guard_image_pixels(page_image)
                page_lines, _ = engine.extract_lines(page_image)
                all_lines.extend(page_lines)
        except HTTPException:
            raise
        except Exception as exc:  # model/IO errors -> 500 with a safe message
            log.exception("OCR failed for %s", filename)
            raise HTTPException(status_code=500, detail=f"Échec OCR: {type(exc).__name__}: {exc}") from exc

    if not all_lines:
        raise HTTPException(status_code=422, detail="Aucun texte détecté dans le document.")

    ocr_lines = [
        OcrLine(
            text=l["text"],
            score=l["score"],
            x=l["x"],
            y=l["y"],
            w=l["w"],
            h=l["h"],
            page=l["page"],
        )
        for l in all_lines
    ]

    parsed = parse_invoice(ocr_lines)
    fields = parsed["fields"]
    warnings = parsed["warnings"]

    raw_parts: list[str] = []
    for page in range(max(l.page for l in ocr_lines) + 1):
        page_lines = [l.text for l in ocr_lines if l.page == page]
        raw_parts.append("\n".join(page_lines))
    raw_text = "\n\n".join(raw_parts)

    suggestion_data = suggest(fields, raw_text)

    global_conf = round(sum(l.score for l in ocr_lines) / len(ocr_lines), 4)

    result = OcrExtractResult(
        engineVersion=engine.version,
        processedAt=_now_iso(),
        pages=len({l.page for l in ocr_lines}),
        confidence=global_conf,
        rawText=raw_text,
        fields={k: OcrField(**v) for k, v in fields.items()},
        suggestion=OcrSuggestion(**suggestion_data),
        warnings=warnings,
    )

    log.info(
        "OCR %s: %.1fs, conf=%.2f, supplier=%s, incl=%.2f",
        filename,
        time.perf_counter() - started,
        global_conf,
        fields.get("supplierName", {}).get("value"),
        fields.get("totalInclVat", {}).get("value"),
    )
    return result
