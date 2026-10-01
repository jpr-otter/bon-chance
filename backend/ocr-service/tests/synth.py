"""Synthetic receipt photo generator used by the OCR test-suite.

Renders German supermarket receipts in typical layouts (REWE, Lidl, ALDI)
and degrades them like a phone photo would: perspective, rotation, uneven
lighting, blur, noise and JPEG artefacts. Each receipt comes with its
ground truth so recognition quality can be measured end-to-end.
"""

from __future__ import annotations

import io
import random
from dataclasses import dataclass, field

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeMono.ttf",
]


def _font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    raise RuntimeError("No monospace TrueType font available")


@dataclass
class TruthItem:
    description: str
    unit_price: float
    quantity: float = 1

    @property
    def line_total(self) -> float:
        return round(self.unit_price * self.quantity, 2)


@dataclass
class SyntheticReceipt:
    store: str
    date: str  # DD.MM.YYYY
    items: list[TruthItem]
    lines: list[str] = field(default_factory=list)

    @property
    def total(self) -> float:
        return round(sum(i.line_total for i in self.items), 2)


def fmt(value: float) -> str:
    return f"{value:.2f}".replace(".", ",")


def _row(left: str, right: str, width: int = 34) -> str:
    gap = max(2, width - len(left) - len(right))
    return left + " " * gap + right


PRODUCTS = [
    ("Vollmilch 3,5%", 1.15), ("Bananen", 1.29), ("Butter 250g", 2.29),
    ("Gouda jung Scheiben", 1.89), ("Spaghetti 500g", 0.99), ("Tomaten Rispe", 2.49),
    ("Mineralwasser", 0.49), ("Toastbrot", 1.39), ("Hähnchenbrust", 5.99),
    ("Joghurt Natur", 0.65), ("Kaffee Bohnen", 6.99), ("Äpfel Elstar", 2.79),
    ("Schokolade Zartbitter", 1.49), ("Kartoffelchips", 1.79), ("Zahnpasta", 1.95),
    ("Spülmittel", 1.25), ("Eier Freiland 10St", 3.29), ("Gurke", 0.79),
    ("Paprika rot", 1.99), ("Basmati Reis", 2.19), ("Orangensaft 1L", 1.69),
    ("Salami Spitzen", 2.59), ("Frischkäse", 1.09), ("Müsli Knusper", 2.99),
]


def make_receipt(rng: random.Random, layout: str) -> SyntheticReceipt:
    n = rng.randint(5, 10)
    picks = rng.sample(PRODUCTS, n)
    items = [TruthItem(d, p, rng.choice([1, 1, 1, 2, 3])) for d, p in picks]
    day, month = rng.randint(1, 28), rng.randint(1, 12)
    date = f"{day:02d}.{month:02d}.2025"
    store = {"rewe": "REWE", "lidl": "LIDL", "aldi": "ALDI"}[layout]
    r = SyntheticReceipt(store=store, date=date, items=items)

    L = r.lines
    if layout == "rewe":
        L += ["        R E W E", "   REWE Markt GmbH", "  Hauptstraße 12", "  80331 München",
              "  UID Nr.: DE812706034", "", _row("", "EUR")]
        for it in items:
            L.append(_row(it.description.upper(), f"{fmt(it.line_total)} B"))
            if it.quantity > 1:
                L.append(f"  {int(it.quantity)} Stk x  {fmt(it.unit_price)}")
        L += ["-" * 34, _row("SUMME", f"EUR {fmt(r.total)}"), "=" * 34,
              _row("Geg. EC-Cash", f"EUR {fmt(r.total)}"), "",
              _row("Steuer  %   Netto", "Steuer"), _row("B=  7,0%  " + fmt(r.total / 1.07), fmt(r.total - r.total / 1.07)),
              "", f"{date}  14:32   Bon-Nr.:4711", "Markt:1234 Kasse:3", "  Vielen Dank für Ihren Einkauf"]
    elif layout == "lidl":
        L += ["          LIDL", "  Lidl Vertriebs GmbH", "  Bahnhofstr. 5", "  10115 Berlin", "", _row("", "EUR")]
        for it in items:
            if it.quantity > 1:
                L.append(_row(it.description, f"{fmt(it.line_total)} A"))
                L.append(f"  {int(it.quantity)} x {fmt(it.unit_price)}")
            else:
                L.append(_row(it.description, f"{fmt(it.unit_price)} A"))
        L += ["-" * 34, _row("zu zahlen", fmt(r.total)), _row("Kartenzahlung", fmt(r.total)), "",
              _row("MWST%  MWST  +  Netto", "= Brutto"), "", f"{date} 18:05  Filiale 8441",
              "  Vielen Dank für Ihren Einkauf!"]
    else:  # aldi: quantity line above the product line
        L += ["        ALDI SÜD", "  Industriestr. 3", "  50667 Köln", "", _row("", "EUR")]
        for it in items:
            if it.quantity > 1:
                L.append(f"   {int(it.quantity)} x  {fmt(it.unit_price)}")
            L.append(_row(it.description, f"{fmt(it.line_total)} A"))
        L += ["-" * 34, _row("Summe", fmt(r.total)), _row("Gegeben Girocard", fmt(r.total)), "",
              f"{date}   10:11   Kasse 2", "  Vielen Dank für Ihren Einkauf"]
    return r


