# OCR Service

FastAPI service that turns a photo of a German receipt into structured data.

```
POST /ocr/process   (multipart field "file": JPEG/PNG/WEBP/HEIC)
```

Response (abridged):

```json
{
  "store_name": "REWE",
  "date": "2025-07-14", "time": "14:32",
  "total": 15.99, "items_sum": 15.99, "sum_matches_total": true,
  "items": [{"description": "SCHOKOLADE ZARTBITTER", "price": 1.49, "quantity": 3,
             "line_total": 4.47, "category": "Süßwaren"}],
  "confidence": 0.91,
  "text": "...raw OCR text...",
  "metadata": {"pass": "gray/psm4", "preprocessing": ["crop_perspective", "scale_1.79", "flatten_illumination"]}
}
```

`price` is the unit price; `price * quantity == line_total`.

## Pipeline

1. `preprocessing.py` – find the receipt in the photo and correct perspective,
   fix rotation/skew, scale to ~34 px character height, remove shadows,
   adaptive binarisation.
2. `main.py` – runs Tesseract (`deu`) in several modes and keeps the result
   whose items add up to the printed total (or the best scoring one).
3. `receipt_parser.py` – layout-aware parsing of items, quantity/weight lines,
   discounts, total, store and date.
4. `categories.py` – keyword based product categories.

## Development

```bash
pip install -r requirements-dev.txt   # plus the tesseract binary with "deu" data
pytest tests                          # end-to-end tests are skipped without tesseract
```

`tests/synth.py` renders synthetic receipt photos (perspective, shadows, blur,
noise) with known ground truth; it is useful for measuring changes to the
pipeline.
