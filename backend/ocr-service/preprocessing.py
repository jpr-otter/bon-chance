"""Image preprocessing for receipt photos.

Phone photos of receipts suffer from perspective distortion, rotation,
uneven lighting (shadows from the phone or hand), faded thermal print and
very different resolutions. Tesseract expects a flat, upright, evenly lit
page with a sensible character size, so the pipeline below:

1. applies the EXIF orientation,
2. finds the receipt in the photo and warps it to a flat rectangle,
3. fixes 90/180 degree rotations and removes the remaining skew,
4. rescales so characters have the size Tesseract works best with,
5. flattens the illumination (removes shadows / gradients),
6. offers a grayscale and a binarised variant for recognition.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

try:  # Optional: iPhone photos are HEIC by default.
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # pragma: no cover - optional dependency
    pass

# Tesseract recognises best when capital letters are roughly 30-40 px high.
TARGET_CHAR_HEIGHT = 34
# Upper bound for the working image to keep processing time reasonable.
MAX_SIDE = 4000


@dataclass
class PreparedImage:
    gray: np.ndarray  # flattened, upright grayscale image
    binary: np.ndarray  # binarised version of `gray`
    steps: list[str]


def load_image(data: bytes) -> np.ndarray:
    """Decode image bytes (JPEG, PNG, WEBP, HEIC, ...) into an upright grayscale array."""
    image = Image.open(io.BytesIO(data))
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    if image.mode != "L":
        image = image.convert("L")
    return np.array(image)


def _resize_max(img: np.ndarray, max_side: int) -> tuple[np.ndarray, float]:
    h, w = img.shape[:2]
    scale = min(1.0, max_side / max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img, scale


def _order_corners(pts: np.ndarray) -> np.ndarray:
    pts = pts.reshape(4, 2).astype(np.float32)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array(
        [pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]],
        dtype=np.float32,
    )


def _quad_from_mask(mask: np.ndarray) -> np.ndarray | None:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    hull = cv2.convexHull(max(contours, key=cv2.contourArea))
    peri = cv2.arcLength(hull, True)
    for eps in (0.02, 0.03, 0.04, 0.05):
        approx = cv2.approxPolyDP(hull, eps * peri, True)
        if len(approx) == 4 and cv2.contourArea(approx) >= 0.85 * cv2.contourArea(hull):
            return approx.reshape(4, 2).astype(np.float32)
    # Curled or partially occluded receipt: use the rotated bounding box.
    return cv2.boxPoints(cv2.minAreaRect(hull)).astype(np.float32)


def _edge_support(grad: np.ndarray, quad: np.ndarray) -> float:
    """Mean gradient magnitude along the quad's border: high if it follows the paper edge."""
    h, w = grad.shape
    samples = []
    for a, b in zip(quad, np.roll(quad, -1, axis=0)):
        n = max(int(np.linalg.norm(b - a) / 2), 2)
        pts = a + (b - a) * np.linspace(0.05, 0.95, n)[:, None]
        xs = np.clip(pts[:, 0].astype(int), 0, w - 1)
        ys = np.clip(pts[:, 1].astype(int), 0, h - 1)
        samples.append(grad[ys, xs])
    return float(np.mean(np.concatenate(samples)))


def _paper_brighter_than_surroundings(gray: np.ndarray, quad: np.ndarray) -> bool:
    """The receipt must stand out against the background (rules out text blocks on scans)."""
    inside = np.zeros(gray.shape, np.uint8)
    cv2.fillConvexPoly(inside, quad.astype(np.int32), 255)
    band = cv2.dilate(inside, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25))) & ~inside
    if band.sum() == 0:
        return False
    paper = np.percentile(gray[inside > 0], 75)  # paper colour, ignoring printed text
    surroundings = np.median(gray[band > 0])
    return paper - surroundings > 25


