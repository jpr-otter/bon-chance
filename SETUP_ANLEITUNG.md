# 🚀 BonChance - Setup-Anleitung

Diese Anleitung beschreibt alle Schritte, um das BonChance-Projekt auf einem neuen Rechner zum Laufen zu bringen.

---

## 📋 Inhaltsverzeichnis

1. [Systemvoraussetzungen](#-systemvoraussetzungen)
2. [Installation der Abhängigkeiten](#-installation-der-abhängigkeiten)
3. [Projekt einrichten](#-projekt-einrichten)
4. [Services starten](#-services-starten)
5. [Demo-Daten erstellen](#-demo-daten-erstellen)
6. [App verwenden](#-app-verwenden)
7. [Nützliche Befehle](#-nützliche-befehle)
8. [Fehlerbehebung](#-fehlerbehebung)

---

## 🖥️ Systemvoraussetzungen

### Betriebssystem
- **Linux** (Ubuntu 20.04+ empfohlen) oder **WSL2** unter Windows
- macOS wird auch unterstützt

### Erforderliche Software

| Software | Version | Zweck |
|----------|---------|-------|
| **Rust** | 1.70+ | Backend-Services |
| **Node.js** | 18+ | Frontend (Angular) |
| **npm** | 9+ | Paketmanager |
| **PostgreSQL** | 14+ | Datenbank |
| **Python** | 3.8+ | Demo-Daten & OCR-Service |
| **Git** | 2.0+ | Versionskontrolle |

### Optionale Software

| Software | Zweck |
|----------|-------|
| **Docker** | Alternative zum manuellen Setup |
| **Tesseract OCR** | Kassenbon-Texterkennung |

---

## 📦 Installation der Abhängigkeiten

### 1. Rust installieren

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Überprüfen:
rustc --version
cargo --version
```

### 2. Node.js & npm installieren

**Option A: Via nvm (empfohlen)**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Überprüfen:
node --version
npm --version
```

**Option B: Via apt (Ubuntu/Debian)**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. PostgreSQL installieren

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib

# PostgreSQL starten:
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS (via Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

### 4. Datenbank einrichten

```bash
# Als postgres-User einloggen:
sudo -u postgres psql

# In der PostgreSQL-Shell:
CREATE DATABASE bonchance;
CREATE USER postgres WITH PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE bonchance TO postgres;
\q
```

**Alternativ** (falls postgres-User bereits mit Passwort 'postgres' existiert):
```bash
sudo -u postgres createdb bonchance
```

### 5. Python installieren (für Demo-Daten)

```bash
# Ubuntu/Debian:
sudo apt install python3 python3-pip

# Überprüfen:
python3 --version
```

---

## 🔧 Projekt einrichten

### 1. Repository klonen (falls nicht vorhanden)

```bash
git clone <repository-url> bon-chance
cd bon-chance
```

### 2. Backend kompilieren

```bash
cd backend
cargo build --release

# Dies kompiliert alle Backend-Services:
# - api-gateway
# - user-service  
# - receipt-service
```

> ⏱️ Der erste Build kann 5-10 Minuten dauern.

### 3. Frontend einrichten

```bash
cd ../bon-chance-frontend
npm install
```

### 4. Datenbank-Migrationen ausführen

Die Migrationen werden automatisch beim ersten Start der Services ausgeführt. 
Falls du sie manuell ausführen möchtest:

```bash
# User-Service Migrationen:
psql -U postgres -d bonchance -f backend/user-service/migrations/001_create_users.sql
psql -U postgres -d bonchance -f backend/user-service/migrations/002_make_username_required.sql

# Receipt-Service Migrationen:
psql -U postgres -d bonchance -f backend/receipt-service/migrations/001_create_receipts.sql
psql -U postgres -d bonchance -f backend/receipt-service/migrations/002_add_store_name_to_receipts.sql
psql -U postgres -d bonchance -f backend/receipt-service/migrations/003_create_budgets.sql
```

---

## ▶️ Services starten

### Option A: Mit devctl.sh (empfohlen)

Das Projekt enthält ein Kontrollskript, das alle Services verwaltet:

```bash
cd /pfad/zu/bon-chance

# Alle Services starten:
./devctl.sh up

# Status prüfen:
./devctl.sh status

# Alle Services stoppen:
./devctl.sh down
```

### Option B: Services manuell starten

Falls du die Services einzeln starten möchtest:

**Terminal 1 - User Service:**
```bash
cd backend
DATABASE_URL="postgres://postgres:postgres@localhost:5432/bonchance" \
JWT_SECRET="your-super-secret-key" \
./target/release/user-service
```

**Terminal 2 - Receipt Service:**
```bash
cd backend
DATABASE_URL="postgres://postgres:postgres@localhost:5432/bonchance" \
JWT_SECRET="your-super-secret-key" \
./target/release/receipt-service
```

**Terminal 3 - API Gateway:**
```bash
cd backend
DATABASE_URL="postgres://postgres:postgres@localhost:5432/bonchance" \
JWT_SECRET="your-super-secret-key" \
USER_SERVICE_URL="http://localhost:3001" \
RECEIPT_SERVICE_URL="http://localhost:3002" \
./target/release/api-gateway
```

**Terminal 4 - Frontend:**
```bash
cd bon-chance-frontend
npm start
# oder: npx ng serve
```

### Services überprüfen

Nach dem Start sollten folgende Endpoints erreichbar sein:

| Service | URL | Health-Check |
|---------|-----|--------------|
| API Gateway | http://localhost:3000 | http://localhost:3000/health |
| User Service | http://localhost:3001 | http://localhost:3001/health |
| Receipt Service | http://localhost:3002 | http://localhost:3002/health |
| Frontend | http://localhost:4200 | (Browser öffnen) |

```bash
# Schneller Health-Check:
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
```

---

## 📊 Demo-Daten erstellen

Das Projekt enthält ein Script zum Erstellen realistischer Testdaten:

```bash
# Demo-Daten für alle User erstellen:
./devctl.sh seed
# oder: python3 scripts/seed_data.py

# Kassenbon-Statistik anzeigen:
./devctl.sh list
# oder: python3 scripts/seed_data.py list
```

### Demo-Benutzer

Nach dem Seeding stehen folgende Benutzer zur Verfügung:

| Benutzername | Passwort | Beschreibung |
|--------------|----------|--------------|
| `admin` | `admin123` | Admin-User, viele Kassenbons |
| `maria` | `demo123` | Normaler User |
| `thomas` | `demo123` | User mit weniger Einkäufen |
| `lisa` | `demo123` | Normaler User |

### Daten löschen

```bash
# Alle Demo-Kassenbons löschen:
./devctl.sh clear

# Nur bestimmte User:
./devctl.sh clear maria thomas
```

---

## 🌐 App verwenden

### 1. Browser öffnen

Navigiere zu: **http://localhost:4200**

### 2. Einloggen

Verwende einen der Demo-Benutzer (siehe oben) oder registriere einen neuen Account.

### 3. Funktionen

- **Dashboard**: Übersicht über Ausgaben, Charts, Kassenbons
- **Kassenbons verwalten**: Liste aller Bons, Details ansehen
- **Statistiken**: Detaillierte Ausgabenanalyse
- **Budget**: Monatsbudgets pro Kategorie setzen
- **Admin** (nur für admin): Benutzerverwaltung

---

## 🛠️ Nützliche Befehle

### devctl.sh Befehlsübersicht

```bash
./devctl.sh up              # Alle Services starten
./devctl.sh down            # Alle Services stoppen
./devctl.sh restart         # Neu starten
./devctl.sh status          # Status anzeigen
./devctl.sh logs            # Alle Logs anzeigen
./devctl.sh logs <service>  # Logs eines Services (z.B. api-gateway)
./devctl.sh build           # Backend & Frontend bauen
./devctl.sh build backend   # Nur Backend bauen
./devctl.sh build frontend  # Nur Frontend bauen
./devctl.sh seed            # Demo-Daten erstellen
./devctl.sh clear           # Demo-Daten löschen
./devctl.sh list            # Kassenbon-Statistik
./devctl.sh test            # Smoke-Tests ausführen
./devctl.sh ports           # Belegte Ports anzeigen
./devctl.sh help            # Hilfe anzeigen
```

### Entwicklung

```bash
# Frontend im Watch-Mode (automatisches Neuladen):
cd bon-chance-frontend
npm start

# Backend im Debug-Mode kompilieren:
cd backend
cargo build

# Tests ausführen:
cargo test
```

---

## ❗ Fehlerbehebung

### Problem: "Port bereits belegt"

```bash
# Prozesse auf Port anzeigen:
lsof -i :3000
lsof -i :4200

# Prozess beenden:
kill -9 <PID>

# Oder alle Projektports freigeben:
./devctl.sh clean
```

### Problem: "Datenbank-Verbindung fehlgeschlagen"

1. Prüfen ob PostgreSQL läuft:
   ```bash
   pg_isready -h localhost -p 5432
   ```

2. PostgreSQL starten:
   ```bash
   sudo systemctl start postgresql
   ```

3. Prüfen ob Datenbank existiert:
   ```bash
   psql -U postgres -l | grep bonchance
   ```

### Problem: "cargo: command not found"

Rust-Umgebung neu laden:
```bash
source $HOME/.cargo/env
```

### Problem: "npm start funktioniert nicht"

```bash
cd bon-chance-frontend
rm -rf node_modules
npm install
npm start
```

### Problem: "CORS-Fehler im Browser"

Der API-Gateway hat CORS bereits konfiguriert. Falls trotzdem Fehler auftreten:
- Stelle sicher, dass das Frontend auf Port 4200 läuft
- Stelle sicher, dass der API-Gateway auf Port 3000 läuft

### Problem: "Migrationen schlagen fehl"

Datenbank zurücksetzen und neu erstellen:
```bash
sudo -u postgres psql -c "DROP DATABASE bonchance;"
sudo -u postgres psql -c "CREATE DATABASE bonchance;"
# Dann Services neu starten
```

---

## 📁 Projektstruktur

```
bon-chance/
├── backend/
│   ├── api-gateway/       # API Gateway (Port 3000)
│   ├── user-service/      # Benutzerverwaltung (Port 3001)
│   ├── receipt-service/   # Kassenbons & Budgets (Port 3002)
│   ├── ocr-service/       # OCR für Kassenbons (Port 3003)
│   └── shared/            # Gemeinsame Modelle
├── bon-chance-frontend/   # Angular Frontend (Port 4200)
├── scripts/
│   ├── seed_data.py       # Demo-Daten Generator
│   └── init-db.sql        # Datenbank-Initialisierung
├── logs/                  # Service-Logs
├── devctl.sh              # Kontrollskript
├── docker-compose.yml     # Docker-Setup (optional)
└── SETUP_ANLEITUNG.md     # Diese Datei
```

---

## 🐳 Alternative: Docker-Setup

Falls Docker bevorzugt wird:

```bash
# Alle Services mit Docker starten:
docker-compose up -d

# Logs anzeigen:
docker-compose logs -f

# Stoppen:
docker-compose down
```

---

## 📞 Support

Bei Fragen oder Problemen:
1. Prüfe zuerst die Fehlerbehebung oben
2. Schaue in die Logs: `./devctl.sh logs`
3. Kontaktiere das Entwicklungsteam

---

**Viel Erfolg mit BonChance! 🎉**
