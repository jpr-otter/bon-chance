# Changelog

All notable changes to this project will be documented in this file.

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
