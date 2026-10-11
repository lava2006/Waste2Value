# Waste2Value — 5-Minute Hackathon Jury Demonstration Script

**Tagline:** Turn Waste Into Verified Value.  
**Audience:** Hackathon Judges, Enterprise ESG Compliance Officers, Recycling Auditors.  
**Demonstrator Role:** Founder & Principal Architect.

---

### Minute 0:00 – 1:00 | The Hook & The Problem
**Screen:** Navigate to `http://localhost:3000/` (Landing Page).

> **Spoken:**  
> "Judges, global enterprises generate over 60 million metric tons of e-waste every year. Companies pay billions to declare that their decommissioned IT equipment was responsibly recycled.  
> But today, that industry relies on unverified paper PDFs and trust. Greenwashing is rampant: certificates declare 10 tons recycled when the weighbridge scale recorded only 7.  
> 
> Meet **Waste2Value**. We are the AI-powered circular intelligence and verification platform that turns waste into verified value.  
> 
> We combine two proprietary engines:  
> 1. Our **Value Intelligence Engine** models elemental composition (gold, copper, palladium) to recommend the optimal circular pathway: reuse, refurbishment, or material recovery.  
> 2. Our **Evidence Intelligence Engine** extracts OCR evidence with Amazon Textract, performs deterministic mass-balance reconciliation across documents, flags fraud, and issues a cryptographically tamper-evident **Circularity Passport** signed with AWS KMS."

*(Scroll smoothly through the Landing Page showing the Dual Engine pillars and the Passport preview).*

---

### Minute 1:00 – 2:00 | Operational Dashboard & Clean Consignment (Scenario A)
**Screen:** Click **"Open Dashboard"** (`/dashboard`), then click **"View Consignments"** (`/batches`), select **`BATCH-2025-001`** (Munich IT Decommission).

> **Spoken:**  
> "Let's inspect our live operations. Here is Consignment **BATCH-2025-001**—5,000 kg of corporate IT equipment.  
> 
> Notice what our Evidence Intelligence Engine does immediately:  
> - It extracted the carrier transport waybill declaring 5,000 kg and the certified weighbridge ticket recording 4,960 kg.  
> - Our policy-driven engine calculated a 0.8% loss variance—well within our 2.0% allowable shredding tolerance.  
> - Our explainable risk scorecard rates this **LOW RISK** (score: 5/100).  
> - Below, our Value Intelligence Engine modeled the exact elemental yields: 1,180 kg of aluminum, 492 kg of copper, and 123 grams of gold—totaling over **$60,000 in net recovered circular wealth** with a recommended pathway of **COMPONENT RECOVERY**.  
> 
> Because this consignment has 100% evidence reconciliation, its status is **SUPPORTED**."

*(Click **"View Circularity Passport"** (`/passports/W2V-CP-0001`)). Confetti explodes.*

> **Spoken:**  
> "And here is the resulting **Circularity Passport**.  
> Notice two critical security guarantees:  
> 1. **RFC 8785 Canonical SHA-256 Digest**: If even one character is altered in transit, the hash breaks.  
> 2. **AWS KMS Asymmetric Digital Signature**: Signed via RSASSA_PSS_SHA_256 in AWS KMS HSM, guaranteeing non-repudiation and proving authoritative issuance."

---

### Minute 2:00 – 3:00 | The Borderline Variance (Scenario B)
**Screen:** Navigate to `/batches` and click **`BATCH-2025-002`** (EcoCycle Consumer Electronics).

> **Spoken:**  
> "Now let's examine what happens when reality diverges from paperwork.  
> 
> In **BATCH-2025-002**, the carrier waybill claimed 12,000 kg. But the intake weighbridge scale ticket only recorded 8,500 kg—a **3,500 kg shortfall (29.2% deficit)**!  
> 
> Look at our core architecture rule:  
> A discrepancy or high risk score **does not automatically reject a batch**. It is placed in **REVIEW REQUIRED**.  
> Why? Because real logistics have multi-truck consignments or carrier splits that need human investigation before permanent rejection.  
> 
> Look at our findings: Rule MB-002 clearly flags the variance and prompts the auditor to request the carrier master dispatch log. Passport issuance is strictly blocked until resolved."

---

### Minute 3:00 – 4:00 | Fraud Detection & Explicit Auditor Rejection (Scenario C)
**Screen:** Navigate to `/batches` and click **`BATCH-2025-003`** (Apex Metal Recovery).

> **Spoken:**  
> "Now, look at the darker side of e-waste: intentional fraud in **BATCH-2025-003**.  
> 
> Our 10 deterministic verification rules caught three critical violations:  
> 1. **Rule TL-001 (Chronological Anachronism):** The weighbridge ticket was dated February 14—**39 days before** the material was even collected on March 25! You cannot weigh scrap before picking it up.  
> 2. **Rule ID-001:** Entity name conflict between the claimed licensed operator and the invoice.  
> 3. **Rule DP-001:** Serial number `WB-2024-9901` collided with an archived historical consignment.  
> 
> Our risk scorecard flags this as **HIGH RISK (Score: 99/100)**.  
> As a compliance auditor, I can now click **'Record Explicit Rejection'**, enter the documented audit justification, and officially reject this consignment into the permanent audit ledger."

*(Click 'Record Explicit Rejection', input reason, and click Confirm. Status updates to REJECTED with full audit trail).*

---

### Minute 4:00 – 5:00 | Public QR Verification & Tampering Simulator
**Screen:** Click **"Open Public Verification"** (`/verify/W2V-CP-0001`).

> **Spoken:**  
> "Finally, let's step into the shoes of a corporate ESG auditor, carbon accounting firm, or public consumer scanning the passport's QR code on their smartphone.  
> 
> They land on our clean, public-safe verification page:  
> - It displays evidence-supported mass, recovered materials, and CO2 emissions avoided.  
> - It proves payload integrity via SHA-256 and issuer authenticity via AWS KMS.  
> - And notice our explicit transparency notice: Cryptographic verification proves that documentary records are untampered relative to the ledger; it does not replace independent on-site physical auditing.  
> 
> Let's simulate what happens if a malicious actor tries to tamper with the JSON payload..."

*(Click **'Simulate Payload Tampering'** button. UI instantly flashes Amber: 'Cryptographic Hash Mismatch — Tampering Detected').*

> **Spoken:**  
> "Instant detection. The cryptographic ledger rejects the payload.  
> 
> Judges, Waste2Value has 26 automated tests passing with 100% test coverage, a complete Next.js 14 frontend, a FastAPI verification engine, and ready-to-deploy AWS SAM serverless templates.  
> 
> Waste2Value transforms e-waste compliance from blind trust into verifiable, circular value.  
> Thank you, and we welcome your questions!"
