#!/usr/bin/env python3
"""
BonChance Demo Data Tool

Usage:
  python3 seed_data.py              # Seed all demo users with receipts
  python3 seed_data.py seed         # Same as above
  python3 seed_data.py clear        # Delete ALL receipts for ALL demo users
  python3 seed_data.py clear maria  # Delete only maria's receipts
  python3 seed_data.py clear admin thomas  # Delete admin's and thomas's receipts
  python3 seed_data.py list         # Show receipt counts per user
"""
import json
import random
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta

# Configuration
API_BASE = "http://localhost:3000/api/v1"
LOGIN_URL = f"{API_BASE}/users/login"
REGISTER_URL = f"{API_BASE}/users/register"
RECEIPTS_URL = f"{API_BASE}/receipts"

# Demo Users - will be created if they don't exist
DEMO_USERS = [
    {"username": "admin", "email": "admin@bonchance.de", "password": "admin123"},
    {"username": "maria", "email": "maria@example.de", "password": "demo123"},
    {"username": "thomas", "email": "thomas@example.de", "password": "demo123"},
    {"username": "lisa", "email": "lisa@example.de", "password": "demo123"},
]

# Data Pools
STORES = ["Rewe", "Edeka", "Aldi Süd", "Lidl", "Netto", "Penny", "Kaufland", "dm", "Rossmann"]

CATEGORIES = [
    "Obst & Gemüse", "Milchprodukte", "Fleisch & Wurst", "Backwaren", 
    "Getränke", "Süßwaren", "Tiefkühl", "Drogerie", "Haushalt", "Konserven"
]

ITEMS = [
    # Obst & Gemüse
    {"name": "Bio Bananen", "cat": "Obst & Gemüse", "min": 1.50, "max": 2.50},
    {"name": "Äpfel Braeburn 1kg", "cat": "Obst & Gemüse", "min": 2.00, "max": 3.50},
    {"name": "Gurke", "cat": "Obst & Gemüse", "min": 0.69, "max": 1.29},
    {"name": "Tomaten Rispen 500g", "cat": "Obst & Gemüse", "min": 1.49, "max": 2.99},
    {"name": "Paprika Mix", "cat": "Obst & Gemüse", "min": 1.99, "max": 3.49},
    {"name": "Kartoffeln 2.5kg", "cat": "Obst & Gemüse", "min": 2.49, "max": 4.99},
    {"name": "Zwiebeln Netz", "cat": "Obst & Gemüse", "min": 0.99, "max": 1.99},
    {"name": "Karotten 1kg", "cat": "Obst & Gemüse", "min": 0.99, "max": 1.79},
    
    # Milchprodukte
    {"name": "Frische Vollmilch 3.5%", "cat": "Milchprodukte", "min": 0.99, "max": 1.49},
    {"name": "H-Milch 1.5%", "cat": "Milchprodukte", "min": 0.89, "max": 1.19},
    {"name": "Deutsche Markenbutter", "cat": "Milchprodukte", "min": 1.59, "max": 2.89},
    {"name": "Speisequark 250g", "cat": "Milchprodukte", "min": 0.69, "max": 1.19},
    {"name": "Joghurt Natur 500g", "cat": "Milchprodukte", "min": 0.89, "max": 1.69},
    {"name": "Gouda Jung Scheiben", "cat": "Milchprodukte", "min": 1.99, "max": 3.49},
    {"name": "Mozzarella", "cat": "Milchprodukte", "min": 0.89, "max": 1.49},
    {"name": "Schlagsahne", "cat": "Milchprodukte", "min": 0.79, "max": 1.29},

    # Fleisch & Wurst
    {"name": "Hähnchenbrustfilet 500g", "cat": "Fleisch & Wurst", "min": 4.99, "max": 7.99},
    {"name": "Rinderhackfleisch 500g", "cat": "Fleisch & Wurst", "min": 4.49, "max": 6.99},
    {"name": "Salami Aufschnitt", "cat": "Fleisch & Wurst", "min": 1.49, "max": 2.99},
    {"name": "Kochschinken", "cat": "Fleisch & Wurst", "min": 1.29, "max": 2.49},
    {"name": "Wiener Würstchen", "cat": "Fleisch & Wurst", "min": 2.49, "max": 4.99},

    # Backwaren
    {"name": "Weltmeisterbrot", "cat": "Backwaren", "min": 1.49, "max": 2.49},
    {"name": "Toastbrot", "cat": "Backwaren", "min": 0.89, "max": 1.69},
    {"name": "Brötchen (Stück)", "cat": "Backwaren", "min": 0.19, "max": 0.49},
    {"name": "Buttercroissant", "cat": "Backwaren", "min": 0.59, "max": 1.19},

    # Getränke
    {"name": "Mineralwasser Medium 1.5L", "cat": "Getränke", "min": 0.19, "max": 0.69},
    {"name": "Coca Cola 1.5L", "cat": "Getränke", "min": 1.19, "max": 1.99},
    {"name": "Orangensaft 1L", "cat": "Getränke", "min": 1.29, "max": 2.49},
    {"name": "Bier Pils 0.5L", "cat": "Getränke", "min": 0.49, "max": 1.09},
    {"name": "Kaffee gemahlen 500g", "cat": "Getränke", "min": 3.99, "max": 6.99},

    # Süßwaren & Snacks
    {"name": "Schokolade Alpenmilch", "cat": "Süßwaren", "min": 0.99, "max": 1.49},
    {"name": "Gummibärchen", "cat": "Süßwaren", "min": 0.89, "max": 1.29},
    {"name": "Paprika Chips", "cat": "Süßwaren", "min": 1.29, "max": 2.49},
    {"name": "Kekse", "cat": "Süßwaren", "min": 0.99, "max": 1.99},

    # Tiefkühl
    {"name": "TK Pizza Salami", "cat": "Tiefkühl", "min": 1.99, "max": 3.99},
    {"name": "TK Gemüsepfanne", "cat": "Tiefkühl", "min": 1.49, "max": 2.99},
    {"name": "Fischstäbchen", "cat": "Tiefkühl", "min": 2.49, "max": 4.49},
    {"name": "Eiscreme Vanille", "cat": "Tiefkühl", "min": 1.99, "max": 3.99},

    # Drogerie & Haushalt
    {"name": "Zahnpasta", "cat": "Drogerie", "min": 0.89, "max": 2.49},
    {"name": "Duschgel", "cat": "Drogerie", "min": 0.99, "max": 2.99},
    {"name": "Toilettenpapier 8er", "cat": "Haushalt", "min": 2.99, "max": 4.99},
    {"name": "Spülmittel", "cat": "Haushalt", "min": 0.99, "max": 1.99},
    {"name": "Müllbeutel", "cat": "Haushalt", "min": 0.99, "max": 1.99},
    {"name": "Küchenrolle", "cat": "Haushalt", "min": 1.99, "max": 3.49},
    
    # Konserven
    {"name": "Tomaten gehackt Dose", "cat": "Konserven", "min": 0.49, "max": 0.99},
    {"name": "Mais Dose", "cat": "Konserven", "min": 0.59, "max": 0.99},
    {"name": "Kidneybohnen", "cat": "Konserven", "min": 0.49, "max": 0.89},
]

