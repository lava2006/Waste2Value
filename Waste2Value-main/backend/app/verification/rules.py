from datetime import datetime
from typing import List, Optional, Tuple, Dict, Any
from app.schemas.batch import (
    BatchCreate,
    EvidenceDocument,
    VerificationFinding,
    Severity,
    DocumentType,
)

def parse_iso_date(date_str: str) -> Optional[datetime]:
    try:
        if "T" in date_str:
            return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        return None

def normalize_to_kg(quantity: float, unit: str) -> Tuple[float, Optional[str]]:
    """Rule 1: Unit Normalization"""
    u = unit.lower().strip()
    if u in ["kg", "kilogram", "kilograms"]:
        return quantity, None
    elif u in ["metric_ton", "ton", "tonne", "tonnes", "t"]:
        return quantity * 1000.0, None
    elif u in ["lb", "lbs", "pound", "pounds"]:
        return quantity * 0.45359237, None
    else:
        return quantity, f"Unsupported unit '{unit}'. Standard canonical unit is 'kg'."

def evaluate_mass_balance(
    claimed_kg: float,
    transported_kg: float,
    received_kg: float,
    processed_kg: float,
    tolerance_percent: float = 2.0,
    documents: List[EvidenceDocument] = None
) -> Tuple[float, float, bool, List[VerificationFinding]]:
    """Rules 2, 3, 4, 5: Mass balance & reconciliation checks"""
    findings: List[VerificationFinding] = []
    
    # Supported kg is the minimum of verified documentary receipts
    evidence_supported_kg = min(received_kg, processed_kg) if processed_kg > 0 else received_kg
    discrepancy_kg = abs(claimed_kg - evidence_supported_kg)
    loss_percent = (discrepancy_kg / claimed_kg * 100.0) if claimed_kg > 0 else 0.0
    is_within_tolerance = loss_percent <= tolerance_percent

    now_iso = datetime.utcnow().isoformat() + "Z"

    if is_within_tolerance:
        findings.append(
            VerificationFinding(
                id="find-MB-001",
                rule_id="MB-001",
                rule_name="Mass-Balance Loss Tolerance Check",
                severity=Severity.INFO,
                title="Mass Balance Variance Conforms to Standard Loss Policy",
                description=f"Observed variance of {discrepancy_kg:.1f} kg ({loss_percent:.1f}%) is within configured tolerance ({tolerance_percent:.1f}%).",
                observed_value=f"{discrepancy_kg:.1f} kg ({loss_percent:.1f}%)",
                expected_value=f"≤ {tolerance_percent:.1f}% tolerance",
                difference=f"{discrepancy_kg:.1f} kg",
                unit="kg",
                recommended_action="Documented loss supported by processing parameters. Eligible for Circularity Passport.",
                created_at=now_iso,
            )
        )
    elif loss_percent > 30.0:
        findings.append(
            VerificationFinding(
                id="find-MB-003",
                rule_id="MB-003",
                rule_name="Severe Mass-Balance Reconciliation Deficit",
                severity=Severity.CRITICAL,
                title=f"Severe Mass Balance Deficit: {loss_percent:.1f}% Shortfall",
                description=f"Claim declares {claimed_kg:,.0f} kg, but intake weighbridge recorded only {received_kg:,.0f} kg ({discrepancy_kg:,.0f} kg deficit). Exceeds allowable shredding loss threshold.",
                observed_value=f"{received_kg:,.0f} kg",
                expected_value=f"{claimed_kg:,.0f} kg (± {tolerance_percent}%)",
                difference=f"{discrepancy_kg:,.0f} kg shortfall",
                unit="kg",
                recommended_action="Initiate formal physical audit. Passport issuance prohibited.",
                created_at=now_iso,
            )
        )
    else:
        findings.append(
            VerificationFinding(
                id="find-MB-002",
                rule_id="MB-002",
                rule_name="Collection-to-Receipt Reconciliation",
                severity=Severity.WARNING,
                title=f"Material Quantity Shortfall: {loss_percent:.1f}% Variance",
                description=f"Observed variance of {discrepancy_kg:.1f} kg exceeds configured {tolerance_percent:.1f}% tolerance. Transported {transported_kg:,.0f} kg vs intake {received_kg:,.0f} kg.",
                observed_value=f"{received_kg:,.0f} kg",
                expected_value=f"{claimed_kg:,.0f} kg (± {tolerance_percent}%)",
                difference=f"{discrepancy_kg:,.0f} kg shortfall",
                unit="kg",
                recommended_action="Request carrier explanation or consignment second-truck waybill.",
                created_at=now_iso,
            )
        )

    return evidence_supported_kg, loss_percent, is_within_tolerance, findings

