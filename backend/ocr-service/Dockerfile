FROM python:3.12-slim

# Tesseract with German/English models (OSD data is included for rotation detection)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-deu \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Tesseract is multi-threaded internally; keep it from oversubscribing the CPU
# when several requests are processed in parallel.
ENV OMP_THREAD_LIMIT=2

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3003"]
