import re
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.extraction.base import BaseExtractionProvider
from app.schemas.batch import (
    EvidenceDocument,
    DocumentType,
    ExtractedField,
    BoundingBox,
)

class DemoExtractionProvider(BaseExtractionProvider):
    """
    Synthetic Document AI Provider simulating Amazon Textract OCR & Key-Value extraction.
    Generates realistic extracted fields, spatial bounding boxes, and confidence levels.
    """

    def extract_document(
        self,
        file_name: str,
        file_bytes: Optional[bytes] = None,
        document_type: Optional[DocumentType] = None,
        batch_id: Optional[str] = None,
    ) -> EvidenceDocument:
        fn = file_name.lower()
        now_iso = datetime.utcnow().isoformat() + "Z"
        doc_id = f"doc-{int(datetime.utcnow().timestamp() * 1000) % 100000}"
        b_id = batch_id or "batch-demo"

        # Use explicit document_type if provided; otherwise infer from file name
        if document_type:
            inferred_type = document_type
        else:
            inferred_type = DocumentType.OTHER
            if "weighbridge" in fn or "scale" in fn or "wbr" in fn or "ticket" in fn:
                inferred_type = DocumentType.WEIGHBRIDGE_RECORD
            elif "waybill" in fn or "wb-" in fn or "manifest" in fn:
                inferred_type = DocumentType.TRANSPORT_WAYBILL
            elif "cert" in fn or "certificate" in fn:
                inferred_type = DocumentType.RECYCLING_CERTIFICATE
            elif "photo" in fn or "image" in fn or "jpg" in fn or "png" in fn:
                inferred_type = DocumentType.FACILITY_PHOTO

        fields: List[ExtractedField] = []
        snippet = ""

        if inferred_type == DocumentType.TRANSPORT_WAYBILL:
            title = "Carrier Transport Waybill"
            # Extract or simulate waybill fields
            serial = "WB-2025-4421"
            if "suspect" in fn or "9901" in fn:
                serial = "WB-2024-9901" # Colliding serial
            elif "8819" in fn:
                serial = "WB-2025-8819"

            fields = [
                ExtractedField(
                    id=f"f-{doc_id}-1",
                    document_id=doc_id,
                    field_name="waybill_number",
                    label="Consignment Waybill Number",
                    value=serial,
                    confidence=0.98,
                    page_number=1,
                    bounding_box=BoundingBox(top=14.2, left=72.0, width=22.5, height=3.8),
                ),
                ExtractedField(
                    id=f"f-{doc_id}-2",
                    document_id=doc_id,
                    field_name="manifest_weight",
                    label="Gross Cargo Weight",
                    value=5000.0 if "001" in fn or "clean" in fn else 12000.0,
                    unit="kg",
                    confidence=0.97,
                    page_number=1,
                    bounding_box=BoundingBox(top=48.5, left=68.0, width=18.0, height=4.2),
                ),
                ExtractedField(
                    id=f"f-{doc_id}-3",
                    document_id=doc_id,
                    field_name="carrier_name",
                    label="Authorized Logistics Carrier",
                    value="TransEuro EcoLogistics BV",
                    confidence=0.96,
                    page_number=1,
                    bounding_box=BoundingBox(top=24.0, left=15.0, width=35.0, height=3.5),
                ),
                ExtractedField(
                    id=f"f-{doc_id}-4",
                    document_id=doc_id,
                    field_name="dispatch_date",
                    label="Collection Dispatch Date",
                    value="2025-03-10",
                    confidence=0.99,
                    page_number=1,
                    bounding_box=BoundingBox(top=18.0, left=72.0, width=20.0, height=3.2),
                ),
            ]
            snippet = f"CARRIER MANIFEST: {serial} | CARGO: Electronic Scrap (WEEE Category 3) | DECLARED WEIGHT: 5,000 KG | DRIVER SIGNATURE: VERIFIED"

        elif inferred_type == DocumentType.WEIGHBRIDGE_RECORD:
            title = "Weighbridge Scale Ticket"
            net_val = 4960.0
            if "1104" in fn or "borderline" in fn:
                net_val = 8500.0
            elif "suspect" in fn or "feb14" in fn:
                net_val = 11200.0

            fields = [
                ExtractedField(
                    id=f"f-{doc_id}-1",
                    document_id=doc_id,
                    field_name="ticket_number",
                    label="Scale Ticket Number",
                    value="WBR-2025-9912",
                    confidence=0.99,
                    page_number=1,
                    bounding_box=BoundingBox(top=10.5, left=65.0, width=25.0, height=4.0),
                ),
                ExtractedField(
                    id=f"f-{doc_id}-2",
                    document_id=doc_id,
                    field_name="net_weight",
                    label="Certified Net Intake Weight",
                    value=net_val,
                    unit="kg",
                    confidence=0.99,
                    page_number=1,
                    bounding_box=BoundingBox(top=62.0, left=62.0, width=24.0, height=5.0),
                ),
                ExtractedField(
                    id=f"f-{doc_id}-3",
                    document_id=doc_id,
                    field_name="scale_operator",
                    label="Certified Weighmaster",
                    value="K. Schneider (Badge #441)",
                    confidence=0.94,
                    page_number=1,
                    bounding_box=BoundingBox(top=85.0, left=12.0, width=30.0, height=3.5),
                ),
            ]
            snippet = f"CERTIFIED AUTOMATIC SCALE RECORD | TICKET: WBR-9912 | GROSS: 18,460 KG | TARE: 13,500 KG | NET INTAKE: {net_val:,.0f} KG | CALIBRATION: NIST EN45501"

        elif inferred_type == DocumentType.RECYCLING_CERTIFICATE:
            title = "Recycling & Recovery Certificate"
            fields = [
                ExtractedField(
                    id=f"f-{doc_id}-1",
                    document_id=doc_id,
                    field_name="certificate_number",
                    label="Official Certificate Identifier",
                    value="CERT-2025-0891",
                    confidence=0.99,
                    page_number=1,
                    bounding_box=BoundingBox(top=12.0, left=55.0, width=35.0, height=4.0),
                ),
                ExtractedField(
                    id=f"f-{doc_id}-2",
                    document_id=doc_id,
                    field_name="certified_weight",
                    label="Processed Recoverable Weight",
                    value=4920.0,
                    unit="kg",
                    confidence=0.99,
                    page_number=1,
                    bounding_box=BoundingBox(top=45.0, left=50.0, width=25.0, height=4.5),
                ),
            ]
            snippet = "EUROPEAN WEEE DIRECTIVE COMPLIANCE CERTIFICATE | ACCREDITED RECYCLING FACILITY #8841 | AUDITED MASS: 4,920 KG | SHREDDING EFFICIENCY: 98.4%"

        else:
            title = "Documentary Evidence Attachment"
            fields = [
                ExtractedField(
                    id=f"f-{doc_id}-1",
                    document_id=doc_id,
                    field_name="document_identifier",
                    label="Document Reference",
                    value=file_name.split(".")[0].upper(),
                    confidence=0.92,
                    page_number=1,
                )
            ]
            snippet = f"ATTACHED EVIDENCE DOSSIER: {file_name} | TEXTRACT OCR COMPLETE | 1 KEY-VALUE PAIR IDENTIFIED"

        return EvidenceDocument(
            id=doc_id,
            batch_id=b_id,
            title=title,
            document_type=inferred_type,
            file_name=file_name,
            file_size="1.4 MB",
            upload_timestamp=now_iso,
            status="extracted",
            extracted_text_snippet=snippet,
            extracted_fields=fields,
        )