SEASONAL_ITEMS = {
    "spring": [ # March, April, May
        {"name": "Spargel weiß 500g", "cat": "Obst & Gemüse", "min": 4.99, "max": 8.99},
        {"name": "Erdbeeren 500g", "cat": "Obst & Gemüse", "min": 2.49, "max": 4.99},
        {"name": "Rhabarber", "cat": "Obst & Gemüse", "min": 1.99, "max": 3.99},
        {"name": "Bärlauch", "cat": "Obst & Gemüse", "min": 1.49, "max": 2.49},
    ],
    "summer": [ # June, July, August
        {"name": "Wassermelone", "cat": "Obst & Gemüse", "min": 3.99, "max": 6.99},
        {"name": "Kirschen 500g", "cat": "Obst & Gemüse", "min": 2.99, "max": 5.99},
        {"name": "Pfirsiche 1kg", "cat": "Obst & Gemüse", "min": 2.49, "max": 4.99},
        {"name": "Grillfleisch mariniert", "cat": "Fleisch & Wurst", "min": 4.99, "max": 8.99},
        {"name": "Grillkohle 3kg", "cat": "Haushalt", "min": 3.99, "max": 6.99},
    ],
    "autumn": [ # September, October, November
        {"name": "Kürbis Hokkaido", "cat": "Obst & Gemüse", "min": 1.49, "max": 2.99},
        {"name": "Zwetschgen 1kg", "cat": "Obst & Gemüse", "min": 1.99, "max": 3.99},
        {"name": "Federweißer", "cat": "Getränke", "min": 2.49, "max": 3.99},
        {"name": "Weintrauben 500g", "cat": "Obst & Gemüse", "min": 1.99, "max": 3.99},
    ],
    "winter": [ # December, January, February
        {"name": "Orangen 1kg", "cat": "Obst & Gemüse", "min": 1.99, "max": 3.99},
        {"name": "Mandarinen Netz", "cat": "Obst & Gemüse", "min": 1.99, "max": 3.99},
        {"name": "Grünkohl 500g", "cat": "Obst & Gemüse", "min": 1.49, "max": 2.49},
        {"name": "Lebkuchen", "cat": "Süßwaren", "min": 1.49, "max": 3.99},
        {"name": "Spekulatius", "cat": "Süßwaren", "min": 1.29, "max": 2.49},
    ]
}

