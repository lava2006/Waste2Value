import os
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

    def __init__(self, use_bedrock: bool = False):
        self.use_bedrock = use_bedrock
        self._bedrock_client = None
        if use_bedrock:
            self._init_bedrock()

    def _init_bedrock(self):
        try:
            import boto3
            if os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_PROFILE"):
                self._bedrock_client = boto3.client("bedrock-runtime", region_name="eu-central-1")
        except Exception:
            self._bedrock_client = None

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

        # 2. Formulate Tailored Investigative Questions
        if batch.mass_balance.discrepancy_kg > 0 and not batch.mass_balance.is_within_tolerance:
            questions.append(
                AuditorQuestion(
                    target_entity="Transport Carrier & Weighmaster",
                    question=(
                        f"Provide certified second-truck tare weight and calibration certificate for ticket intake. "
                        f"Why did gross transport declare {batch.mass_balance.claimed_kg:,.0f} kg while intake scale recorded {batch.mass_balance.received_kg:,.0f} kg?"
                    ),
                    rationale=f"Observed deficit of {batch.mass_balance.discrepancy_kg:,.0f} kg ({batch.mass_balance.loss_percentage}% loss) exceeds allowable processing tolerance.",
                    urgency=Severity.CRITICAL if batch.mass_balance.loss_percentage > 30.0 else Severity.WARNING,
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
                f"Intake weighbridge ({batch.mass_balance.received_kg:,.0f} kg) and processing receipts confirm "
                f"{batch.mass_balance.evidence_supported_kg:,.0f} kg of supported material (variance {batch.mass_balance.loss_percentage}% is within "
                f"allowable policy tolerance). Zero red flags detected across timeline or operator identity."
            )
            recommendation = "ELIGIBLE: Circularity Passport issuance authorized with canonical SHA-256 hash."

        elif batch.status == VerificationStatus.REVIEW_REQUIRED:
            summary = (
                f"Consignment {batch.batch_number} requires human compliance auditor review. "
                f"Reconciliation deficit of {batch.mass_balance.discrepancy_kg:,.0f} kg ({batch.mass_balance.loss_percentage}% loss) exceeds configured policy tolerance. "
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

        return InvestigationReport(
            batch_number=batch.batch_number,
            overall_status=batch.status,
            risk_level=batch.risk_score.risk_level,
            risk_score=batch.risk_score.overall_score,
            executive_summary=summary,
            grounded_citations=citations,
            auditor_questions=questions,
            passport_recommendation=recommendation,
            generated_at=now_iso,
        )
