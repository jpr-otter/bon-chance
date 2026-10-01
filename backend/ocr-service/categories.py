"""Keyword based product categorisation for German supermarket receipts."""

from __future__ import annotations

import re

CATEGORY_KEYWORDS = {
    "Obst & Gemüse": [
        # Früchte
        "apfel", "äpfel", "birne", "banane", "orange", "mandarine", "clementine",
        "zitrone", "limette", "grapefruit", "kiwi", "mango", "ananas", "melone",
        "wassermelone", "honigmelone", "erdbeere", "himbeere", "blaubeere", "heidelbeere",
        "brombeere", "johannisbeere", "kirsche", "pflaume", "pfirsich", "nektarine",
        "aprikose", "traube", "weintraube", "granatapfel", "feige", "dattel",
        "avocado", "papaya", "litschi", "maracuja", "passionsfrucht",
        # Gemüse
        "tomate", "tomaten", "gurke", "salat", "kopfsalat", "eisbergsalat", "feldsalat",
        "rucola", "spinat", "mangold", "kohl", "rotkohl", "weißkohl", "wirsing",
        "blumenkohl", "brokkoli", "rosenkohl", "kohlrabi", "sellerie", "stangensellerie",
        "karotte", "möhre", "möhren", "pastinake", "rote bete", "radieschen", "rettich",
        "zwiebel", "knoblauch", "lauch", "porree", "frühlingszwiebel",
        "paprika", "gemüsepaprika", "spitzpaprika", "chili", "peperoni", "zucchini", "aubergine", "kürbis",
        "kartoffel", "kartoffeln", "süßkartoffel", "batate",
        "bohne", "bohnen", "erbse", "erbsen", "linse", "linsen",
        "mais", "champignon", "pilz", "pilze", "pfifferling", "steinpilz",
        "spargel", "fenchel", "artischocke", "chicorée",
        "ingwer", "kurkuma", "petersilie", "schnittlauch", "basilikum", "dill",
        "koriander", "minze", "thymian", "rosmarin", "oregano", "salbei",
        # Bio/Sorten - be careful with these, they can match too broadly
        "gemüse", "frucht", "obst",
    ],
    
    "Milchprodukte": [
        "milch", "vollmilch", "fettarm", "h-milch", "frischmilch", "laktosefrei",
        "käse", "scheibenkäse", "streukäse", "reibekäse", "frischkäse", "schmelzkäse",
        "gouda", "emmentaler", "cheddar", "mozzarella", "parmesan", "feta", "camembert",
        "brie", "edamer", "tilsiter", "bergkäse", "butterkäse", "raclette",
        "butter", "margarine", "süßrahm", "sauerrahm",
        "sahne", "schlagsahne", "sprühsahne", "kaffeesahne", "schmand", "creme fraiche",
        "joghurt", "naturjoghurt", "fruchtjoghurt", "skyr", "quark", "topfen",
        "pudding", "grieß", "milchreis",
        "buttermilch", "kefir", "ayran", "molke",
        "ei", "eier", "freiland", "bodenhaltung",
    ],
    
    "Fleisch & Wurst": [
        "fleisch", "hackfleisch", "gehacktes", "mett", "tatar",
        "rind", "rindfleisch", "roastbeef", "steak", "filet", "gulasch", "roulade",
        "schwein", "schweinefleisch", "schnitzel", "kotelett", "kassler", "eisbein",
        "hähnchen", "huhn", "hühnchen", "geflügel", "pute", "truthahn", "ente", "gans",
        "lamm", "lammfleisch", "kalb", "kalbfleisch",
        "wurst", "würstchen", "wiener", "bockwurst", "bratwurst", "currywurst",
        "salami", "schinken", "kochschinken", "rohschinken", "speck", "bacon",
        "mortadella", "leberwurst", "teewurst", "mettwurst", "streichwurst",
        "aufschnitt", "lyoner", "gelbwurst", "bierschinken", "jagdwurst",
        "frikadelle", "boulette", "klops", "cordon bleu",
    ],
    
    "Fisch & Meeresfrüchte": [
        "fisch", "lachs", "lachsfilet", "forelle", "hering", "makrele", "thunfisch",
        "kabeljau", "seelachs", "alaska", "pangasius", "zander", "barsch", "dorade",
        "scholle", "rotbarsch", "heilbutt", "schellfisch", "sardine", "sardelle",
        "räucherfisch", "räucherlachs", "matjes", "bismarckhering",
        "garnele", "shrimp", "scampi", "krebs", "hummer", "muschel", "tintenfisch",
        "calamari", "meeresfrüchte", "surimi", "krabben", "fischstäbchen",
    ],
    
    "Backwaren": [
        "brot", "brötchen", "semmel", "weck", "schrippe",
        "toast", "toastbrot", "sandwich", "ciabatta", "baguette",
        "vollkorn", "roggen", "dinkel", "weizen", "mehrkorn", "körner",
        "croissant", "brioche", "laugenstange", "brezel", "laugenbrezel",
        "kuchen", "torte", "muffin", "donut", "berliner", "krapfen",
        "plunder", "teilchen", "hörnchen",
        "mehl", "hefe", "backpulver", "backmischung",
    ],
    
    "Getränke": [
        "wasser", "mineralwasser", "sprudel", "still", "medium", "classic",
        "saft", "orangensaft", "apfelsaft", "traubensaft", "multivitamin",
        "nektar", "schorle", "apfelschorle",
        "limo", "limonade", "cola", "fanta", "sprite", "pepsi", "mezzo",
        "eistee", "ice tea", "energy", "red bull", "monster",
        "bier", "pils", "weizen", "hefeweizen", "alkoholfrei", "radler",
        "wein", "rotwein", "weißwein", "rosé", "sekt", "prosecco", "champagner",
        "schnaps", "wodka", "whisky", "rum", "gin", "likör",
        "kaffee", "espresso", "cappuccino", "latte", "cafe",
        "tee", "früchtetee", "kräutertee", "schwarztee", "grüntee",
        "kakao", "trinkschokolade",
        "smoothie", "shake", "drink", "getränk",
    ],
    
    "Süßwaren": [
        "schokolade", "schoko", "vollmilchschoko", "zartbitter", "weiße schoko",
        "praline", "riegel", "mars", "snickers", "twix", "bounty", "kitkat",
        "milka", "ritter", "lindt", "kinder", "hanuta", "duplo",
        "gummibär", "gummibärchen", "haribo", "weingummi", "lakritz", "lakritze",
        "bonbon", "lutscher", "lolly", "kaugummi", "vanille", "vanillin",
        "keks", "cookie", "plätzchen", "waffel", "prinzenrolle", "oreo",
        "eis", "eiscreme", "magnum", "cornetto", "langnese",
        "marzipan", "nougat", "karamell", "toffee",
        "zucker", "kandis", "puderzucker", "vanillezucker",
        "marmelade", "konfitüre", "gelee", "honig", "nutella", "nougatcreme",
    ],
    
    "Snacks & Knabbereien": [
        "chips", "kartoffelchips", "stapelchips", "pringles",
        "salzstangen", "brezel", "laugenstange", "cracker",
        "erdnuss", "erdnüsse", "nüsse", "cashew", "mandel", "walnuss", "haselnuss",
        "nussmischung", "studentenfutter", "trail mix",
        "popcorn", "nachos", "tortilla", "flips", "pombär",
        "knabber", "snack", "party",
    ],
    
    "Konserven & Fertiggerichte": [
        "dose", "konserve", "dosentomaten", "tomatenmark", "passata",
        "erbsen", "mais", "bohnen", "kidneybohnen", "kichererbsen",
        "suppe", "eintopf", "ravioli", "miracoli",
        "fertiggericht", "tiefkühl", "tk", "pizza", "lasagne",
        "fischstäbchen", "schnitzel", "nuggets", "pommes", "kroketten",
        "gemüsepfanne", "wok", "asia",
    ],
    
    "Nudeln, Reis & Getreide": [
        "nudel", "pasta", "spaghetti", "penne", "fusilli", "farfalle", "rigatoni",
        "tagliatelle", "linguine", "tortellini", "ravioli", "gnocchi",
        "reis", "basmati", "jasmin", "langkorn", "risotto", "milchreis",
        "couscous", "bulgur", "quinoa", "hirse", "polenta", "graupen",
        "haferflocken", "cornflakes", "müsli", "cerealien", "frühstück",
    ],
    
    "Gewürze & Saucen": [
        "gewürz", "salz", "pfeffer", "paprikapulver", "paprika edelsüß", "curry", "kurkuma",
        "zimt", "nelke", "muskat", "oregano", "basilikum", "thymian",
        "sauce", "soße", "ketchup", "mayonnaise", "mayo", "senf", "remoulade",
        "dressing", "vinaigrette", "essig", "balsamico",
        "öl", "olivenöl", "sonnenblumenöl", "rapsöl",
        "pesto", "ajvar", "harissa", "sriracha", "tabasco",
        "brühe", "bouillon", "fond", "würze", "maggi",
    ],
    
    "Haushalt": [
        "waschmittel", "weichspüler", "fleckentferner",
        "spülmittel", "geschirrspül", "tabs", "klarspüler", "spülmaschinensalz",
        "allzweck", "reiniger", "glasreiniger", "badreiniger", "wc-reiniger",
        "müllbeutel", "müllsack", "abfallbeutel",
        "alufolie", "frischhalte", "backpapier", "gefrierbeutel",
        "küchentuch", "küchenpapier", "taschentuch", "toilettenpapier", "klopapier",
        "schwamm", "lappen", "tuch", "bürste",
        "kerze", "feuerzeug", "streichholz",
        "batterie", "glühbirne", "leuchtmittel",
    ],
    
    "Drogerie & Pflege": [
        "shampoo", "spülung", "conditioner", "haarkur", "haarspray", "gel",
        "duschgel", "duschbad", "seife", "handseife", "flüssigseife",
        "creme", "lotion", "bodylotion", "handcreme", "gesichtscreme",
        "zahnpasta", "zahnbürste", "zahnseide", "mundspülung",
        "deodorant", "deo", "antitranspirant",
        "rasierer", "rasierschaum", "rasiergel", "aftershave",
        "damenhygiene", "tampons", "binden", "slipeinlagen",
        "windel", "feuchttücher", "babypflege",
        "make-up", "mascara", "lippenstift", "nagellack",
        "parfüm", "eau de toilette", "duft",
        "pflaster", "verband", "medizin", "schmerz", "kopfschmerz",
    ],
    
    "Pfand": [
        "pfand", "einwegpfand", "mehrwegpfand", "leergut",
    ],

    "Tierbedarf": [
        "katzenfutter", "hundefutter", "tierfutter",
        "whiskas", "sheba", "felix", "pedigree", "chappi",
        "streu", "katzenstreu",
        "hund", "katze", "tier", "haustier",
    ],
}

