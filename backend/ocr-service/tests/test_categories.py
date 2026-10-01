import pytest

from categories import categorize_item


@pytest.mark.parametrize("description, category", [
    ("Basmati Reis", "Nudeln, Reis & Getreide"),  # "eis" must not make it ice cream
    ("Kartoffelchips", "Snacks & Knabbereien"),   # head of the compound wins
    ("Hähnchenbrust", "Fleisch & Wurst"),
    ("Geflügelwurst", "Fleisch & Wurst"),         # not "gel" -> Drogerie
    ("SPRUEHSAHNE 20%", "Milchprodukte"),          # printer umlauts
    ("Eisbergsalat", "Obst & Gemüse"),
    ("Paprika rot", "Obst & Gemüse"),
    ("Spaghetti 500g", "Nudeln, Reis & Getreide"),
    ("Zahnpasta", "Drogerie & Pflege"),
    ("SCHOKOL.ZARTB.", "Süßwaren"),                # abbreviation
    ("Pfand", "Pfand"),
    ("XYZ 123", "Sonstiges"),
    ("", "Sonstiges"),
])
def test_categorize(description, category):
    assert categorize_item(description) == category
