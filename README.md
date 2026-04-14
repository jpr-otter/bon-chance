# BonChance

BonChance is a full-stack application for managing, analyzing, and budgeting receipts. The project combines an Angular frontend with a microservices architecture in Rust, along with a separate OCR service in Python.

## Overview

- User registration and login via JWT
- Capture and management of receipts
- Budget management and expense analysis
- Admin area for user management
- OCR service for extracting receipt data
- API Gateway as the central entry point for the frontend

## Architecture

The system consists of several services:

| Component        | Port | Technology        | Responsibility                         |
|------------------|-----:|------------------|----------------------------------------|
| Frontend         | 4200 | Angular          | User interface                         |
| API Gateway      | 3000 | Rust, Axum       | Routing, proxy, CORS                   |
| User Service     | 3001 | Rust, Axum       | Authentication, user management        |
| Receipt Service  | 3002 | Rust, Axum       | Receipts, budgets, expenses            |
| OCR Service      | 3003 | Python, FastAPI  | OCR and image processing               |
| PostgreSQL       | 5432 | PostgreSQL       | Persistent data storage                |

## Technology Stack

- Frontend: Angular, TypeScript, Angular Material, RxJS
- Backend: Rust, Axum, SQLx, JWT, Argon2
- OCR: Python, FastAPI, Tesseract
- Database: PostgreSQL
- Dev Tooling: Bash, Docker Compose, devctl.sh

## Quick Start

### Prerequisites

- Rust 1.70+
- Node.js 18+
- npm 9+
- PostgreSQL 14+
- Python 3.8+

### Start the Project

```bash
git clone <repository-url> bon-chance
cd bon-chance
./devctl.sh up
```

### Generate Demo Data

```bash
./devctl.sh seed
```

### Check Status

```bash
./devctl.sh status
```

## Demo Access

After seeding, the following demo users are available:

| Username | Password | Role           |
|----------|----------|----------------|
| admin    | admin123 | Administrator  |
| maria    | demo123  | Demo User      |
| thomas   | demo123  | Demo User      |
| lisa     | demo123  | Demo User      |

## Important URLs

- Frontend: http://localhost:4200
- API Gateway: http://localhost:3000
- Gateway Health: http://localhost:3000/health
- User Service Health: http://localhost:3001/health
- Receipt Service Health: http://localhost:3002/health

## Useful Commands

```bash
./devctl.sh up
./devctl.sh down
./devctl.sh restart
./devctl.sh status
./devctl.sh logs
./devctl.sh seed
./devctl.sh list
./devctl.sh test
```

## Project Structure

```text
bon-chance/
|- backend/
|  |- api-gateway/
|  |- user-service/
|  |- receipt-service/
|  |- ocr-service/
|  `- shared/
|- bon-chance-frontend/
|- scripts/
`- devctl.sh
```

## Documentation

Versioned entry documentation can be found here:

- [SETUP_GUIDE.md](SETUP_GUIDE.md)

Note: Local working documentation and runtime logs are not published to GitHub in this project.

## Development

### Run Frontend Locally

```bash
cd bon-chance-frontend
npm install
npm start
```

### Run Backend Locally

```bash
cd backend
cargo build
```

### Docker

```bash
docker-compose up -d
docker-compose logs -f
```

## Status

BonChance is designed as an active development platform for receipt management, budget planning, and expense analysis. The recommended entry point for local development and GitHub usage is the `./devctl.sh` script.


# BonChance (deutsch)

BonChance ist eine Full-Stack-Anwendung zur Verwaltung, Analyse und Budgetierung von Kassenzetteln. Das Projekt kombiniert ein Angular-Frontend mit einer Microservices-Architektur in Rust sowie einem separaten OCR-Service in Python.

## Kurzueberblick

- Benutzerregistrierung und Login per JWT
- Erfassung und Verwaltung von Kassenzetteln
- Budgetverwaltung und Ausgabenanalyse
- Admin-Bereich fuer Benutzerverwaltung
- OCR-Service zur Extraktion von Belegdaten
- API-Gateway als zentraler Einstiegspunkt fuer das Frontend

## Architektur

Das System besteht aus mehreren Diensten:

| Komponente | Port | Technologie | Aufgabe |
| --- | ---: | --- | --- |
| Frontend | 4200 | Angular | Benutzeroberflaeche |
| API Gateway | 3000 | Rust, Axum | Routing, Proxy, CORS |
| User Service | 3001 | Rust, Axum | Authentifizierung, Benutzerverwaltung |
| Receipt Service | 3002 | Rust, Axum | Kassenzettel, Budgets, Ausgaben |
| OCR Service | 3003 | Python, FastAPI | OCR und Bildverarbeitung |
| PostgreSQL | 5432 | PostgreSQL | Persistente Datenhaltung |

## Technologie-Stack

- Frontend: Angular, TypeScript, Angular Material, RxJS
- Backend: Rust, Axum, SQLx, JWT, Argon2
- OCR: Python, FastAPI, Tesseract
- Datenbank: PostgreSQL
- Dev-Tooling: Bash, Docker Compose, devctl.sh

## Schnellstart

### Voraussetzungen

- Rust 1.70+
- Node.js 18+
- npm 9+
- PostgreSQL 14+
- Python 3.8+

### Projekt starten

```bash
git clone <repository-url> bon-chance
cd bon-chance
./devctl.sh up
```

### Demo-Daten erzeugen

```bash
./devctl.sh seed
```

### Status pruefen

```bash
./devctl.sh status
```

## Demo-Zugaenge

Nach dem Seeding stehen folgende Demo-Benutzer zur Verfuegung:

| Benutzername | Passwort | Rolle |
| --- | --- | --- |
| admin | admin123 | Administrator |
| maria | demo123 | Demo-User |
| thomas | demo123 | Demo-User |
| lisa | demo123 | Demo-User |

## Wichtige URLs

- Frontend: http://localhost:4200
- API Gateway: http://localhost:3000
- Gateway Health: http://localhost:3000/health
- User Service Health: http://localhost:3001/health
- Receipt Service Health: http://localhost:3002/health

## Nuetzliche Befehle

```bash
./devctl.sh up
./devctl.sh down
./devctl.sh restart
./devctl.sh status
./devctl.sh logs
./devctl.sh seed
./devctl.sh list
./devctl.sh test
```

## Projektstruktur

```text
bon-chance/
|- backend/
|  |- api-gateway/
|  |- user-service/
|  |- receipt-service/
|  |- ocr-service/
|  `- shared/
|- bon-chance-frontend/
|- scripts/
`- devctl.sh
```

## Dokumentation

Versionierte Einstiegsdokumentation befindet sich hier:

- [SETUP_ANLEITUNG.md](SETUP_ANLEITUNG.md)

Hinweis: Lokale Arbeitsdokumentation und Laufzeit-Logs werden in diesem Projekt nicht nach GitHub veroeffentlicht.

## Entwicklung

### Frontend lokal

```bash
cd bon-chance-frontend
npm install
npm start
```

### Backend lokal

```bash
cd backend
cargo build
```

### Docker

```bash
docker-compose up -d
docker-compose logs -f
```

## Status

BonChance ist als aktive Entwicklungsplattform fuer Receipt-Management, Budgetplanung und Ausgabenanalyse aufgebaut. Der empfohlene Einstiegspunkt fuer lokale Entwicklung und GitHub-Nutzung ist das Skript `./devctl.sh`.