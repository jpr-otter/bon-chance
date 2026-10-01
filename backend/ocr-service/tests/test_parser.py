from datetime import date

import pytest

from receipt_parser import detect_store, normalize_line, parse_receipt

TODAY = date(2026, 1, 31)


def items(parsed):
    return [(i.description, i.quantity, i.price) for i in parsed.items]


def test_rewe_layout_quantity_below_item():
    text = """
        R E W E
   REWE Markt GmbH
  80331 München
                                 EUR
SPAGHETTI 500G                  0,99 B
SCHOKOLADE ZARTBITTER           4,47 B
  3 Stk x  1,49
SPRUEHSAHNE 20%
  2 Stk x 0,99   1,98 B
--------------------------------
SUMME                     EUR 7,44
Geg. EC-Cash              EUR 7,44
B=  7,0%  6,95   0,49
14.01.2026  14:32   Bon-Nr.:4711
"""
    p = parse_receipt(text, TODAY)
    assert items(p) == [
        ("SPAGHETTI 500G", 1, 0.99),
        ("SCHOKOLADE ZARTBITTER", 3, 1.49),
        ("SPRUEHSAHNE 20%", 2, 0.99),
    ]
    assert p.total == 7.44
    assert p.sum_matches_total
    assert p.store_name == "REWE"
    assert p.date == date(2026, 1, 14)
    assert p.time == "14:32"


def test_aldi_layout_quantity_above_item():
    text = """ALDI SÜD
Bananen            1,29 A
   3 x  2,29
Butter 250g        6,87 A
Summe             8,16
Gegeben Girocard  8,16
"""
    p = parse_receipt(text, TODAY)
    assert items(p) == [("Bananen", 1, 1.29), ("Butter 250g", 3, 2.29)]
    assert p.total == 8.16


def test_weight_discount_and_deposit():
    text = """LIDL
Bananen
 0,834 kg x 1,49 EUR/kg     1,24 A
Mineralwasser               0,98 A
Preisvorteil               -0,30
Pfand                       0,50 A
zu zahlen                   2,42
Kartenzahlung               2,42
"""
    p = parse_receipt(text, TODAY)
    assert items(p) == [("Bananen", 1, 1.24), ("Mineralwasser", 1, 0.68), ("Pfand", 1, 0.5)]
    assert p.total == 2.42
    assert p.sum_matches_total


def test_footer_lines_are_not_items():
    text = """EDEKA
Milch          1,15 A
SUMME          1,15
MwSt 7%  1,07  0,08
Kartenzahlung  1,15
Terminal-ID 12345678  0,00
"""
    p = parse_receipt(text, TODAY)
    assert items(p) == [("Milch", 1, 1.15)]
    assert p.store_name == "EDEKA"


@pytest.mark.parametrize("raw, expected", [
    ("BANANEN  3,878", "BANANEN  3,87 8"),   # glued VAT code
    ("GURKE 0.,79B", "GURKE 0,79B"),         # doubled separator
    ("Milch  1,O9 A", "Milch  1,09 A"),      # letter O instead of zero
])
def test_normalize_line(raw, expected):
    assert normalize_line(raw) == expected


def test_ocr_noise_recovery():
    text = """REWE
SPAGHETTI 500G   0,99 B
ZAHNPASTA        3,90 B
ZSCRNX 1,95
BANANEN          3,878
3 Stk z  1,29
SUBIE un 8,76
Geg. EC Casn  EUR 8,76
"""
    p = parse_receipt(text, TODAY)
    assert items(p) == [("SPAGHETTI 500G", 1, 0.99), ("ZAHNPASTA", 2, 1.95), ("BANANEN", 3, 1.29)]
    assert p.total == 8.76


def test_garbled_quantity_uses_line_total():
    text = """ALDI
Eier Freiland 10St  3,29 A
3x 0,9
Spaghetti 500g  2,97 A
Summe  6,26
"""
    p = parse_receipt(text, TODAY)
    assert items(p) == [("Eier Freiland 10St", 1, 3.29), ("Spaghetti 500g", 3, 0.99)]


def test_future_dates_are_ignored():
    p = parse_receipt("Milch 1,15\nSUMME 1,15\n24.12.2099 10:00\n03.01.2026", TODAY)
    assert p.date == date(2026, 1, 3)


@pytest.mark.parametrize("lines, store", [
    (["R E W E", "Markt GmbH"], "REWE"),
    (["dm-drogerie markt"], "dm"),
    (["Schnitzel 4,99"], None),          # "hit" inside words is not a store
    (["Whisky 19,99"], None),
    (["LIDL"], "LIDL"),
])
def test_detect_store(lines, store):
    assert detect_store(lines) == store
