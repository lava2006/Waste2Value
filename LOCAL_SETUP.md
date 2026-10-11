# Waste2Value — Local Setup & Development Guide

Welcome to **Waste2Value** (*Turn Waste Into Verified Value*). This guide walks you through running the complete stack locally on Windows or any modern OS.

---

## 1. System Requirements

- **Node.js**: v18.17+ or v20+ (tested with React 18 / Next.js 14)
- **Python**: v3.11.x
- **PowerShell** or Bash shell

---

## 2. Directory Overview

```text
Waste2Value/
├── backend/                   # Python FastAPI Verification Service
│   ├── app/
│   │   ├── api/               # REST API endpoints (/batches, /verify, /passports, etc.)
│   │   ├── core/              # Configuration & settings
│   │   ├── extraction/        # Document AI providers (Textract & Demo OCR)
│   │   ├── investigation/     # AI Investigator agent & multimodal analyzer
│   │   ├── materials/         # Material composition tables & economic valuation
│   │   ├── passports/         # Canonical JSON serialization & KMS signatures
│   │   ├── repositories/      # SQLite & DynamoDB single-table repositories
│   │   ├── schemas/           # Pydantic v2 domain schemas
│   │   ├── scoring/           # 0–100 Explainable risk scoring algorithm
│   │   ├── verification/      # 10 Deterministic rules & policy definitions
│   │   └── main.py            # FastAPI app & Mangum AWS Lambda handler
│   └── tests/                 # 34 automated Pytest tests
├── frontend/                  # Next.js 14 TypeScript Web Application
│   ├── src/app/               # 9 complete responsive routes
│   ├── src/components/        # UI design system components
│   ├── src/lib/               # API client adapter & synthetic benchmark store
│   └── src/types/             # Domain TypeScript interfaces
├── template.yaml              # AWS SAM Infrastructure-as-Code
├── ARCHITECTURE.md            # Architectural specification & DynamoDB model
├── AWS_DEPLOYMENT.md          # AWS deployment & SAM execution guide
├── SECURITY.md                # Security model & threat analysis
└── TESTING_EVALUATION.md      # Testing success & precision evaluation
```

---

## 3. Running the Backend Service

The Python environment is located at:
`C:\Users\LAVANYA\AppData\Local\Programs\Python\Python311\python.exe` (or system `python` if in PATH).

### 3.1 Run All Automated Tests
Open PowerShell in the workspace root (`c:\Users\LAVANYA\Desktop\Waste2Value`):

```powershell
$env:PYTHONPATH="backend"
& "C:\Users\LAVANYA\AppData\Local\Programs\Python\Python311\python.exe" -m pytest backend/tests -v
```
*(All 34 tests will execute across rule validation, boundary tolerances, scenarios, persistence, KMS cryptography, and API endpoints).*

### 3.2 Start the FastAPI Backend Server
```powershell
$env:PYTHONPATH="backend"
& "C:\Users\LAVANYA\AppData\Local\Programs\Python\Python311\python.exe" -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```
- Interactive Swagger OpenAPI Docs: `http://127.0.0.1:8000/docs`
- Service Health Check: `http://127.0.0.1:8000/health` or `http://127.0.0.1:8000/api/health`
- Service Readiness Check: `http://127.0.0.1:8000/ready` or `http://127.0.0.1:8000/api/ready`

---

## 4. Running the Frontend Application

Open a second PowerShell window in `c:\Users\LAVANYA\Desktop\Waste2Value\frontend`:

### 4.1 Development Mode
```powershell
cd frontend
npm run dev
```
Open `http://localhost:3000` in your web browser.

### 4.2 Production Build & Run
```powershell
cd frontend
npm run build
npm run start
```

---

## 5. Navigating the 9 Application Routes

1. **`/` (Landing Page):** Value proposition, dual-engine pillars, workflow, and passport preview.
2. **`/dashboard` (Operational Dashboard):** KPI cards, mass reconciliation bar chart, live filters.
3. **`/batches` (Consignment Directory):** Search, category/status/risk filters, detail links.
4. **`/batches/new` (Intake Wizard):** 3-step intake form with drag-and-drop document upload and Quick Scenario Presets (*Clean*, *Borderline*, *High-Risk*).
5. **`/batches/[id]` (Batch Details):** Mass balance breakdown, explainable risk scorecard (0–100), Value Intelligence recovery table, and compliance auditor actions.
6. **`/evidence/[id]` (Evidence Workspace):** Document canvas with bounding-box highlights, OCR confidence scores, and manual audit correction modal.
7. **`/passports/[id]` (Circularity Passport):** Official certificate layout, SHA-256 hash, AWS KMS signature proof, scannable QR code, confetti celebration, and revocation tool.
8. **`/verify/[id]` (Public Verification):** Public-safe integrity view, cryptographic guarantee pillars, tampering simulator.
9. **`/settings` (Settings & Integrations):** Dark/Light mode toggle, Demo vs Live AWS mode switcher, cloud health status matrix, and Reset Demo Data button.

---

## 6. Execution Modes (Demo vs Live Mode)

- **Demo Mode (Default):** Runs completely client-side in browser memory and local SQLite. No AWS credentials or cloud dependencies required.
- **Live Mode:** Connects to the FastAPI backend at `http://127.0.0.1:8000/api`. If the live service fails or is unreachable, **explicit errors are displayed** rather than silently falling back to synthetic demo results.
