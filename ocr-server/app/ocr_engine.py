"""PaddleOCR PP-OCRv5 wrapper — lazy singleton, CPU-first.

The engine is loaded once per process (models are ~100 MB) and reused across
requests. PDFs are rasterised with pypdfium2 so we control DPI and page count.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path

log = logging.getLogger("brabo.ocr")

PADDLE_LANG = os.environ.get("PADDLE_LANG", "latin")  # latin ≈ FR/NL/EN/DE...
OCR_DOC_UNWARPING = os.environ.get("OCR_DOC_UNWARPING", "1") == "1"
OCR_DOC_ORIENTATION = os.environ.get("OCR_DOC_ORIENTATION", "1") == "1"
OCR_MAX_PAGES = int(os.environ.get("OCR_MAX_PAGES", "5"))
OCR_PDF_DPI = int(os.environ.get("OCR_PDF_DPI", "200"))


class OcrEngine:
    """Lazy, thread-safe PaddleOCR wrapper."""

    def __init__(self) -> None:
        self._engine = None
        self._lock = threading.Lock()
        self.version = "unloaded"

    def _load(self):
        with self._lock:
            if self._engine is not None:
                return
            log.info("Loading PaddleOCR (lang=%s, CPU)…", PADDLE_LANG)
            from paddleocr import PaddleOCR  # heavy import — deferred

            self._engine = PaddleOCR(
                lang=PADDLE_LANG,
                use_doc_orientation_classify=OCR_DOC_ORIENTATION,
                use_doc_unwarping=OCR_DOC_UNWARPING,
                use_textline_orientation=True,
            )
            self.version = getattr(self._engine, "version", "3.x") or "3.x"
            log.info("PaddleOCR %s ready.", self.version)

    def health(self) -> dict:
        try:
            self._load()
            return {
                "status": "ok",
                "engine": "paddleocr",
                "engineVersion": str(self.version),
                "lang": PADDLE_LANG,
                "cpu": True,
                "device": "CPU",
            }
        except Exception as exc:  # pragma: no cover - environment dependent
            return {"status": "error", "engine": "paddleocr", "error": str(exc)}

    def extract_lines(self, image_path: str) -> tuple[list[dict], int]:
        """OCR an image; return (list of line dicts, page count).

        Line dict: {"text", "score", "x", "y", "w", "h", "page"} in pixels.
        """
        self._load()
        results = self._engine.predict(input=image_path)
        if not isinstance(results, list):
            results = [results]

        lines: list[dict] = []
        for page_index, page in enumerate(results):
            page = page if isinstance(page, dict) else getattr(page, "json", None) or {}
            texts = page.get("rec_texts") or []
            scores = page.get("rec_scores") or []
            polys = page.get("rec_polys") or page.get("dt_polys") or []
            for text, score, poly in zip(texts, scores, polys):
                text = str(text).strip()
                if not text or score is None:
                    continue
                poly = list(poly)
                xs = [float(p[0]) for p in poly]
                ys = [float(p[1]) for p in poly]
                lines.append(
                    {
                        "text": text,
                        "score": float(score),
                        "x": min(xs),
                        "y": min(ys),
                        "w": max(xs) - min(xs),
                        "h": max(ys) - min(ys),
                        "page": page_index,
                    }
                )
        return lines, len(results) if isinstance(results, list) else 1


def rasterize_pdf(pdf_path: str, out_dir: str, dpi: int = OCR_PDF_DPI, max_pages: int = OCR_MAX_PAGES) -> list[str]:
    """Render the first `max_pages` pages of a PDF to PNG files; return their paths."""
    import pypdfium2 as pdfium

    out_dir_path = Path(out_dir)
    out_dir_path.mkdir(parents=True, exist_ok=True)
    pdf = pdfium.PdfDocument(pdf_path)
    try:
        n = min(len(pdf), max_pages)
        paths: list[str] = []
        for i in range(n):
            page = pdf[i]
            bitmap = page.render(scale=dpi / 72.0)
            pil_image = bitmap.to_pil()
            target = out_dir_path / f"page_{i:03d}.png"
            pil_image.save(target)
            paths.append(str(target))
        return paths
    finally:
        pdf.close()
