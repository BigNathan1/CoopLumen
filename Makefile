.DEFAULT_GOAL := help

# ── Colours ────────────────────────────────────────────────────────────────────
CYAN  := \033[0;36m
RESET := \033[0m

# ── Help ───────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "  $(CYAN)CoopLumen — available commands$(RESET)"
	@echo ""
	@echo "  $(CYAN)make install$(RESET)      Install all dependencies (root + backend + frontend)"
	@echo "  $(CYAN)make dev$(RESET)          Start all services via Docker Compose"
	@echo "  $(CYAN)make dev-local$(RESET)    Start backend and frontend without Docker"
	@echo "  $(CYAN)make build$(RESET)        Build backend and frontend for production"
	@echo "  $(CYAN)make lint$(RESET)         Run ESLint on backend and frontend"
	@echo "  $(CYAN)make format$(RESET)       Format all source files with Prettier"
	@echo "  $(CYAN)make format-check$(RESET) Check formatting without writing"
	@echo "  $(CYAN)make type-check$(RESET)   Run TypeScript type checks"
	@echo "  $(CYAN)make test$(RESET)         Run all tests (backend + frontend)"
	@echo "  $(CYAN)make test-backend$(RESET) Run backend tests only"
	@echo "  $(CYAN)make test-frontend$(RESET)Run frontend tests only"
	@echo "  $(CYAN)make coverage$(RESET)     Run tests with coverage reports"
	@echo "  $(CYAN)make migrate$(RESET)      Run pending database migrations"
	@echo "  $(CYAN)make seed$(RESET)         Seed the database with development data"
	@echo "  $(CYAN)make db-status$(RESET)    Show applied vs pending migrations"
	@echo "  $(CYAN)make clean$(RESET)        Remove build artefacts and coverage reports"
	@echo ""

# ── Dependencies ───────────────────────────────────────────────────────────────
.PHONY: install
install:
	npm install
	cd backend && npm install
	cd frontend && npm install

# ── Development ────────────────────────────────────────────────────────────────
.PHONY: dev
dev:
	docker-compose up

.PHONY: dev-detach
dev-detach:
	docker-compose up -d

.PHONY: dev-local
dev-local:
	@echo "Starting backend and frontend in parallel..."
	@(cd backend && npm run dev) & (cd frontend && npm run dev)

.PHONY: stop
stop:
	docker-compose down

# ── Build ──────────────────────────────────────────────────────────────────────
.PHONY: build
build:
	cd backend && npm run build
	cd frontend && npm run build

# ── Code quality ───────────────────────────────────────────────────────────────
.PHONY: lint
lint:
	cd backend && npm run lint
	cd frontend && npm run lint

.PHONY: lint-fix
lint-fix:
	cd backend && npm run lint:fix
	cd frontend && npm run lint:fix

.PHONY: format
format:
	npm run format

.PHONY: format-check
format-check:
	npm run format:check

.PHONY: type-check
type-check:
	cd backend && npm run type-check
	cd frontend && npm run type-check

.PHONY: check
check: lint type-check format-check

# ── Testing ────────────────────────────────────────────────────────────────────
.PHONY: test
test:
	cd backend && npm test
	cd frontend && npm test

.PHONY: test-backend
test-backend:
	cd backend && npm test

.PHONY: test-frontend
test-frontend:
	cd frontend && npm test

.PHONY: coverage
coverage:
	cd backend && npm run test:coverage
	cd frontend && npm run test:coverage

# ── Database ───────────────────────────────────────────────────────────────────
.PHONY: migrate
migrate:
	cd backend && npm run db:migrate

.PHONY: seed
seed:
	cd backend && npm run db:seed

.PHONY: db-status
db-status:
	cd backend && npm run db:status

# ── Cleanup ────────────────────────────────────────────────────────────────────
.PHONY: clean
clean:
	rm -rf backend/dist
	rm -rf frontend/.next
	rm -rf frontend/out
	rm -rf backend/coverage
	rm -rf frontend/coverage