def evaluate_timeline_plausibility(
    collection_date_str: str,
    processing_date_str: str,
    documents: List[EvidenceDocument]
) -> List[VerificationFinding]:
    """Rule 6: Timeline Plausibility"""
    findings: List[VerificationFinding] = []
    now_iso = datetime.utcnow().isoformat() + "Z"

    c_date = parse_iso_date(collection_date_str)
    p_date = parse_iso_date(processing_date_str)

    if c_date and p_date:
        if p_date < c_date:
            days_diff = (c_date - p_date).days
            findings.append(
                VerificationFinding(
                    id="find-TL-001",
                    rule_id="TL-001",
                    rule_name="Timeline Plausibility Validation",
                    severity=Severity.CRITICAL,
                    title="Chronological Anachronism in Consignment Sequence",
                    description=f"Processing scale date ({processing_date_str}) precedes collection date ({collection_date_str}) by {days_diff} days. Material cannot be weighed prior to physical collection.",
                    observed_value=f"Processing: {processing_date_str} < Collection: {collection_date_str}",
                    expected_value="Collection Date ≤ Processing Date",
                    recommended_action="Flag for compliance review. Suspected reused or fraudulent weighbridge ticket.",
                    created_at=now_iso,
                )
            )

    return findings

def evaluate_recycler_consistency(
    claimed_recycler_name: str,
    claimed_license: str,
    documents: List[EvidenceDocument]
) -> List[VerificationFinding]:
    """Rule 7: Recycler Consistency"""
    findings: List[VerificationFinding] = []
    now_iso = datetime.utcnow().isoformat() + "Z"

    # Search extracted fields for recycler names
    for doc in documents:
        for f in doc.extracted_fields:
            if f.field_name in ["recycler_name", "operator_name", "entity_name"]:
                val = str(f.value).strip().lower()
                claimed = claimed_recycler_name.strip().lower()
                if claimed not in val and val not in claimed:
                    findings.append(
                        VerificationFinding(
                            id=f"find-ID-001-{doc.id}-{f.id}",
                            rule_id="ID-001",
                            rule_name="Recycler Identity & Registration Consistency",
                            severity=Severity.CRITICAL,
                            title="Unregistered Recycler Entity Invoiced",
                            description=f"Document '{doc.file_name}' specifies entity '{f.value}' which conflicts with claimed licensed operator '{claimed_recycler_name}'.",
                            observed_value=str(f.value),
                            expected_value=claimed_recycler_name,
                            source_document_id=doc.id,
                            source_document_name=doc.file_name,
                            source_field_id=f.id,
                            lifecycle_stage="identity",
                            recommended_action="Verify corporate affiliation or request accredited sub-contractor license.",
                            created_at=now_iso,
                        )
                    )

    return findings

def evaluate_duplicate_evidence(
    documents: List[EvidenceDocument],
    known_serials: List[str] = None
) -> List[VerificationFinding]:
    """Rule 8: Duplicate Evidence Detection"""
    findings: List[VerificationFinding] = []
    now_iso = datetime.utcnow().isoformat() + "Z"
    known_serials = known_serials or ["WB-2024-9901"]

    for doc in documents:
        for f in doc.extracted_fields:
            if f.field_name in ["waybill_number", "serial_number", "certificate_id"]:
                val = str(f.value).strip()
                if val in known_serials:
                    findings.append(
                        VerificationFinding(
                            id=f"find-DP-001-{doc.id}-{f.id}",
                            rule_id="DP-001",
                            rule_name="Duplicate Evidence Identification",
                            severity=Severity.WARNING,
                            title="Manifest Serial Collision with Archive Records",
                            description=f"Document serial '{val}' matches an archived consignment in the historical registry.",
                            observed_value=f"Serial {val} previously used",
                            expected_value="Unique consignment serial",
                            source_document_id=doc.id,
                            source_document_name=doc.file_name,
                            source_field_id=f.id,
                            lifecycle_stage="evidence_uniqueness",
                            recommended_action="Verify physical manifest against carrier master dispatch log.",
                            created_at=now_iso,
                        )
                    )

    return findings

def evaluate_evidence_completeness(
    documents: List[EvidenceDocument],
    required_types: List[DocumentType] = None
) -> Tuple[float, List[VerificationFinding]]:
    """Rule 9: Evidence Completeness"""
    findings: List[VerificationFinding] = []
    now_iso = datetime.utcnow().isoformat() + "Z"
    
    required_types = required_types or [
        DocumentType.TRANSPORT_WAYBILL,
        DocumentType.WEIGHBRIDGE_RECORD,
    ]

    present_types = {d.document_type for d in documents}
    missing_types = [t for t in required_types if t not in present_types]

    score = 100.0 - (len(missing_types) / len(required_types) * 50.0) if required_types else 100.0

    if missing_types:
        missing_names = ", ".join([t.value.replace("_", " ").title() for t in missing_types])
        findings.append(
            VerificationFinding(
                id="find-EC-001",
                rule_id="EC-001",
                rule_name="Evidence Completeness Verification",
                severity=Severity.WARNING,
                title="Mandatory Consignment Records Missing",
                description=f"Dossier lacks required documentary evidence: {missing_names}.",
                observed_value=f"Missing: {missing_names}",
                expected_value="All mandatory documents attached",
                recommended_action="Attach certified document before requesting Circularity Passport issuance.",
                created_at=now_iso,
            )
        )

    return score, findings
