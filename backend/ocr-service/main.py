from fastapi import FastAPI, UploadFile, File, HTTPException
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import pytesseract
import io
import logging
import re
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# ============================================================================
# CATEGORY MAPPING - German Supermarket Products
# ============================================================================

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
        "gemüsepaprika", "spitzpaprika", "chili", "peperoni", "zucchini", "aubergine", "kürbis",
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
        "eier", "eier ", " eier", "freiland", "bodenhaltung",
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
        "suppe", "eintopf", "ravioli", "spaghetti", "miracoli",
        "fertiggericht", "tiefkühl", "tk ", " tk", "pizza", "lasagne",
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
        "gewürz", "salz", "pfeffer", "paprika", "curry", "kurkuma",
        "zimt", "nelke", "muskat", "oregano", "basilikum", "thymian",
        "sauce", "soße", "ketchup", "mayonnaise", "mayo", "senf", "remoulade",
        "dressing", "vinaigrette", "essig", "balsamico",
        "öl", "olivenöl", "sonnenblumenöl", "rapsöl",
        "pesto", "ajvar", "harissa", "sriracha", "tabasco",
        "brühe", "bouillon", "fond", "würze", "maggi",
    ],
    
    "Haushalt": [
        "waschmittel", "weichspüler", "fleckentferner",
        "spülmittel", "geschirrspül", "tabs", "klarspüler", "salz",
        "allzweck", "reiniger", "glasreiniger", "badreiniger", "wc-reiniger",
        "müllbeutel", "müllsack", "abfallbeutel",
        "alufolie", "frischhalte", "backpapier", "gefrierbeutel",
        "küchentuch", "küchenpapier", "taschentuch", "toilettenpapier", "klopapier",
        "schwamm", "lappen", "tuch", "bürste",
        "kerze", "feuerzeug", "streichholz",
        "batterie", "birne", "glühbirne",
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
    
    "Tierbedarf": [
        "katzenfutter", "hundefutter", "tierfutter",
        "whiskas", "sheba", "felix", "pedigree", "chappi",
        "streu", "katzenstreu",
        "hund", "katze", "tier", "haustier",
    ],
}