def find_receipt_quad(gray: np.ndarray) -> np.ndarray | None:
    """Locate the (bright) receipt in a photo. Returns 4 corners in image coordinates."""
    small, scale = _resize_max(gray, 800)
    h, w = small.shape
    blur = cv2.GaussianBlur(small, (5, 5), 0)

    # Candidate paper masks. Plain Otsu works for even lighting; dividing by a
    # very coarse blur first compensates gradients across the whole photo; the
    # edge mask is independent of brightness altogether.
    masks = []
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    masks.append(otsu)
    coarse = cv2.GaussianBlur(blur, (0, 0), max(h, w) / 6)
    leveled = cv2.normalize(cv2.divide(blur.astype(np.float32), coarse.astype(np.float32) + 1),
                            None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    _, leveled_mask = cv2.threshold(leveled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    masks.append(leveled_mask)
    edges = cv2.Canny(blur, 30, 90)
    edges = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
    masks.append(edges)

    grad = cv2.magnitude(cv2.Sobel(cv2.GaussianBlur(small, (0, 0), 2).astype(np.float32), cv2.CV_32F, 1, 0),
                         cv2.Sobel(cv2.GaussianBlur(small, (0, 0), 2).astype(np.float32), cv2.CV_32F, 0, 1))
    close_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    open_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))

    best, best_support = None, 0.0
    for mask in masks:
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_kernel)
        quad = _quad_from_mask(mask)
        if quad is None:
            continue
        area = cv2.contourArea(quad)
        # Paper fills (almost) the whole frame or is tiny: nothing useful to crop.
        if area < 0.12 * h * w or area > 0.95 * h * w:
            continue
        if not _paper_brighter_than_surroundings(small, quad):
            continue
        support = _edge_support(grad, _order_corners(quad))
        if support > best_support:
            best, best_support = quad, support

    # Require the border to actually follow a visible edge.
    if best is None or best_support < 2.5 * float(np.median(grad)) + 5:
        return None
    quad = _order_corners(best)
    # Grow slightly so text close to the paper edge is never cut off.
    center = quad.mean(axis=0)
    quad = center + (quad - center) * 1.015
    return quad / scale


def warp_quad(gray: np.ndarray, quad: np.ndarray) -> np.ndarray:
    tl, tr, br, bl = quad
    width = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
    height = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
    dst = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], np.float32)
    matrix = cv2.getPerspectiveTransform(quad, dst)
    return cv2.warpPerspective(gray, matrix, (width, height), flags=cv2.INTER_CUBIC,
                               borderMode=cv2.BORDER_REPLICATE)


def flatten_illumination(gray: np.ndarray, char_height: float | None = None) -> np.ndarray:
    """Divide by the estimated paper background to remove shadows and gradients."""
    k = int(max(15, (char_height or 30) * 2.5)) | 1
    background = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    background = cv2.GaussianBlur(background, (k, k), 0)
    flat = cv2.divide(gray.astype(np.float32), background.astype(np.float32) + 1, scale=255)
    flat = np.clip(flat, 0, 255).astype(np.uint8)
    # Stretch contrast so faded thermal print becomes dark again.
    lo, hi = np.percentile(flat, (1, 99.5))
    if hi - lo > 10:
        flat = np.clip((flat.astype(np.float32) - lo) * 255.0 / (hi - lo), 0, 255).astype(np.uint8)
    return flat


def binarize(gray: np.ndarray, block: int = 51) -> np.ndarray:
    """Local (adaptive) threshold: robust against faded print and residual shading."""
    block = max(3, block | 1)
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block, 15)


def estimate_char_height(gray: np.ndarray) -> float | None:
    """Typical height of capital letters / digits in pixels (median of character blobs)."""
    ink = 255 - binarize(flatten_illumination(gray), block=31)
    n, _, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    if n < 10:
        return None
    hs = stats[1:, cv2.CC_STAT_HEIGHT]
    ws = stats[1:, cv2.CC_STAT_WIDTH]
    area = stats[1:, cv2.CC_STAT_AREA]
    # Character-like blobs only: no speckles, no rules/separators, no huge regions.
    ok = (hs >= 6) & (ws >= 2) & (ws <= hs * 3) & (area >= 15) & (hs <= gray.shape[0] * 0.1)
    if ok.sum() < 10:
        return None
    return float(np.percentile(hs[ok], 70))