def get_season(month):
    if month in [3, 4, 5]:
        return "spring"
    elif month in [6, 7, 8]:
        return "summer"
    elif month in [9, 10, 11]:
        return "autumn"
    else:
        return "winter"

def register_user(user):
    """Register a user if not already existing"""
    data = json.dumps({
        "username": user["username"],
        "email": user["email"],
        "password": user["password"]
    }).encode('utf-8')
    req = urllib.request.Request(REGISTER_URL, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            print(f"  ✓ Created user: {user['username']}")
            return True
    except urllib.error.HTTPError as e:
        if e.code == 400 or e.code == 409:
            print(f"  ○ User exists: {user['username']}")
            return True  # User already exists
        print(f"  ✗ Error creating {user['username']}: {e}")
        return False
    except urllib.error.URLError as e:
        print(f"  ✗ Network error: {e}")
        return False

def get_token(username, password):
    data = json.dumps({"login": username, "password": password}).encode('utf-8')
    req = urllib.request.Request(LOGIN_URL, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result.get("token")
    except urllib.error.URLError as e:
        print(f"Error logging in as {username}: {e}")
        return None

def create_receipt(token, date_obj):
    store = random.choice(STORES)
    num_items = random.randint(3, 15)
    
    items = []
    total_amount = 0.0
    
    # Determine season and get seasonal items
    season = get_season(date_obj.month)
    seasonal_pool = SEASONAL_ITEMS.get(season, [])
    
    for _ in range(num_items):
        # 20% chance to pick a seasonal item if available
        if seasonal_pool and random.random() < 0.2:
            item_template = random.choice(seasonal_pool)
        else:
            item_template = random.choice(ITEMS)
            
        price = round(random.uniform(item_template["min"], item_template["max"]), 2)
        quantity = 1
        # 10% chance for quantity > 1
        if random.random() < 0.1:
            quantity = random.randint(2, 4)
            
        items.append({
            "description": item_template["name"],
            "price": price,
            "quantity": quantity,
            "category_name": item_template["cat"]
        })
        total_amount += price * quantity
        
    total_amount = round(total_amount, 2)
    
    # Format date as ISO 8601
    purchase_date = date_obj.strftime("%Y-%m-%dT%H:%M:%SZ")
    
    payload = {
        "store_name": store,
        "purchase_date": purchase_date,
        "total_amount": total_amount,
        "items": items
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(RECEIPTS_URL, data=data, headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}'
    })
    
    try:
        with urllib.request.urlopen(req) as response:
            return True
    except urllib.error.URLError as e:
        print(f"Error creating receipt for {purchase_date}: {e}")
        return False

def get_user_receipts(token):
    """Get all receipts for the authenticated user"""
    req = urllib.request.Request(RECEIPTS_URL, headers={
        'Authorization': f'Bearer {token}'
    })
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.URLError as e:
        print(f"Error fetching receipts: {e}")
        return []

def delete_receipt(token, receipt_id):
    """Delete a single receipt by ID"""
    url = f"{RECEIPTS_URL}/{receipt_id}"
    req = urllib.request.Request(url, method='DELETE', headers={
        'Authorization': f'Bearer {token}'
    })
    try:
        with urllib.request.urlopen(req) as response:
            return True
    except urllib.error.URLError as e:
        return False

def clear_user_receipts(username, password):
    """Delete all receipts for a specific user"""
    token = get_token(username, password)
    if not token:
        print(f"  ✗ Could not authenticate {username}")
        return 0
    
    receipts = get_user_receipts(token)
    if not receipts:
        print(f"  ○ No receipts found for {username}")
        return 0
    
    deleted = 0
    total = len(receipts)
    for receipt in receipts:
        receipt_id = receipt.get('id')
        if receipt_id and delete_receipt(token, receipt_id):
            deleted += 1
            print(f"  Deleting... {deleted}/{total}", end='\r')
    
    print(f"  ✓ Deleted {deleted} receipts for {username}    ")
    return deleted

def list_user_receipts():
    """Show receipt counts for all demo users"""
    print("=" * 60)
    print("📊 Receipt counts per user")
    print("=" * 60)
    
    total = 0
    for user in DEMO_USERS:
        token = get_token(user["username"], user["password"])
        if not token:
            print(f"  {user['username']}: ✗ (auth failed)")
            continue
        
        receipts = get_user_receipts(token)
        count = len(receipts)
        total += count
        
        # Calculate total amount
        total_amount = sum(r.get('total_amount', 0) for r in receipts)
        
        print(f"  {user['username']}: {count} receipts (€{total_amount:.2f})")
    
    print("-" * 60)
    print(f"  Total: {total} receipts")

def clear_receipts(usernames=None):
    """Delete receipts for specified users (or all demo users)"""
    print("=" * 60)
    print("🗑️  Clearing receipts")
    print("=" * 60)
    
    if usernames:
        # Filter to only specified users
        users_to_clear = [u for u in DEMO_USERS if u["username"] in usernames]
        # Also check for custom usernames not in DEMO_USERS
        for username in usernames:
            if not any(u["username"] == username for u in users_to_clear):
                # Try to find password (assume demo123 for unknown users)
                users_to_clear.append({"username": username, "password": "demo123"})
    else:
        users_to_clear = DEMO_USERS
    
    total_deleted = 0
    for user in users_to_clear:
        print(f"\n👤 {user['username']}...")
        deleted = clear_user_receipts(user["username"], user["password"])
        total_deleted += deleted
    
    print(f"\n{'=' * 60}")
    print(f"✅ Deleted {total_deleted} total receipts")

def seed_receipts():
    print("=" * 60)
    print("🛒 BonChance Demo Data Seeder")
    print("=" * 60)
    
    # Step 1: Create demo users
    print("\n📋 Creating demo users...")
    for user in DEMO_USERS:
        register_user(user)
    
    # Step 2: Seed receipts for each user
    now = datetime.now()
    start_year = now.year
    if now.month < 5:
        start_year -= 1
    start_date = datetime(start_year, 5, 1)
    end_date = now
    
    print(f"\n📅 Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    
    grand_total = 0
    
    for user in DEMO_USERS:
        print(f"\n👤 Seeding receipts for {user['username']}...")
        token = get_token(user["username"], user["password"])
        if not token:
            print(f"  ✗ Could not authenticate {user['username']}, skipping...")
            continue
        
        current_date = start_date
        user_total = 0
        
        # Different users have different shopping frequencies
        if user["username"] == "admin":
            skip_chance = 0.2
            max_per_day = 2
        elif user["username"] == "maria":
            skip_chance = 0.3
            max_per_day = 2
        elif user["username"] == "thomas":
            skip_chance = 0.4  # Shops less frequently
            max_per_day = 1
        else:
            skip_chance = 0.35
            max_per_day = 2
        
        while current_date <= end_date:
            # Skip Sundays
            if current_date.weekday() == 6:
                current_date += timedelta(days=1)
                continue
            
            # Sometimes skip a day
            if random.random() < skip_chance:
                current_date += timedelta(days=1)
                continue
            
            num_receipts = random.randint(1, max_per_day)
            
            for _ in range(num_receipts):
                hour = random.randint(8, 20)
                minute = random.randint(0, 59)
                receipt_date = current_date.replace(hour=hour, minute=minute)
                
                if create_receipt(token, receipt_date):
                    user_total += 1
                    print(f"  Creating receipts... {user_total}", end='\r')
            
            current_date += timedelta(days=1)
        
        print(f"  ✓ Created {user_total} receipts for {user['username']}")
        grand_total += user_total
    
    print(f"\n{'=' * 60}")
    print(f"✅ Done! Created {grand_total} total receipts for {len(DEMO_USERS)} users.")
    print(f"{'=' * 60}")
    print("\n📱 Demo logins:")
    for user in DEMO_USERS:
        print(f"   {user['username']} / {user['password']}")

def print_usage():
    print(__doc__)

def main():
    args = sys.argv[1:]
    
    if not args or args[0] == "seed":
        seed_receipts()
    elif args[0] == "clear":
        usernames = args[1:] if len(args) > 1 else None
        clear_receipts(usernames)
    elif args[0] == "list":
        list_user_receipts()
    elif args[0] in ["-h", "--help", "help"]:
        print_usage()
    else:
        print(f"Unknown command: {args[0]}")
        print_usage()
        sys.exit(1)

if __name__ == "__main__":
    main()
