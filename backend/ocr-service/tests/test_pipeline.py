"""End-to-end recognition on synthetic receipt photos (needs the tesseract binary)."""

import difflib
import shutil

import pytest

from synth import dataset

pytestmark = pytest.mark.skipif(shutil.which("tesseract") is None, reason="tesseract not installed")


def test_synthetic_photos_are_recognised():
    import main

    total_items = correct_items = correct_totals = n = 0
    for truth, image in dataset(n=6, seed=11, difficulty=1.0):
        result = main.process_image_bytes(image)
        n += 1
        correct_totals += abs((result["total"] or 0) - truth.total) < 0.005
        for it in truth.items:
            total_items += 1
            # Descriptions may contain small OCR slips ("500G" -> "5006"); prices must be exact.
            correct_items += any(
                difflib.SequenceMatcher(None, it.description.lower(), r["description"].lower()).ratio() >= 0.8
                and r["price"] == it.unit_price and r["quantity"] == it.quantity
                for r in result["items"]
            )
    assert correct_totals >= n - 1
    assert correct_items >= 0.85 * total_items


def test_api_endpoint():
    from fastapi.testclient import TestClient

    import main

    truth, image = next(dataset(n=1, seed=5))
    client = TestClient(main.app)
    response = client.post("/ocr/process", files={"file": ("bon.jpg", image, "image/jpeg")})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == truth.total
    assert body["store_name"] == truth.store
    assert {"text", "items", "date", "confidence", "metadata"} <= body.keys()

    bad = client.post("/ocr/process", files={"file": ("x.txt", b"hello", "text/plain")})
    assert bad.status_code == 400
