.PHONY: help dev build stop clean logs test

# Default target
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Development commands
dev: ## Start all services in development mode
	docker-compose up --build

dev-detached: ## Start all services in background
	docker-compose up -d --build

stop: ## Stop all services
	docker-compose down

clean: ## Stop all services and remove volumes
	docker-compose down -v

logs: ## Show logs from all services
	docker-compose logs -f

logs-api: ## Show API Gateway logs
	docker-compose logs -f api-gateway

logs-user: ## Show User Service logs
	docker-compose logs -f user-service

logs-receipt: ## Show Receipt Service logs
	docker-compose logs -f receipt-service

logs-frontend: ## Show Frontend logs
	docker-compose logs -f frontend

# Database commands
db-migrate: ## Run database migrations
	docker-compose exec user-service sqlx migrate run
	docker-compose exec receipt-service sqlx migrate run

db-reset: ## Reset database (WARNING: destroys all data)
	docker-compose down postgres
	docker volume rm bonchance_postgres_data
	docker-compose up -d postgres

# Testing commands
test-backend: ## Run backend tests
	cd backend && cargo test

test-frontend: ## Run frontend tests
	cd bon-chance-frontend && npm test

# Build commands
build: ## Build all services
	docker-compose build

build-backend: ## Build only backend services
	docker-compose build api-gateway user-service receipt-service

build-frontend: ## Build only frontend
	docker-compose build frontend

# Status commands
status: ## Show status of all services
	docker-compose ps

# Setup commands
setup: ## First-time setup (copy .env file and start services)
	@echo "Setting up BonChance development environment..."
	@if [ ! -f .env ]; then cp .env.example .env; echo "Created .env file from template"; fi
	@echo "Starting services..."
	make dev