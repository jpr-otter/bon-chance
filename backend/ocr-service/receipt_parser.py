"""Turns raw OCR text of a German receipt into structured data.

The parser works line by line and understands the common layouts of German
supermarket receipts:

* ``ARTIKEL                 1,99 A``          one item, price = line total
* ``ARTIKEL                 3,98 B``          followed by ``2 Stk x 1,99`` (REWE, Lidl)
* ``2 x 1,99`` followed by ``ARTIKEL 3,98 A`` quantity line above the item (ALDI, EDEKA)
* ``ARTIKEL`` followed by ``2 Stk x 1,99 3,98`` price only on the quantity line
* ``0,456 kg x 2,99 EUR/kg``                  weight line above/below the item
* ``Rabatt / Preisvorteil  -0,50``            discount that belongs to the item above

Everything after the total ("Summe", "zu zahlen", ...) is payment and tax
information and never produces items.
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from categories import categorize_item

# ---------------------------------------------------------------------------
# Text normalisation
# ---------------------------------------------------------------------------

# Characters Tesseract confuses with digits inside numbers.
_DIGIT_LOOKALIKES = str.maketrans({"O": "0", "o": "0", "D": "0", "Q": "0", "l": "1", "I": "1",
                                   "|": "1", "i": "1", "!": "1", "S": "5", "s": "5", "B": "8",
                                   "Z": "2", "z": "2", "G": "6", "g": "9"})

# A money amount: 1-4 digits, comma/dot, exactly two digits. OCR sometimes
# inserts a space next to the separator ("1 ,99", "1, 99").
_AMOUNT = r"(?<![\d.,])(-?\s?\d{1,4})\s?[,.]\s?(\d{2})(?![\d])"
_AMOUNT_RE = re.compile(_AMOUNT)


def _fix_amount_tokens(line: str) -> str:
    """Repair digit look-alikes in tokens that are clearly meant to be amounts (e.g. ``1,O9``)."""

    def repl(m: re.Match) -> str:
        return m.group(0).translate(_DIGIT_LOOKALIKES)

    # Tokens of the form X,XX where some of the X are look-alike letters.
    return re.sub(r"(?<![A-Za-zÄÖÜäöüß])[\dOoDlI|S]{1,4}[,.][\dOoDlI|S]{2}(?![A-Za-zÄÖÜäöüß\d])", repl, line)


def to_amount(text: str) -> Optional[float]:
    m = _AMOUNT_RE.search(text)
    if not m:
        return None
    whole = m.group(1).replace(" ", "")
    try:
        return round(float(f"{whole}.{m.group(2)}"), 2)
    except ValueError:
        return None


def _num(text: str) -> float:
    return float(text.replace(" ", "").replace(",", "."))


def normalize_line(line: str) -> str:
    line = line.replace("€", " EUR ").replace("\t", " ")
    line = re.sub(r"[‘’´`]", "'", line)
    line = re.sub(r"[—–]", "-", line)
    line = _fix_amount_tokens(line)
    line = re.sub(r"(\d)\s?[.,]\s?[.,]\s?(\d{2})(?!\d)", r"\1,\2", line)  # "0.,79" -> "0,79"
    line = re.sub(r"[ ]{2,}", "  ", line).strip()
    if _letters(line) >= 3 and not re.search(r"kg|/", line, re.IGNORECASE):
        line = _GLUED_VAT.sub(r"\1 \2", line)
    return line


def _looks_like_total_word(line: str) -> bool:
    """Fuzzy match for a misread "SUMME" at the start of a line ("SUBIE", "5UMME", "SUMHE")."""
    m = re.match(r"\s*([A-Za-z0-9ÄÖÜäöü]{4,6})\b", line)
    if not m:
        return False
    word = m.group(1).lower()
    return difflib.SequenceMatcher(None, word, "summe").ratio() >= 0.6 and word[0] in "s5"


# ---------------------------------------------------------------------------
# Line classification
# ---------------------------------------------------------------------------

# Amount at the very end of a line, optionally followed by a VAT code (A, B,
# 1, 2, AW, *, ...) or a trailing minus for negative amounts.
_TRAILING_AMOUNT = re.compile(
    r"^(?P<desc>.*?)\s*(?:EUR\s*)?(?P<amount>-?\s?\d{1,4}\s?[,.]\s?\d{2})\s*(?P<neg>-)?"
    r"\s*(?:\*?\s*[A-Za-z]{1,2}\d?|\d|\*)?\s*$"
)
# The VAT code is sometimes glued to the amount and misread as a digit
# ("3,87B" -> "3,878", "1,29A" -> "1,294").
_GLUED_VAT = re.compile(r"(?<![\d,.])(\d{1,4}[,.]\d{2})([0-9])\s*$")

# "2 Stk x 1,99", "2 x 1,99   3,98 B", "2 St * 1,99"
_QTY_LINE = re.compile(
    r"^(?P<qty>\d{1,3})\s*(?:stk?\.?|stck\.?|st\.?|pck\.?)?\s*[xX×*zZ]\s*(?:EUR\s*)?"
    r"(?P<unit>\d{1,4}\s?[,.]\s?\d{2})(?:\s*(?:EUR)?(?:/\s*stk?\.?)?)?"
    r"(?:\s+(?P<total>\d{1,4}\s?[,.]\s?\d{2})\s*(?:[A-Za-z]{1,2}\d?|\d|\*)?)?\s*$",
    re.IGNORECASE,
)

# Garbled quantity line: "3x 0,9", "3  22,29", "3x2: 1,5" (quantity is trusted,
# the unit price is derived from the item's line total).
_LOOSE_QTY_LINE = re.compile(
    r"^(?P<qty>[1-9]\d?)(?:\s*(?:stk?|st)\.?)?(?:\s*[xX×*zZ:]\s*|\s+)(?P<rest>\d[\d\s,.:]*)$",
    re.IGNORECASE,
)

# Quantity line whose "2 Stk" part is garbled: "ZSUR x 1,39", "ZSCRNX 1,95".
_GARBLED_QTY_LINE = re.compile(
    r"^(?P<pre>[0-9ZzS][A-Za-z0-9]{0,6}?)\s*[xX×]\s+(?P<unit>\d{1,4}\s?[,.]\s?\d{2})\s*$"
)

# "0,456 kg x 2,99 EUR/kg", "1,234 kg * 0,99 €/kg  1,22 A", "Handeingabe E-Bon 0,345 kg"
_WEIGHT_LINE = re.compile(
    r"(?P<weight>\d{1,3}[,.]\d{1,3})\s*kg\s*[xX×*@]\s*(?:EUR\s*)?(?P<unit>\d{1,4}\s?[,.]\s?\d{2})"
    r"\s*(?:EUR)?\s*/\s*kg(?:\s+(?P<total>\d{1,4}\s?[,.]\s?\d{2}))?",
    re.IGNORECASE,
)

_TOTAL_KEYWORDS = re.compile(
    r"^\s*(?:summe|sunme|surme|sumne|suwme|5umme|gesamt(?:summe|betrag)?|endsumme|"
    r"zu\s*zahlen|zahlbetrag|total|betrag|bar\s*summe|zwischensumme|summe\s*eur)\b",
    re.IGNORECASE,
)
_SUBTOTAL = re.compile(r"zwischensumme|subtotal", re.IGNORECASE)

_PAYMENT_KEYWORDS = re.compile(
    r"\b(?:geg(?:eben|\.)?|bar|ec[\s-]?(?:cash|karte)|girocard|kartenzahlung|karte|visa|"
    r"mastercard|maestro|v\s?pay|kredit|r[üu]ckgeld|zur[üu]ck|paypal|apple\s?pay|google\s?pay|"
    r"kontaktlos)\b",
    re.IGNORECASE,
)

_DISCOUNT_KEYWORDS = re.compile(
    r"rabatt|preisvorteil|nachlass|coupon|gutschein|aktion|ersparnis|sofortrabatt|reduziert|"
    r"angebot|treuepunkte|payback|lidl\s?plus|rewe\s?bonus",
    re.IGNORECASE,
)

_DEPOSIT_KEYWORDS = re.compile(r"pfand|leergut|einweg|mehrweg", re.IGNORECASE)

# Lines that never describe a product even if they carry a number.
_NON_ITEM = re.compile(
    r"\b(?:mwst|ust|steuer|netto|brutto|"
    r"tse|transaktion|signatur|seriennummer|terminal|trace|beleg(?:nr|nummer)?|bon[\s-]?nr|"
    r"kasse|kassierer|bediener|filiale|markt\s*:|uid|st[\s.-]?nr|steuer[\s-]?nr|"
    r"tel(?:efon)?|fax|www|http|e-?mail|"
    r"datum|uhrzeit|vielen\s+dank|danke|wiedersehen|[öo]ffnungszeiten|"
    r"genehmigung|autorisierung|kundenbeleg|h[äa]ndlerbeleg|kartennr|pan|aid|vu[\s-]?nr|"
    r"punkte|gespart|kundennummer|zahlung\s+erfolgt|euro)\b",
    re.IGNORECASE,
)

_HEADER_EUR = re.compile(r"^\s*(?:eur|euro|€)\s*$", re.IGNORECASE)
_SEPARATOR = re.compile(r"^[\s\-=_*.~:+]{3,}$")

KNOWN_STORES = [
    ("REWE", r"r\s?e\s?w\s?e"),
    ("EDEKA", r"e\s?d\s?e\s?k\s?a"),
    ("ALDI", r"a\s?l\s?d\s?i"),
    ("LIDL", r"l\s?i\s?d\s?l"),
    ("Kaufland", r"kaufland"),
    ("Penny", r"penny"),
    ("Netto", r"netto\s+marken|netto\s+discount|netto(?=\s*$)|netto\s+city|netto\s+filiale|netto-online"),
    ("dm", r"dm[\s-]?drogerie|^\s*dm\s*$|dm\.de"),
    ("Rossmann", r"rossmann"),
    ("Müller", r"m[üu]ller\s+(?:drogerie|handels)|drogerie\s+m[üu]ller"),
    ("Real", r"^\s*real\s*[,-]?\s*$|real\s*gmbh|real,-"),
    ("Globus", r"globus"),
    ("Tegut", r"tegut"),
    ("Norma", r"norma"),
    ("HIT", r"^\s*hit\s*$|hit\s+markt|hit\s+handelsgruppe"),
    ("Famila", r"famila"),
    ("Marktkauf", r"marktkauf"),
    ("Combi", r"combi\s+verbrauchermarkt|^\s*combi\s*$"),
    ("Denns", r"denns"),
    ("Alnatura", r"alnatura"),
    ("Budni", r"budni"),
    ("Nahkauf", r"nahkauf"),
    ("Netto City", r"netto\s+city"),
    ("Action", r"^\s*action\s*$|action\s+deutschland"),
    ("IKEA", r"ikea"),
]

_STORE_NAMES_FUZZY = ["REWE", "EDEKA", "ALDI", "LIDL", "KAUFLAND", "PENNY", "NETTO", "ROSSMANN",
                      "GLOBUS", "TEGUT", "NORMA", "FAMILA", "MARKTKAUF", "ALNATURA"]


@dataclass
class Item:
    description: str
    price: float  # price per unit
    quantity: float = 1.0
    line_total: float = 0.0
    category: str = "Sonstiges"
    raw_line: str = ""

    def as_dict(self) -> dict:
        return {
            "description": self.description,
            "price": round(self.price, 2),
            "quantity": self.quantity,
            "line_total": round(self.line_total, 2),
            "category": self.category,
            "raw_line": self.raw_line,
        }


@dataclass
class ParsedReceipt:
    items: list[Item] = field(default_factory=list)
    total: Optional[float] = None
    store_name: Optional[str] = None
    date: Optional[date] = None
    time: Optional[str] = None
    payment_amount: Optional[float] = None
    discounts: float = 0.0

    @property
    def items_sum(self) -> float:
        return round(sum(i.line_total for i in self.items), 2)

    @property
    def sum_matches_total(self) -> bool:
        return self.total is not None and bool(self.items) and abs(self.items_sum - self.total) < 0.015


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clean_description(desc: str) -> str:
    desc = re.sub(r"\s+", " ", desc)
    # Leading article numbers / PLUs ("4011 Bananen", "123456 Milch").
    desc = re.sub(r"^\d{4,}\s+", "", desc)
    # Stray currency / VAT markers and OCR debris at the edges.
    desc = re.sub(r"\s+(?:EUR|€)$", "", desc, flags=re.IGNORECASE)
    desc = desc.strip(" .,:;-_*#'\"|~=")
    return desc


def _letters(text: str) -> int:
    return len(re.findall(r"[A-Za-zÄÖÜäöüß]", text))


def _is_description(text: str) -> bool:
    text = text.strip()
    return _letters(text) >= 3 and _letters(text) >= 0.4 * len(text.replace(" ", ""))


def _close(a: float, b: float, tol: float = 0.011) -> bool:
    return abs(a - b) <= tol


def _split_evenly(total: float, qty: float) -> Optional[float]:
    """Unit price if ``total`` splits into ``qty`` equal cent amounts."""
    cents, q = round(total * 100), int(qty)
    if q < 2 or q != qty or cents % q:
        return None
    return cents // q / 100


# ---------------------------------------------------------------------------
# Store / date
# ---------------------------------------------------------------------------


def detect_store(lines: list[str]) -> Optional[str]:
    header = lines[:10]
    for scope in (header, lines):
        for line in scope:
            low = line.lower()
            squashed = re.sub(r"\s+", " ", low).strip()
            for name, pattern in KNOWN_STORES:
                if re.search(r"(?<![a-zäöü])(?:" + pattern + r")(?![a-zäöü])", squashed):
                    return name
    # Fuzzy fallback for OCR errors in the header ("REWF", "L1DL").
    for line in header:
        for token in re.findall(r"[A-Za-z0-9ÄÖÜäöü]{4,}", line.replace(" ", "") if len(line) <= 12 else line):
            match = difflib.get_close_matches(token.upper(), _STORE_NAMES_FUZZY, n=1, cutoff=0.75)
            if match:
                name = match[0]
                for known, _ in KNOWN_STORES:
                    if known.upper() == name:
                        return known
                return name.title()
    return None


_DATE_PATTERNS = [
    re.compile(r"(?<!\d)(\d{1,2})\s?[./,-]\s?(\d{1,2})\s?[./,-]\s?(20\d{2})(?!\d)"),
    re.compile(r"(?<!\d)(20\d{2})-(\d{1,2})-(\d{1,2})(?!\d)"),
    re.compile(r"(?<!\d)(\d{1,2})\s?[./]\s?(\d{1,2})\s?[./]\s?(\d{2})(?![\d,])"),
]
_TIME_RE = re.compile(r"(?<!\d)([01]?\d|2[0-3])\s?:\s?([0-5]\d)(?::[0-5]\d)?(?!\d)")


def detect_date(lines: list[str], today: Optional[date] = None) -> tuple[Optional[date], Optional[str]]:
    today = today or date.today()
    candidates: list[tuple[int, date, Optional[str]]] = []
    for idx, line in enumerate(lines):
        for p_idx, pattern in enumerate(_DATE_PATTERNS):
            for m in pattern.finditer(line):
                a, b, c = (int(g) for g in m.groups())
                if p_idx == 1:
                    year, month, day = a, b, c
                else:
                    day, month, year = a, b, c
                    if year < 100:
                        year += 2000
                try:
                    d = date(year, month, day)
                except ValueError:
                    continue
                if not (2000 <= d.year <= today.year + 1) or (d - today).days > 1:
                    continue
                t = _TIME_RE.search(line[m.end():]) or _TIME_RE.search(line[: m.start()])
                time_str = f"{int(t.group(1)):02d}:{t.group(2)}" if t else None
                # Prefer dates that come with a time (the purchase timestamp) and 4-digit years.
                score = (2 if time_str else 0) + (1 if p_idx != 2 else 0)
                candidates.append((score, d, time_str))
    if not candidates:
        return None, None
    candidates.sort(key=lambda c: -c[0])
    return candidates[0][1], candidates[0][2]


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------


def parse_receipt(text: str, today: Optional[date] = None) -> ParsedReceipt:
    raw_lines = [normalize_line(line) for line in text.splitlines()]
    lines = [line for line in raw_lines if line]
    result = ParsedReceipt()
    result.store_name = detect_store(lines)
    result.date, result.time = detect_date(lines, today)

    items: list[Item] = []
    pending_desc: Optional[str] = None  # description line without a price
    # Quantity line not yet attached: (qty, unit price or None, raw unit text, item above it)
    pending_qty: Optional[tuple[float, Optional[float], str, Optional[Item]]] = None
    last_item: Optional[Item] = None
    total_candidates: list[float] = []
    payment_candidates: list[float] = []
    in_footer = False

    def resolve_pending_qty(next_item: Optional[Item]) -> None:
        """Attach a quantity line ("3 x 1,99") to the neighbouring item it belongs to.

        The line sits below its item on REWE/Lidl receipts and above it on
        ALDI/EDEKA receipts. When OCR garbled the unit price, the quantity is
        still trusted if the item's line total divides evenly by it; the item
        whose implied unit price looks most like the OCR text wins.
        """
        nonlocal pending_qty
        if not pending_qty:
            return
        qty, unit, unit_text, prev_item = pending_qty
        pending_qty = None
        options = [it for it in (next_item, prev_item) if it is not None and it.quantity == 1]
        for it in options:
            if unit is not None and _close(qty * unit, it.line_total):
                it.quantity, it.price = qty, unit
                return
        # Quantity misread but unit price fine: the line total is a clean multiple of it.
        if unit:
            for it in options:
                n = round(it.line_total / unit)
                if 2 <= n <= 50 and _close(n * unit, it.line_total, 0.005):
                    it.quantity, it.price = float(n), unit
                    return
        if qty < 2:
            return
        best, best_sim = None, -1.0
        for it in options:
            implied = _split_evenly(it.line_total, qty)
            if implied is None:
                continue
            sim = difflib.SequenceMatcher(None, re.sub(r"\D", "", unit_text),
                                          f"{implied:.2f}".replace(".", "")).ratio()
            if sim > best_sim:
                best, best_sim = it, sim
        if best is not None and best_sim >= 0.4:
            best.quantity, best.price = qty, _split_evenly(best.line_total, qty)

    def add_item(desc: str, line_total: float, raw: str, qty: float = 1, unit: Optional[float] = None) -> Item:
        nonlocal last_item
        desc = _clean_description(desc)
        item = Item(description=desc, price=unit if unit is not None else line_total, quantity=qty,
                    line_total=line_total, category=categorize_item(desc), raw_line=raw)
        items.append(item)
        resolve_pending_qty(item)
        last_item = item
        return item

    def apply_quantity(item: Item, qty: float, unit: float) -> bool:
        if qty >= 1 and _close(qty * unit, item.line_total):
            item.quantity, item.price = qty, unit
            return True
        return False

    for line in lines:
        if _SEPARATOR.match(line) or _HEADER_EUR.match(line):
            continue
        low = line.lower()

        trailing = _TRAILING_AMOUNT.match(line)
        amount = None
        if trailing:
            amount = _num(trailing.group("amount"))
            if trailing.group("neg"):
                amount = -abs(amount)

        # --- totals and the footer ------------------------------------------------
        is_total = _TOTAL_KEYWORDS.search(line) or (amount is not None and (
            _looks_like_total_word(line)
            # Items never print the currency in front of their price; totals do ("SUMME EUR 9,99").
            or (items and re.search(r"(?:\bEUR|£uN?|\bEUN)\s*\d{1,4}\s?[,.]\s?\d{2}\D{0,3}$", line, re.IGNORECASE)
                and not _PAYMENT_KEYWORDS.search(line))))
        if is_total and not _SUBTOTAL.search(line):
            resolve_pending_qty(None)
            if amount is not None and amount > 0:
                total_candidates.append(amount)
            in_footer = True
            pending_desc = None
            continue
        if _SUBTOTAL.search(line):
            continue
        if in_footer:
            if amount is not None and amount > 0 and _PAYMENT_KEYWORDS.search(line):
                payment_candidates.append(amount)
            continue
        if _PAYMENT_KEYWORDS.search(line) and amount is not None and items:
            # Payment line without a preceding "Summe" line.
            payment_candidates.append(amount)
            in_footer = True
            continue

        # --- weight lines -----------------------------------------------------------
        weight = _WEIGHT_LINE.search(line)
        if weight:
            w, unit = _num(weight.group("weight")), _num(weight.group("unit"))
            computed = round(w * unit, 2)
            explicit = _num(weight.group("total")) if weight.group("total") else None
            desc_part = _clean_description(line[: weight.start()])
            if explicit is not None or (pending_desc and not last_item):
                desc = desc_part if _is_description(desc_part) else (pending_desc or "Waage-Artikel")
                add_item(desc, explicit if explicit is not None else computed, line)
                pending_desc = None
            elif last_item and abs(last_item.line_total - computed) <= 0.02:
                pass  # weight detail of the item above; price already correct
            elif pending_desc:
                add_item(pending_desc, computed, line)
                pending_desc = None
            continue

        # --- quantity lines ------------------------------------------------------
        qty_match = _QTY_LINE.match(line)
        if qty_match:
            qty = float(qty_match.group("qty"))
            unit = _num(qty_match.group("unit"))
            total = _num(qty_match.group("total")) if qty_match.group("total") else None
            if total is not None and pending_desc:
                # REWE style: description on the line above, prices on this line.
                add_item(pending_desc, total, line, qty, unit if _close(qty * unit, total) else total / qty)
                pending_desc = None
            elif last_item and apply_quantity(last_item, qty, unit):
                pass  # detail line below the item (REWE/Lidl)
            elif total is not None and last_item and _close(last_item.line_total, total) and qty >= 1:
                last_item.quantity, last_item.price = qty, round(total / qty, 2)
            else:
                # Detail line above its item (ALDI/EDEKA) or with a misread unit price.
                resolve_pending_qty(None)
                pending_qty = (qty, unit, qty_match.group("unit"), last_item)
            continue

        garbled = _GARBLED_QTY_LINE.match(line)
        if garbled:
            resolve_pending_qty(None)
            qty_char = garbled.group("pre")[0].translate(_DIGIT_LOOKALIKES)
            pending_qty = (float(qty_char) if qty_char.isdigit() and qty_char != "0" else 0.0,
                           _num(garbled.group("unit")), garbled.group("unit"), last_item)
            pending_desc = None
            continue

        loose = _LOOSE_QTY_LINE.match(line)
        if loose and _letters(line) <= 4:
            resolve_pending_qty(None)
            pending_qty = (float(loose.group("qty")), None, loose.group("rest"), last_item)
            pending_desc = None
            continue

        # --- discounts / deposit ------------------------------------------------
        if amount is not None and (amount < 0 or _DISCOUNT_KEYWORDS.search(line)):
            value = abs(amount)
            if _DEPOSIT_KEYWORDS.search(line):
                # Leergut returns are credited on the receipt and reduce the total.
                result.discounts += value
            elif last_item and last_item.line_total - value > 0:
                last_item.line_total = round(last_item.line_total - value, 2)
                last_item.price = round(last_item.line_total / last_item.quantity, 2)
                result.discounts += value
            else:
                result.discounts += value
            pending_desc = None
            continue

        # --- regular items -----------------------------------------------------
        if trailing and amount is not None and amount > 0:
            desc = trailing.group("desc")
            if _NON_ITEM.search(desc) or re.match(r"^\s*\d{5}\s", desc):
                pending_desc = None
                continue
            if _is_description(desc):
                add_item(desc, amount, line)
                pending_desc = None
                continue
            if pending_desc and _letters(desc) == 0:
                # Price on its own line below the description.
                add_item(pending_desc, amount, line)
                pending_desc = None
                continue
            pending_desc = None
            continue

        # --- lines without an amount ---------------------------------------------
        if _NON_ITEM.search(line) or re.match(r"^\s*\d{5}\s", line):
            pending_desc = None
            continue
        if _is_description(line):
            pending_desc = line
        else:
            pending_desc = None

    resolve_pending_qty(None)

    # A misread "Summe" line ends up as an item whose amount equals the sum of all
    # items before it. Everything from there on is footer.
    if not total_candidates:
        running = 0.0
        for idx, item in enumerate(items):
            if idx >= 2 and _close(item.line_total, running, 0.015):
                total_candidates.append(item.line_total)
                items = items[:idx]
                break
            running += item.line_total

    # Pick the total: the first "Summe"-like amount, cross-checked with the items.
    items_sum = round(sum(i.line_total for i in items), 2)
    total = None
    for cand in total_candidates:
        if items and _close(cand, items_sum, 0.015):
            total = cand
            break
    if total is None and total_candidates:
        total = total_candidates[0]
    if total is None and payment_candidates:
        matching = [p for p in payment_candidates if items and _close(p, items_sum, 0.015)]
        # The amount paid by card equals the total; cash "Gegeben" may be higher.
        total = matching[0] if matching else min(payment_candidates)
    if total is None and items:
        total = items_sum
    if total is not None and items and not _close(total, items_sum, 0.015):
        # A digit of the total may be misread; trust the payment line if it agrees with the items.
        for p in payment_candidates:
            if _close(p, items_sum, 0.015):
                total = p
                break

    result.items = items
    result.total = total
    result.payment_amount = payment_candidates[0] if payment_candidates else None
    return result


def to_response(parsed: ParsedReceipt) -> dict:
    return {
        "items": [i.as_dict() for i in parsed.items],
        "total": parsed.total,
        "store_name": parsed.store_name,
        "date": parsed.date.isoformat() if parsed.date else None,
        "time": parsed.time,
        "items_sum": parsed.items_sum,
        "sum_matches_total": parsed.sum_matches_total,
    }