# Priority order for category matching - more specific categories first
CATEGORY_PRIORITY = [
    "Pfand",
    "Tierbedarf",          # Very specific keywords
    "Drogerie & Pflege",   # Specific product types
    "Haushalt",            # Specific product types
    "Fisch & Meeresfrüchte",
    "Fleisch & Wurst",
    "Snacks & Knabbereien", # Before Obst & Gemüse (chips vs paprika)
    "Süßwaren",
    "Getränke",
    "Milchprodukte",       # Before Obst & Gemüse (bio milch)
    "Backwaren",
    "Konserven & Fertiggerichte",
    "Nudeln, Reis & Getreide",
    "Gewürze & Saucen",
    "Obst & Gemüse",       # Last because has broad keywords like "bio"
]


DEFAULT_CATEGORY = "Sonstiges"

_UMLAUTS = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})


def _normalize(text: str) -> str:
    # Receipt printers often write umlauts as "ae"/"oe"/"ue" (SPRUEHSAHNE).
    return text.lower().translate(_UMLAUTS)


# Match quality: an exact word beats the head of a compound word
# ("Kartoffelchips" is chips, not potatoes), which beats the modifier of a
# compound ("Hähnchenbrust"), which beats an abbreviation ("SCHOKOL.").
_EXACT, _SUFFIX, _PREFIX, _ABBREV = 4, 3, 2, 1
_PRIORITY_RANK = {name: i for i, name in enumerate(CATEGORY_PRIORITY)}
_KEYWORDS = [
    (_normalize(kw).strip(), category)
    for category, keywords in CATEGORY_KEYWORDS.items()
    for kw in keywords
    if kw.strip()
]