def render(receipt: SyntheticReceipt, font_size: int = 30) -> Image.Image:
    font = _font(font_size)
    line_h = int(font_size * 1.35)
    width = int(font_size * 0.62 * 36) + 60
    height = line_h * (len(receipt.lines) + 2) + 60
    img = Image.new("L", (width, height), 250)
    draw = ImageDraw.Draw(img)
    y = 40
    for line in receipt.lines:
        draw.text((30, y), line, fill=25, font=font)
        y += line_h
    return img


def photograph(paper: Image.Image, rng: random.Random, difficulty: float = 1.0) -> bytes:
    """Simulate a phone photo of the paper receipt. Returns JPEG bytes."""
    p = np.array(paper).astype(np.float32)
    # Thermal-paper fading: reduce ink contrast a bit.
    fade = 1.0 - 0.35 * difficulty * rng.random()
    p = 250 - (250 - p) * fade
    ph, pw = p.shape

    canvas_w, canvas_h = int(pw * 1.6), int(ph * 1.25)
    # Background: dark-ish table with texture.
    base = rng.randint(60, 120)
    bg = np.full((canvas_h, canvas_w), base, np.float32)
    bg += cv2.GaussianBlur(np.random.default_rng(rng.randint(0, 9999)).normal(0, 25, bg.shape).astype(np.float32), (0, 0), 6)

    # Perspective placement of the receipt.
    cx, cy = canvas_w / 2, canvas_h / 2
    j = 0.04 * difficulty
    src = np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]])
    dst = np.float32([
        [cx - pw / 2 + rng.uniform(-j, j) * pw, cy - ph / 2 + rng.uniform(-j, j) * ph],
        [cx + pw / 2 + rng.uniform(-j, j) * pw, cy - ph / 2 + rng.uniform(-j, j) * ph],
        [cx + pw / 2 + rng.uniform(-j, j) * pw, cy + ph / 2 + rng.uniform(-j, j) * ph],
        [cx - pw / 2 + rng.uniform(-j, j) * pw, cy + ph / 2 + rng.uniform(-j, j) * ph],
    ])
    angle = rng.uniform(-6, 6) * difficulty
    rot = cv2.getRotationMatrix2D((cx, cy), angle, 1.0)
    dst = cv2.transform(dst[None], rot)[0].astype(np.float32)
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(p, M, (canvas_w, canvas_h), borderValue=0)
    mask = cv2.warpPerspective(np.ones_like(p), M, (canvas_w, canvas_h), borderValue=0)
    img = bg * (1 - mask) + warped * mask

    # Uneven lighting: linear gradient + soft shadow blob.
    yy, xx = np.mgrid[0:canvas_h, 0:canvas_w].astype(np.float32)
    gx, gy = rng.uniform(-1, 1), rng.uniform(-1, 1)
    grad = 1.0 - 0.35 * difficulty * ((gx * xx / canvas_w + gy * yy / canvas_h) + 1) / 2
    sx, sy = rng.uniform(0, canvas_w), rng.uniform(0, canvas_h)
    shadow = 1.0 - 0.3 * difficulty * np.exp(-(((xx - sx) ** 2 + (yy - sy) ** 2) / (2 * (0.25 * canvas_w) ** 2)))
    img = img * grad * shadow

    # Camera blur and sensor noise.
    sigma = 0.4 + 1.0 * difficulty * rng.random()
    img = cv2.GaussianBlur(img, (0, 0), sigma)
    img += np.random.default_rng(rng.randint(0, 9999)).normal(0, 6 * difficulty, img.shape)
    img = np.clip(img, 0, 255).astype(np.uint8)

    # Phones deliver colour JPEGs; give the paper a slight warm tint.
    f = img.astype(np.float32)
    color = np.dstack([f * 0.94, f * 0.98, f]).clip(0, 255).astype(np.uint8)
    out = Image.fromarray(cv2.cvtColor(color, cv2.COLOR_BGR2RGB))
    buf = io.BytesIO()
    out.save(buf, "JPEG", quality=rng.randint(70, 90))
    return buf.getvalue()


def dataset(n: int = 9, seed: int = 7, difficulty: float = 1.0):
    rng = random.Random(seed)
    layouts = ["rewe", "lidl", "aldi"]
    for k in range(n):
        r = make_receipt(rng, layouts[k % 3])
        yield r, photograph(render(r, font_size=rng.choice([24, 28, 32])), rng, difficulty)
