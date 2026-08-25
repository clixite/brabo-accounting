FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PADDLE_LANG=latin \
    OCR_DOC_ORIENTATION=1 \
    OCR_DOC_UNWARPING=1

WORKDIR /srv/ocr

# System deps for OpenCV / PaddlePaddle runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Pre-download the PP-OCRv5 models so the container is ready at boot.
# Non-fatal: models auto-download at first request if this step is skipped.
RUN python - <<'EOF'
import os
os.environ.setdefault("PADDLE_PDX_MODEL_SOURCE", "wget")
try:
    from paddleocr import PaddleOCR
    PaddleOCR(
        lang=os.environ.get("PADDLE_LANG", "latin"),
        use_doc_orientation_classify=True,
        use_doc_unwarping=True,
        use_textline_orientation=True,
    )
    print("PaddleOCR models pre-warmed OK")
except Exception as exc:  # noqa: BLE001 - build must not fail on download issues
    print(f"Model pre-warm skipped: {type(exc).__name__}: {exc}")
EOF

EXPOSE 8000

# Single worker: the OCR model lives in-process (thread-safe, lazy-loaded).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--limit-concurrency", "2"]
