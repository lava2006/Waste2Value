import os
import json
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from app.schemas.batch import (
    BatchResponse,
    VerificationFinding,
    VerificationStatus,
    RiskLevel,
    Severity,
)

class GroundedCitation(BaseModel):
    document_id: str
    document_name: str
    field_label: str
    observed_value: Any
    page_number: int = 1

class AuditorQuestion(BaseModel):
    target_entity: str # e.g. "Carrier", "Licensed Recycler", "Weighmaster"
    question: str
    rationale: str
    urgency: Severity

class InvestigationReport(BaseModel):
    batch_number: str
    overall_status: VerificationStatus
    risk_level: RiskLevel
    risk_score: int
    executive_summary: str
    grounded_citations: List[GroundedCitation] = Field(default_factory=list)
    auditor_questions: List[AuditorQuestion] = Field(default_factory=list)
    passport_recommendation: str
    generated_by: str = "Waste2Value Investigator Engine (Amazon Bedrock / Deterministic Agent)"
    generated_at: str

class InvestigatorAgent:
    """
    AI Investigator Agent for e-waste compliance audits.
    Synthesizes documentary findings into grounded, explainable investigative reports.
    """

    DEFAULT_MODEL = "us.amazon.nova-lite-v1:0"

    def __init__(self, use_bedrock: Optional[bool] = None, model_id: Optional[str] = None):
        self.use_bedrock = use_bedrock if use_bedrock is not None else os.getenv("AI", "").lower() == "bedrock"
        self.model_id = model_id or os.getenv("BEDROCK_MODEL_ID") or self.DEFAULT_MODEL
        self._bedrock_client = None
        if self.use_bedrock:
            self._init_bedrock()

    def _init_bedrock(self):
        try:
            import boto3
            self._bedrock_client = boto3.client(
                "bedrock-runtime", region_name=os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-east-1"))
            )
        except Exception as exc:
            raise RuntimeError(f"AI=bedrock but the Bedrock client could not be created: {exc}") from exc

    def _bedrock_narrative(self, batch: BatchResponse, citations: List[GroundedCitation]) -> Dict[str, Any]:
        """Ask Claude (Amazon Bedrock Converse) for a summary and auditor questions, grounded ONLY on the provided facts."""
        facts = {
            "batch_number": batch.batch_number,
            "verification_status": batch.status.value,
            "risk": {"level": batch.risk_score.risk_level.value, "score": batch.risk_score.overall_score},
            "claimed_kg": batch.mass_balance.claimed_kg,
            "received_kg": batch.mass_balance.received_kg,
            "processed_kg": batch.mass_balance.processed_kg,
            "evidence_supported_kg": batch.mass_balance.evidence_supported_kg,
            "tolerance_percent": batch.mass_balance.tolerance_percentage,
            "findings": [
                {"rule": f.rule_id, "severity": f.severity.value, "title": f.title, "description": f.description,
                 "observed": f.observed_value, "expected": f.expected_value}
                for f in batch.findings
            ],
            "citations": [c.model_dump() for c in citations],
        }
        system = (
            "You are a compliance investigator assistant for an e-waste recycling verification platform. "
            "Use ONLY the JSON facts provided. Never invent quantities, documents, names or dates. "
            "Unknown quantities are null and must be described as 'not recorded'. Do not claim physical recycling occurred. "
            "Respond with a single JSON object: {\"executive_summary\": string (max 120 words), "
            "\"auditor_questions\": [{\"target_entity\": string, \"question\": string, \"rationale\": string, "
            "\"urgency\": \"critical\"|\"warning\"|\"info\"}] (max 4)}. No prose outside the JSON."
        )
        try:
            res = self._bedrock_client.converse(
                modelId=self.model_id,
                system=[{"text": system}],
                messages=[{"role": "user", "content": [{"text": json.dumps(facts, default=str)}]}],
                inferenceConfig={"maxTokens": 700, "temperature": 0.2},
            )
            text = res["output"]["message"]["content"][0]["text"].strip()
            if text.startswith("```"):
                text = text.strip("`").split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(text[text.index("{"): text.rindex("}") + 1])
        except Exception as exc:
            raise RuntimeError(f"Amazon Bedrock investigation failed ({self.model_id}): {exc}") from exc

    def investigate(self, batch: BatchResponse) -> InvestigationReport:
        now_iso = datetime.utcnow().isoformat() + "Z"
        citations: List[GroundedCitation] = []
        questions: List[AuditorQuestion] = []

        # 1. Extract Grounded Citations from Batch Documents
        for doc in batch.documents:
            for f in doc.extracted_fields:
                if f.is_discrepant or f.field_name in ["net_weight", "manifest_weight", "waybill_number"]:
                    citations.append(
                        GroundedCitation(
                            document_id=doc.id,
                            document_name=doc.file_name,
                            field_label=f.label,
                            observed_value=f.value,
                            page_number=f.page_number,
                        )
                    )

        def kg(v):
            return "not recorded" if v is None else f"{v:,.0f} kg"

        # 2. Formulate Tailored Investigative Questions
        if (batch.mass_balance.discrepancy_kg or 0) > 0 and not batch.mass_balance.is_within_tolerance:
            questions.append(
                AuditorQuestion(
                    target_entity="Transport Carrier & Weighmaster",
                    question=(
                        f"Provide certified second-truck tare weight and calibration certificate for ticket intake. "
                        f"Why did gross transport declare {batch.mass_balance.claimed_kg:,.0f} kg while intake scale recorded {kg(batch.mass_balance.received_kg)}?"
                    ),
                    rationale=f"Observed deficit of {kg(batch.mass_balance.discrepancy_kg)} ({batch.mass_balance.loss_percentage}% variance versus claim) exceeds allowable processing tolerance.",
                    urgency=Severity.CRITICAL if (batch.mass_balance.loss_percentage or 0) > 30.0 else Severity.WARNING,
                )
            )

        if any(f.rule_id == "TL-001" for f in batch.findings):
            questions.append(
                AuditorQuestion(
                    target_entity="Recycling Facility Intake Supervisor",
                    question="Clarify why weighbridge scale intake timestamp precedes physical collection dispatch.",
                    rationale="Chronological impossibility detected in consignment timeline.",
                    urgency=Severity.CRITICAL,
                )
            )

        if any(f.rule_id == "ID-001" for f in batch.findings):
            questions.append(
                AuditorQuestion(
                    target_entity="Contracting Enterprise",
                    question=f"Verify corporate affiliation between claimed operator '{batch.recycler_name}' and entity referenced on invoice.",
                    rationale="Registration identifier discrepancy detected across manifest and facility license records.",
                    urgency=Severity.CRITICAL,
                )
            )

        # 3. Formulate Executive Summary
        if batch.status == VerificationStatus.SUPPORTED:
            summary = (
                f"Consignment {batch.batch_number} has been verified clean with 100% documentary reconciliation. "
                f"Intake weighbridge ({kg(batch.mass_balance.received_kg)}) and processing receipts confirm "
                f"{kg(batch.mass_balance.evidence_supported_kg)} of supported material (variance {batch.mass_balance.loss_percentage}% is within "
                f"allowable policy tolerance). Zero red flags detected across timeline or operator identity."
            )
            recommendation = "ELIGIBLE: Circularity Passport issuance authorized with canonical SHA-256 hash."

        elif batch.status == VerificationStatus.REVIEW_REQUIRED:
            summary = (
                f"Consignment {batch.batch_number} requires human compliance auditor review. "
                f"Reconciliation deficit of {kg(batch.mass_balance.discrepancy_kg)} ({batch.mass_balance.loss_percentage}% variance versus claim) exceeds configured policy tolerance. "
                f"Risk score is rated {batch.risk_score.risk_level.value.upper()} ({batch.risk_score.overall_score}/100). "
                f"Evidence is preserved in the audit log pending carrier explanation."
            )
            recommendation = "PAUSED: Passport issuance prohibited until carrier explanation and second weighbridge ticket are attached."

        else:
            summary = (
                f"Consignment {batch.batch_number} has been marked REJECTED based on explicit documented audit criteria. "
                f"Severe inconsistencies or critical timeline/identity conflicts prevent certification."
            )
            recommendation = "PROHIBITED: Passport issuance permanently denied. Consignment dossier escalated to compliance legal counsel."

        generated_by = "Waste2Value deterministic rule summary (no AI model used)"
        if self.use_bedrock:
            narrative = self._bedrock_narrative(batch, citations)
            summary = str(narrative.get("executive_summary") or summary)
            parsed: List[AuditorQuestion] = []
            for q in narrative.get("auditor_questions", [])[:4]:
                try:
                    parsed.append(AuditorQuestion(
                        target_entity=str(q["target_entity"]), question=str(q["question"]),
                        rationale=str(q["rationale"]), urgency=Severity(q.get("urgency", "warning")),
                    ))
                except Exception:
                    continue
            if parsed:
                questions = parsed
            generated_by = f"Amazon Bedrock ({self.model_id}), grounded on this batch's verification findings"

        return InvestigationReport(
            batch_number=batch.batch_number,
            overall_status=batch.status,
            risk_level=batch.risk_score.risk_level,
            risk_score=batch.risk_score.overall_score,
            executive_summary=summary,
            grounded_citations=citations,
            auditor_questions=questions,
            passport_recommendation=recommendation,
            generated_by=generated_by,
            generated_at=now_iso,
        )