def estimate_skew(gray: np.ndarray, max_angle: float = 12.0) -> float:
    """Find the small rotation (degrees) that makes text lines horizontal."""
    small, _ = _resize_max(gray, 1000)
    binary = 255 - binarize(flatten_illumination(small))
    h, w = binary.shape
    center = (w / 2, h / 2)

    def sharpness(angle: float) -> float:
        rot = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(binary, rot, (w, h), flags=cv2.INTER_NEAREST, borderValue=0)
        profile = rotated.sum(axis=1, dtype=np.float64)
        return float(np.var(np.diff(profile)))

    best = max(np.arange(-max_angle, max_angle + 0.1, 1.0), key=sharpness)
    best = max(np.arange(best - 1, best + 1.01, 0.2), key=sharpness)
    return float(best)


def rotate(gray: np.ndarray, angle: float) -> np.ndarray:
    h, w = gray.shape
    rot = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    cos, sin = abs(rot[0, 0]), abs(rot[0, 1])
    nw, nh = int(h * sin + w * cos), int(h * cos + w * sin)
    rot[0, 2] += nw / 2 - w / 2
    rot[1, 2] += nh / 2 - h / 2
    return cv2.warpAffine(gray, rot, (nw, nh), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def fix_orientation(gray: np.ndarray) -> tuple[np.ndarray, int]:
    """Detect 90/180/270 degree rotations with Tesseract's OSD."""
    try:
        import pytesseract

        small, _ = _resize_max(gray, 1600)
        osd = pytesseract.image_to_osd(small, config="--psm 0 -c min_characters_to_try=20",
                                       output_type=pytesseract.Output.DICT)
        angle = int(osd.get("rotate", 0))
        if osd.get("orientation_conf", 0) < 1.5:
            return gray, 0
    except Exception as exc:  # OSD fails on images with little text.
        logger.debug("OSD failed: %s", exc)
        return gray, 0
    turns = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}
    if angle in turns:
        return cv2.rotate(gray, turns[angle]), angle
    return gray, 0


def prepare(data: bytes) -> PreparedImage:
    steps: list[str] = []
    gray = load_image(data)
    gray, _ = _resize_max(gray, MAX_SIDE)

    quad = find_receipt_quad(gray)
    if quad is not None:
        gray = warp_quad(gray, quad)
        steps.append("crop_perspective")

    h, w = gray.shape
    # Receipts are tall. A landscape result almost always means a sideways photo.
    if w > h * 1.15:
        gray, angle = fix_orientation(gray)
        if angle:
            steps.append(f"rotate_{angle}")

    # After a perspective correction the text is already aligned with the paper
    # edges, so only a small residual rotation is searched for.
    angle = estimate_skew(gray, max_angle=2.0 if quad is not None else 12.0)
    if abs(angle) >= 0.3:
        gray = rotate(gray, angle)
        steps.append(f"deskew_{angle:.1f}")

    # Remove sensor noise at the native resolution, before scaling and the
    # illumination flattening (which would otherwise amplify it in shadows).
    gray = cv2.fastNlMeansDenoising(gray, None, h=9, templateWindowSize=7, searchWindowSize=21)

    char_h = estimate_char_height(gray)
    if char_h:
        scale = float(np.clip(TARGET_CHAR_HEIGHT / char_h, 0.4, 4.0))
        if abs(scale - 1) > 0.15:
            interp = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
            gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=interp)
            steps.append(f"scale_{scale:.2f}")
            char_h *= scale
    elif max(gray.shape) < 1500:
        gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        steps.append("scale_2.00")

    flat = flatten_illumination(gray, char_h)
    steps.append("flatten_illumination")
    block = int((char_h or TARGET_CHAR_HEIGHT) * 1.5)
    return PreparedImage(gray=flat, binary=binarize(flat, block), steps=steps)