# Priority order for category matching - more specific categories first
CATEGORY_PRIORITY = [
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

def categorize_item(description: str) -> str:
    """
    Categorize a product based on its description using keyword matching.
    Returns the category name or 'Sonstiges' if no match found.
    """
    if not description:
        return "Sonstiges"
    
    desc_lower = description.lower()
    
    # Check categories in priority order
    for category in CATEGORY_PRIORITY:
        if category not in CATEGORY_KEYWORDS:
            continue
        keywords = CATEGORY_KEYWORDS[category]
        for keyword in keywords:
            # Check for exact word match or substring
            if keyword in desc_lower:
                return category
    
    return "Sonstiges"

def preprocess_image(image: Image.Image) -> Image.Image:
    """Preprocess image for better OCR results on receipts"""
    
    # Auto-rotate based on EXIF data (phone photos are often rotated)
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:
        pass
    
    # Convert to RGB first if needed (handles RGBA, P mode etc.)
    if image.mode not in ('RGB', 'L'):
        image = image.convert('RGB')
    
    # Convert to grayscale
    if image.mode != 'L':
        image = image.convert('L')
    
    # Get image dimensions - resize if too small
    width, height = image.size
    if width < 1000:
        # Scale up for better OCR
        scale = 1500 / width
        new_width = int(width * scale)
        new_height = int(height * scale)
        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        logger.info(f"Scaled image from {width}x{height} to {new_width}x{new_height}")
    
    # Mild contrast enhancement (not too aggressive)
    enhancer = ImageEnhance.Contrast(image)
    image = enhancer.enhance(1.5)
    
    # Mild sharpening
    enhancer = ImageEnhance.Sharpness(image)
    image = enhancer.enhance(1.3)
    
    # Use adaptive thresholding via numpy for better results
    try:
        img_array = np.array(image)
        # Simple Otsu-like thresholding
        threshold = np.mean(img_array)
        # Make it slightly more aggressive towards white
        threshold = threshold * 0.9
        img_array = np.where(img_array > threshold, 255, 0).astype(np.uint8)
        image = Image.fromarray(img_array)
    except Exception as e:
        logger.warning(f"Numpy processing failed, using simple threshold: {e}")
        # Fallback to simple threshold
        image = image.point(lambda p: 255 if p > 127 else 0)
    
    return image


def preprocess_image_simple(image: Image.Image) -> Image.Image:
    """Simple preprocessing - just convert and maybe resize"""
    try:
        image = ImageOps.exif_transpose(image)
    except Exception:
        pass
    
    if image.mode not in ('RGB', 'L'):
        image = image.convert('RGB')
    
    if image.mode != 'L':
        image = image.convert('L')
    
    # Scale if needed
    width, height = image.size
    if width < 1000:
        scale = 1500 / width
        image = image.resize((int(width * scale), int(height * scale)), Image.Resampling.LANCZOS)
    
    return image

def parse_receipt_items(text: str) -> list:
    """Parse individual line items from OCR text"""
    items = []
    lines = text.split('\n')
    
    # Skip keywords - lines containing these are not product items
    # Note: We use word boundaries where possible to avoid false positives
    skip_keywords = [
        'summe', 'sumke', 'sunme', 'suume',  # OCR variants of "Summe"
        'total', 'gesamt', 'mwst', 'steuer', 
        'ec-karte', 'ec karte', 'eckarte', 'visa', 'mastercard', 'maestro', 'girocard',
        'rückgeld', 'gegeben', 'zu zahlen', 'zahlbetrag',
        'bon-nr', 'bon nr', 'beleg', 'quittung',
        'datum', 'uhrzeit', 'zeit',
        'kasse', 'filiale', 'markt', 'straße', 'platz',
        'vielen dank', 'danke', 'auf wiedersehen', 'besuchen sie',
        'ust', 'brutto', 'rabatt', 'ersparnis',
        '---', '===', '***', '+++',
        'tel', 'fax', 'www', 'http', '@',
        'kundennr', 'kunde', 'mitarbeiter', 'kundenbeleg', 'k-u-n-d',
        'pfand', 'leergut', 'einweg', 'mehrweg',
        'zwischensumme', 'subtotal',
        'terminal', 'ta-nr', 'bnr', 'kartenzahlung',
        'münchen', 'muenchen', 'berlin', 'hamburg', 'köln',  # City names
    ]
    
    # Skip patterns - regex patterns that indicate non-item lines  
    skip_patterns = [
        re.compile(r'^\d{5}\s'),  # Postleitzahl at start
        re.compile(r'^[\d\s.,\-:]+$'),  # Only numbers and punctuation
        re.compile(r'^\d+\.\d+\.\d+'),  # Date pattern
        re.compile(r'^[A-Z]{2,3}\s*[-:]?\s*\d'),  # Terminal-ID, TA-Nr patterns
        re.compile(r'filiale\s*\d+', re.IGNORECASE),  # Filiale 8441
        re.compile(r'kasse\s*\d+', re.IGNORECASE),  # Kasse 1
        re.compile(r'^\s*eur\s*$', re.IGNORECASE),  # Just "EUR"
        re.compile(r'netto.*discount', re.IGNORECASE),  # Store name
        re.compile(r'marken.*discount', re.IGNORECASE),  # Store name variant
    ]
    
    # Patterns for receipt line items
    patterns = [
        # Pattern 1: Description followed by price at end (most common)
        # "Apfel Bio 1kg          2,49" or "Milch 3,5%    1.29 B"
        re.compile(r'^(.{3,45}?)\s{2,}(\d{1,3}[.,]\d{2})\s*[A-Z0-9]?\s*$'),
        
        # Pattern 2: Description with single space before price
        # "Butter 250g 2,49" or "Bar.Pesto sort. 190/200g 2,99 B"
        # Also matches OCR errors like "1,19 5" instead of "1,19 B"
        re.compile(r'^([A-Za-zäöüÄÖÜß].{2,44}?)\s+(\d{1,3}[.,]\d{2})\s*[A-Z0-9]?\s*$'),
        
        # Pattern 3: With quantity prefix "2x Artikel 1,99" or "2 x Artikel"
        re.compile(r'^(\d+)\s*[xX×*]\s*(.+?)\s+(\d{1,3}[.,]\d{2})\s*[A-Z0-9]?\s*$'),
        
        # Pattern 4: Quantity and unit price on separate conceptual part
        # "2 STK x 0,99   1,98"  
        re.compile(r'^(\d+)\s*(?:STK|ST|STCK|Stk|stk)?\s*[xX×*]\s*(\d{1,3}[.,]\d{2})\s+(.+?)?\s*(\d{1,3}[.,]\d{2})?\s*$'),
        
        # Pattern 5: Weight-based items "0,500 kg x 2,99 EUR/kg"
        re.compile(r'^(\d+[.,]\d+)\s*(?:kg|g|l|ml)\s*[xX×*@]\s*(\d{1,3}[.,]\d{2})\s*(?:EUR)?/?(?:kg|g|l|ml)?\s*(.+?)?\s*(\d{1,3}[.,]\d{2})?\s*$'),
        
        # Pattern 6: Simple "Article 1,99-" (with trailing dash for negative/discount)
        re.compile(r'^(.{3,45}?)\s+(\d{1,3}[.,]\d{2})-?\s*$'),
    ]
    
    # Track previous line for multi-line item detection (REWE style)
    previous_line = None
    
    for line in lines:
        original_line = line
        line = line.strip()
        
        if not line or len(line) < 4:
            previous_line = None
            continue
        
        # Skip lines with skip keywords
        lower_line = line.lower()
        
        # Special handling: "bar" alone is skip, but "bar.pesto" is a product
        should_skip = False
        for kw in skip_keywords:
            if kw in lower_line:
                # Make sure it's not part of a product name
                # e.g., "bar.pesto" should NOT be skipped even though "bar" is a keyword
                # Check if keyword is a whole word or at a word boundary
                pattern = r'(?:^|[\s,;:\-])' + re.escape(kw) + r'(?:$|[\s,;:\-\[])'
                if re.search(pattern, lower_line):
                    should_skip = True
                    break
        
        if should_skip:
            previous_line = None
            continue
        
        # Skip lines matching skip patterns
        if any(p.search(line) for p in skip_patterns):
            previous_line = None
            continue
            
        matched = False
        
        # Special Pattern: REWE multi-line format
        # Line 1: "SPRUEHSAHNE 20%"
        # Line 2: "2 Stk x 0,99 1,98 B"
        # We need to detect Line 2 and use Line 1 as description
        rewe_pattern = re.compile(r'^(\d+)\s*(?:STK|Stk|stk|ST|st)\s*[xX×*]\s*(\d{1,3}[.,]\d{2})\s+(\d{1,3}[.,]\d{2})\s*[A-Z0-9]?\s*$')
        match = rewe_pattern.match(line)
        if match and previous_line:
            quantity = int(match.group(1))
            unit_price_str = match.group(2).replace(',', '.')
            total_price_str = match.group(3).replace(',', '.')
            try:
                unit_price = float(unit_price_str)
                total_price = float(total_price_str)
                # Use previous line as description (clean it up)
                description = previous_line.strip()
                # Remove any trailing percentages or numbers that look like leftover
                description = re.sub(r'\s+\d+[%]?\s*$', '', description)
                if 0.01 <= unit_price <= 500 and len(description) >= 2:
                    items.append({
                        "description": description,
                        "price": unit_price,
                        "quantity": quantity,
                        "category": categorize_item(description)
                    })
                    matched = True
                    logger.info(f"Matched (REWE multi-line): {description} x{quantity} @ {unit_price}")
                    previous_line = None
                    continue
            except ValueError:
                pass
        
        # Try Pattern 3 first (quantity prefix)
        match = patterns[2].match(line)
        if match:
            quantity = int(match.group(1))
            description = match.group(2).strip()
            price_str = match.group(3).replace(',', '.')
            try:
                price = float(price_str)
                if 0.01 <= price <= 500 and len(description) >= 2:
                    items.append({
                        "description": description,
                        "price": price,
                        "quantity": quantity,
                        "category": categorize_item(description)
                    })
                    matched = True
                    logger.info(f"Matched (qty prefix): {description} x{quantity} @ {price}")
            except ValueError:
                pass
        
        # Try Pattern 4 (STK x price format)
        if not matched:
            match = patterns[3].match(line)
            if match:
                quantity = int(match.group(1))
                unit_price_str = match.group(2).replace(',', '.')
                description = match.group(3).strip() if match.group(3) else f"Artikel"
                try:
                    unit_price = float(unit_price_str)
                    if 0.01 <= unit_price <= 500:
                        items.append({
                            "description": description,
                            "price": unit_price,
                            "quantity": quantity,
                            "category": categorize_item(description)
                        })
                        matched = True
                        logger.info(f"Matched (STK): {description} x{quantity} @ {unit_price}")
                except ValueError:
                    pass
        
        # Try Pattern 1 and 2 (standard description + price)
        if not matched:
            for i, pattern in enumerate([patterns[0], patterns[1], patterns[5]]):
                match = pattern.match(line)
                if match:
                    description = match.group(1).strip()
                    price_str = match.group(2).replace(',', '.')
                    
                    # Clean up description
                    description = re.sub(r'\s+', ' ', description)  # Normalize spaces
                    description = description.strip('.-_ ')
                    
                    try:
                        price = float(price_str)
                        # Validate: reasonable price and description length
                        if 0.01 <= price <= 500 and 2 <= len(description) <= 50:
                            # Additional check: description should have at least one letter
                            if re.search(r'[A-Za-zäöüÄÖÜß]', description):
                                items.append({
                                    "description": description,
                                    "price": price,
                                    "quantity": 1,
                                    "category": categorize_item(description)
                                })
                                matched = True
                                logger.info(f"Matched (pattern {i}): {description} @ {price}")
                                break
                    except ValueError:
                        pass
        
        # Store current line as previous for next iteration (for multi-line items)
        if not matched:
            previous_line = line
        else:
            previous_line = None
    
    logger.info(f"Total items parsed: {len(items)}")
    return items

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/ocr/process")
async def process_receipt(file: UploadFile = File(...)):
    logger.info(f"Received file: {file.filename}, content_type: {file.content_type}")
    
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        contents = await file.read()
        logger.info(f"Read {len(contents)} bytes")
        
        image = Image.open(io.BytesIO(contents))
        logger.info(f"Opened image: {image.size}, mode: {image.mode}")
        
        # Try multiple OCR configurations and pick the best result
        best_text = ""
        best_score = 0
        
        # Configuration 1: Simple preprocessing with PSM 4 (single column)
        configs = [
            ("simple", preprocess_image_simple, r'--oem 3 --psm 4'),
            ("simple", preprocess_image_simple, r'--oem 3 --psm 6'),
            ("processed", preprocess_image, r'--oem 3 --psm 4'),
            ("processed", preprocess_image, r'--oem 3 --psm 6'),
        ]
        
        for name, preprocess_func, config in configs:
            try:
                processed = preprocess_func(image.copy())
                text = pytesseract.image_to_string(processed, lang='deu', config=config)
                
                # Score the result - count German words and numbers
                score = 0
                # Count price patterns (X,XX)
                score += len(re.findall(r'\d+[,\.]\d{2}', text)) * 10
                # Count German letters
                score += len(re.findall(r'[äöüÄÖÜß]', text)) * 2
                # Count common receipt words
                for word in ['summe', 'eur', 'kasse', 'bon', 'artikel', 'preis', 'datum']:
                    if word in text.lower():
                        score += 5
                # Penalize garbage characters
                garbage = len(re.findall(r'[|{}\[\]<>~`^]', text))
                score -= garbage * 3
                
                logger.info(f"Config {name}/{config}: score={score}, length={len(text)}")
                
                if score > best_score:
                    best_score = score
                    best_text = text
                    
            except Exception as e:
                logger.warning(f"Config {name}/{config} failed: {e}")
                continue
        
        if not best_text:
            # Last resort: try without any preprocessing
            best_text = pytesseract.image_to_string(image, lang='deu', config='--oem 3 --psm 6')
        
        logger.info(f"Best OCR result (score={best_score}):\n{best_text[:500]}...")
        
        # Parse items from text
        items = parse_receipt_items(best_text)
        
        logger.info(f"OCR processing complete. Found {len(items)} items.")
        return {
            "text": best_text,
            "items": items
        }
        
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3003)
