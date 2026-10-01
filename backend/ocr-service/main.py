"""BonChance OCR service: extracts structured data from photos of receipts."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass

import cv2
import numpy as np
import pytesseract
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import UnidentifiedImageError

from preprocessing import PreparedImage, prepare
from receipt_parser import ParsedReceipt, parse_receipt, to_response

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="BonChance OCR Service")

OCR_LANG = os.getenv("OCR_LANG", "deu")
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# Recognition passes, tried in order until one yields a self-consistent result
# (sum of items == total). PSM 4 treats the page as one column of variable-size
# text, PSM 6 as a single uniform block; receipts sit between both.
PASSES = [
    ("gray", 4),
    ("gray", 6),
    ("binary", 4),
    ("binary", 6),
]


@dataclass
class Candidate:
    name: str
    text: str
    confidence: float
    parsed: ParsedReceipt

    @property
    def score(self) -> float:
        p = self.parsed
        score = self.confidence
        score += 15 * min(len(p.items), 40)
        score += 40 if p.total is not None else 0
        score += 20 if p.date is not None else 0
        score += 20 if p.store_name else 0
        if p.sum_matches_total:
            score += 1000
        elif p.total and p.items:
            # Partial credit for being close to the total.
            score += max(0.0, 200 * (1 - abs(p.items_sum - p.total) / max(p.total, 1)))
        return score


def run_tesseract(image: np.ndarray, psm: int) -> tuple[str, float]:
    """OCR an image and rebuild the text line by line, keeping wide gaps visible."""
    config = f"--oem 1 --psm {psm} -c preserve_interword_spaces=1 -c user_defined_dpi=300"
    data = pytesseract.image_to_data(image, lang=OCR_LANG, config=config,
                                     output_type=pytesseract.Output.DICT)
    lines: dict[tuple[int, int, int], list[tuple[int, int, str]]] = {}
    line_top: dict[tuple[int, int, int], int] = {}
    confidences = []
    for i, word in enumerate(data["text"]):
        word = word.strip()
        if not word:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append((data["left"][i], data["width"][i], word))
        line_top[key] = min(line_top.get(key, data["top"][i]), data["top"][i])
        conf = float(data["conf"][i])
        if conf >= 0:
            confidences.append(conf)

    out = []
    for key in sorted(lines, key=line_top.get):
        words = sorted(lines[key])
        char_w = np.median([w / max(len(t), 1) for _, w, t in words]) or 10
        parts = [words[0][2]]
        for (l0, w0, _), (l1, _, t1) in zip(words, words[1:]):
            gap = l1 - (l0 + w0)
            parts.append("  " if gap > 2.5 * char_w else " ")
            parts.append(t1)
        out.append("".join(parts))
    mean_conf = float(np.mean(confidences)) if confidences else 0.0
    return "\n".join(out), mean_conf


def recognize(prepared: PreparedImage) -> Candidate:
    best: Candidate | None = None
    for variant, psm in PASSES:
        image = prepared.gray if variant == "gray" else prepared.binary
        name = f"{variant}/psm{psm}"
        try:
            text, conf = run_tesseract(image, psm)
        except pytesseract.TesseractError as exc:
            logger.warning("Pass %s failed: %s", name, exc)
            continue
        cand = Candidate(name=name, text=text, confidence=conf, parsed=parse_receipt(text))
        logger.info("Pass %s: conf=%.1f items=%d total=%s sum=%.2f score=%.1f", name, conf,
                    len(cand.parsed.items), cand.parsed.total, cand.parsed.items_sum, cand.score)
        if best is None or cand.score > best.score:
            best = cand
        if cand.parsed.sum_matches_total:
            break
    if best is None:
        raise RuntimeError("OCR failed for all passes")
    return best


def process_image_bytes(data: bytes) -> dict:
    started = time.monotonic()
    prepared = prepare(data)
    best = recognize(prepared)
    if not best.parsed.items:
        # Nothing readable: the photo may be upside down (OSD is unreliable on receipts).
        flipped = PreparedImage(gray=cv2.rotate(prepared.gray, cv2.ROTATE_180),
                                binary=cv2.rotate(prepared.binary, cv2.ROTATE_180),
                                steps=prepared.steps + ["rotate_180"])
        retry = recognize(flipped)
        if retry.score > best.score:
            best, prepared = retry, flipped
    response = to_response(best.parsed)
    response.update({
        "text": best.text,
        "confidence": round(best.confidence / 100, 3),
        "metadata": {
            "ocr_engine": f"tesseract {pytesseract.get_tesseract_version()}",
            "language": OCR_LANG,
            "pass": best.name,
            "preprocessing": prepared.steps,
            "processing_ms": int((time.monotonic() - started) * 1000),
        },
    })
    return response


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post("/ocr/process")
def process_receipt(file: UploadFile = File(...)):
    # Declared sync so FastAPI runs the CPU-heavy OCR in its thread pool.
    logger.info("Received file: %s, content_type: %s", file.filename, file.content_type)
    if file.content_type and not (file.content_type.startswith("image/")
                                  or file.content_type == "application/octet-stream"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image too large")

    try:
        result = process_image_bytes(data)
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="Unsupported or corrupt image")
    except Exception as exc:
        logger.error("Error processing image: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="OCR processing failed")

    logger.info("OCR done in %sms via %s: %d items, total=%s, sum_ok=%s",
                result["metadata"]["processing_ms"], result["metadata"]["pass"],
                len(result["items"]), result["total"], result["sum_matches_total"])
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3003)