def _match_quality(keyword: str, tokens: list[str], text: str) -> int:
    if " " in keyword or "-" in keyword:
        return _EXACT if re.search(r"(?<![a-z])" + re.escape(keyword) + r"(?![a-z])", text) else 0
    best = 0
    for token in tokens:
        if token == keyword:
            return _EXACT
        if len(keyword) >= 4 and len(token) > len(keyword):
            if token.endswith(keyword):
                best = max(best, _SUFFIX)
            elif token.startswith(keyword):
                best = max(best, _PREFIX)
        elif len(token) >= 4 and len(keyword) > len(token) and keyword.startswith(token):
            best = max(best, _ABBREV)
    return best


def categorize_item(description: str) -> str:
    """Return the most specific category for a product description."""
    if not description:
        return DEFAULT_CATEGORY
    text = _normalize(description)
    tokens = re.findall(r"[a-z]+", text)
    if not tokens:
        return DEFAULT_CATEGORY

    best_key = None
    best_category = DEFAULT_CATEGORY
    for keyword, category in _KEYWORDS:
        quality = _match_quality(keyword, tokens, text)
        if not quality:
            continue
        key = (quality, len(keyword), -_PRIORITY_RANK.get(category, len(_PRIORITY_RANK)))
        if best_key is None or key > best_key:
            best_key, best_category = key, category
    return best_category
