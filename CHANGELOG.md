# Changelog

All notable changes to this project will be documented in this file.

## [2026-10-01] – Scanner

### Changed
- **Frontend**: The receipt scanner (`/scan`, "Kassenbon scannen" in the dashboard menu) now sends the photo to the backend OCR service instead of running tesseract.js in the browser. It shows store, date, total and items, warns when the items do not add up to the total and opens the detail dialog for corrections. A gallery upload is available as fallback; the previous upload entry is now "Foto hochladen".
- **Frontend**: Camera requests the highest available resolution and captures with higher JPEG quality.

### Removed
- **Frontend**: Browser-side `OcrService` and the `tesseract.js` dependency (its parser only recognised prices with a "€" sign and stored results only in localStorage).

### Fixed
- **Receipt Service**: Purchase time from the receipt is interpreted as German local time (Europe/Berlin) instead of UTC, so times are no longer shown 1–2 hours late and late purchases stay on the right day.
- **Dashboard**: Selecting the same photo twice triggers the upload again.

## [2026-10-01]

### Changed
- **OCR Service**: Rebuilt receipt recognition for real phone photos.
  - Preprocessing (`preprocessing.py`): receipt detection with perspective correction, 90°/180° rotation handling, deskew, scaling to a Tesseract-friendly character size, shadow removal and adaptive binarisation (replaces the global mean threshold that turned shadows black).
  - Parsing (`receipt_parser.py`): layout-aware item parsing for REWE/Lidl (quantity line below the item), ALDI/EDEKA (quantity line above), weight lines, discounts and deposit; footer/tax/payment lines no longer become items; tolerant to common OCR slips (`0,O9`, `3,878`, `SUBIE` for `SUMME`, garbled `2 Stk x` lines).
  - The service now returns `total`, `store_name`, `date`, `time`, `items_sum`, `sum_matches_total` and `confidence`; several Tesseract passes are tried and the one whose items add up to the total wins.
  - Categorisation (`categories.py`): word-based matching instead of substrings (e.g. "Basmati Reis" was "Süßwaren" because of "eis").
  - Test suite with synthetic receipt photos (`tests/`).
- **Receipt Service**: Uses store, total and date from the OCR service (text parsing stays as fallback), forwards the real image content type, adds a request timeout.

### Fixed
- **OCR Service**: Missing `numpy` dependency; Docker image no longer depends on the removed `libgl1-mesa-glx` package.
- **Devctl**: Reinstalls OCR dependencies when `requirements.txt` changes.

## [2025-11-28]

### Added
- **OCR Service**: New Python-based microservice (`backend/ocr-service`) using FastAPI and Tesseract for receipt text recognition.
- **Infrastructure**: Added `ocr-service` to `docker-compose.yml` and `devctl.sh`.

## [2025-11-27]

### Added
- **Dashboard**: Monthly grouping for receipts. Users can now collapse/expand receipt groups by month in the dashboard view.
- **Dashboard**: Interactive charts using `ngx-charts`.
  - Pie chart for spending by category (with "Sonstiges" grouping for small categories).
  - Line chart for spending over time with Day/Week/Month resolution toggle.
- **Data**: Python seed script (`scripts/seed_data.py`) to generate 6 months of realistic demo receipt data.
- **Frontend**: `ngx-charts` library integration.

### Fixed
- **Backend**: Receipt item update logic in `handlers.rs`. Now correctly deletes old items and inserts new ones during a receipt update.
- **Frontend**: Build error `TS2322` regarding `LegendPosition` in `dashboard.component.ts`.
- **Frontend**: Angular template warning regarding optional chaining in `receipt-detail.component.html`.

### Changed
- **Dashboard**: The receipt list is now grouped by month/year instead of being a flat list.
- **Devctl**: Updated `devctl.sh` to support the new python seeder.
