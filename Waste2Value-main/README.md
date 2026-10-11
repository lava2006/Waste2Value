# Waste2Value — Circular Intelligence & Verification Platform

> **Turn Waste Into Verified Value.**

Waste2Value is an enterprise sustainability platform combining circular-economy value modeling with deterministic documentary verification. It enables recyclers, electronics OEMs, and environmental auditors to verify recycling claims against multi-stage physical documentation and issue cryptographically verifiable **Circularity Passports**.

---

## 1. Dual-Engine Architecture

1. **Value Intelligence Engine**
   - **Composition Modeling**: Estimates recoverable fractions (Au, Ag, Cu, Al, technical polymers, battery black mass) across 5 standard WEEE categories (*IT & Telecom*, *Consumer Electronics*, *Large Appliances*, *Small Appliances*, *Batteries*).
   - **Spot Valuation**: Models benchmark gross and net recovery value using spot market price indices (LME / COMEX benchmark datasets).
   - **Circular Pathway Recommendation**: Classifies batches into optimal hierarchy tiers: *Reuse*, *Refurbishment*, *Component Recovery*, *Material Recovery*, or *Recycling*.

2. **Evidence Intelligence Engine**
   - **Document Processing**: Extracts declared quantities, serials, licenses, dates, and scale measurements from transport waybills, weighbridge tickets, destruction certificates, and invoices.
   - **Deterministic Mass-Balance Reconciliation**: Reconciles mass across lifecycle stages (*Claimed* $\rightarrow$ *Transported* $\rightarrow$ *Received* $\rightarrow$ *Processed* $\rightarrow$ *Recovered*) against stream-specific loss tolerances (1.5% to 5.0%).
   - **Multi-Factor Risk Scoring**: Deterministic 0–100 risk score tracking evidence completeness, cross-document consistency, timeline plausibility, and identity matching.

3. **Cryptographic Circularity Passport**
   - **RFC 8785 Canonical Hashing**: Deterministic JSON payload serialization hashed via SHA-256 to ensure tamper-evident ledger integrity.
   - **AWS KMS Digital Signatures**: Asymmetric signing (`RSASSA_PSS_SHA_256`) guaranteeing issuer authenticity and non-repudiation.
   - **Public Verification & QR Portal**: Independent validation portal with live 1-byte tamper detection simulation and formal revocation tracking.

---

## 2. Technology Stack

- **Frontend**: Next.js 14.2 (App Router), React 18, TypeScript (strict), Tailwind CSS, Recharts, Lucide Icons, QRCodeSVG.
- **Backend**: Python 3.11, FastAPI, Pydantic v2, SQLAlchemy, Uvicorn, Mangum (AWS Lambda ASGI).
- **Persistence**: SQLite (Local development & demonstration) and Amazon DynamoDB (Single-table cloud persistence).
- **Cloud Infrastructure**: AWS SAM (`template.yaml`), S3, API Gateway HTTP API, Lambda, DynamoDB, KMS, Amazon Textract, Amazon Bedrock, Step Functions.
- **Automated Testing**: Pytest (34 passing test suites with boundary, scenario, security, and KMS coverage).

---

## 3. Quickstart (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm

### Backend
```powershell
# From project root
$env:PYTHONPATH="backend"
& "python" -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```
API Documentation available at: `http://127.0.0.1:8000/docs`

### Frontend
```powershell
cd frontend
npm run dev
```
Web Application accessible at: `http://localhost:3000`

---

## 4. Repository Structure

```text
Waste2Value/
├── backend/
│   ├── app/
│   │   ├── api/routes.py            # REST API endpoints & public verification
│   │   ├── core/config.py           # Application settings & environment
│   │   ├── extraction/              # Textract & Demo document AI extractors
│   │   ├── investigation/           # Bedrock AI investigator agent & multimodal analyzer
│   │   ├── materials/estimator.py   # Value Intelligence material estimation
│   │   ├── passports/               # Canonical serialization & KMS signing
│   │   ├── repositories/            # SQLite & DynamoDB persistence layers
│   │   ├── schemas/batch.py         # Pydantic v2 data models
│   │   ├── scoring/engine.py        # 0-100 deterministic risk engine
│   │   ├── verification/            # Mass balance & 10 deterministic audit rules
│   │   └── main.py                  # FastAPI app & Mangum Lambda handler
│   ├── tests/                       # 34 passing Pytest unit & integration tests
│   └── requirements.txt             # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/                     # Next.js App Router (9 responsive pages)
│   │   ├── components/ui/           # Reusable eco-tech UI primitives & AppShell
│   │   ├── lib/api-client.ts        # Typed API client & dual-mode dispatcher
│   │   └── types/index.ts           # Shared TypeScript interfaces
│   ├── tailwind.config.ts           # Eco-Tech design tokens & theme configuration
│   └── package.json                 # Frontend dependencies
├── template.yaml                    # AWS SAM serverless infrastructure-as-code
├── ARCHITECTURE.md                  # Comprehensive architectural specification
├── AWS_DEPLOYMENT.md                # AWS deployment & SAM execution guide
├── SECURITY.md                      # Security model, threat analysis & IAM policies
├── LOCAL_SETUP.md                   # Step-by-step local execution instructions
├── DEMO_SCRIPT.md                   # 5-minute hackathon demonstration script
└── TESTING_EVALUATION.md            # Boundary testing & cryptographic evaluation
```

---

## 5. Demonstration Scenarios

Three deterministic test scenarios are pre-loaded in both the backend and frontend:

- **Scenario A (Clean Batch — `batch-001`)**: 5,000 kg IT blades; 4,920 kg certified recovery (1.6% shredding variance within 2.0% tolerance); Low Risk (14/100); Eligible for Circularity Passport `W2V-CP-0001`.
- **Scenario B (Borderline Discrepancy — `batch-002`)**: 12,000 kg telecom radios; 8,500 kg weighbridge intake (3,500 kg / 29.2% deficit) and missing processing invoice; Medium Risk (58/100); Status: `REVIEW_REQUIRED`.
- **Scenario C (High-Risk Suspicious Claim — `batch-003`)**: 25,000 kg appliances; 11,200 kg scale ticket (55.2% deficit); Chronological anachronism (scale date precedes collection by 39 days); Entity mismatch; High Risk (92/100); Status: `REJECTED`.

---

## 6. License
MIT License. Turn Waste Into Verified Value.
