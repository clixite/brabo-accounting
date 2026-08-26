FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PADDLE_LANG=latin \
    OCR_DOC_ORIENTATION=1 \
    OCR_DOC_UNWARPING=1 \
    HOME=/home/ocr

WORKDIR /srv/ocr

# System deps for OpenCV / PaddlePaddle runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Non-root runtime user. Its home is the model cache mount point in production.
RUN useradd --create-home --home-dir /home/ocr --uid 10001 --shell /usr/sbin/nologin ocr \
    && mkdir -p /home/ocr/.paddlex

# Pre-warm models AND helper fonts (PaddleX downloads fonts into site-packages,
# which the non-root user cannot write at runtime) while still running as root.
# Non-fatal: a cold container auto-downloads into the writable cache on first use.
RUN HOME=/home/ocr python - <<'EOF'
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
    print("PaddleOCR models + fonts pre-warmed OK")
except Exception as exc:  # noqa: BLE001 - build must not fail on download issues
    print(f"Model pre-warm skipped: {type(exc).__name__}: {exc}")
EOF

# Hand the whole tree (app + cache) to the runtime user.
RUN chown -R ocr:ocr /srv/ocr /home/ocr
USER ocr

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ocr/health', timeout=5)"

# Single worker: the OCR model lives in-process (thread-safe, lazy-loaded).
# Concurrency is bounded; extra requests return 503 instead of queueing forever.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--limit-concurrency", "4"]
