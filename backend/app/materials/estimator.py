from datetime import datetime
from typing import Dict, List, Any
from app.schemas.batch import (
    EwasteCategory,
    CircularPathway,
    MaterialEstimate,
    MaterialFraction,
)

# Reference compositions and spot prices (USD/kg) as of March 2025
MATERIAL_DATABASE: Dict[EwasteCategory, Dict[str, Any]] = {
    EwasteCategory.IT_TELECOM: {
        "recommended_pathway": CircularPathway.MATERIAL_RECOVERY,
        "processing_cost_per_kg": 2.84,
        "fractions": [
            {"name": "Gold (Au 99.9%)", "cat": "precious_metal", "pct": 0.025, "price": 82500.0},
            {"name": "Silver (Ag)", "cat": "precious_metal", "pct": 0.096, "price": 980.0},
            {"name": "Copper Cathode (Cu)", "cat": "base_metal", "pct": 14.4, "price": 9.40},
            {"name": "Aluminum Ingot (Al)", "cat": "base_metal", "pct": 9.2, "price": 2.45},
            {"name": "Engineered Polymer (ABS/PC)", "cat": "polymer", "pct": 36.8, "price": 1.50},
        ],
        "assumptions": [
            "Gold recovery efficiency estimated at 92.5% for high-grade server PCBs.",
            "Spot pricing based on March 2025 benchmark rates (Au: $82,500/kg, Cu: $9.40/kg).",
            "Refining and pyrometallurgical cost modeled at $2.84/kg input mass.",
        ],
    },
    EwasteCategory.CONSUMER_ELECTRONICS: {
        "recommended_pathway": CircularPathway.COMPONENT_RECOVERY,
        "processing_cost_per_kg": 1.18,
        "fractions": [
            {"name": "Gold (Au Contacts)", "cat": "precious_metal", "pct": 0.015, "price": 82500.0},
            {"name": "Copper Busbars (Cu)", "cat": "base_metal", "pct": 16.5, "price": 9.40},
            {"name": "Structural Aluminum (Al)", "cat": "base_metal", "pct": 22.0, "price": 2.45},
            {"name": "Technical Plastics", "cat": "polymer", "pct": 32.0, "price": 1.93},
        ],
        "assumptions": [
            "Refurbishable cellular transceiver RF modules prioritized for component harvesting.",
            "Secondary copper and high-spec aluminum ingots recovered from chassis.",
        ],
    },
    EwasteCategory.LARGE_APPLIANCES: {
        "recommended_pathway": CircularPathway.MATERIAL_RECOVERY,
        "processing_cost_per_kg": 0.36,
        "fractions": [
            {"name": "Heavy Steel Scrap", "cat": "base_metal", "pct": 64.0, "price": 0.38},
            {"name": "Secondary Copper", "cat": "base_metal", "pct": 12.0, "price": 8.80},
            {"name": "Cast Aluminum", "cat": "base_metal", "pct": 18.0, "price": 2.10},
        ],
        "assumptions": [
            "Predominantly ferrous steel scrap and compressor copper windings.",
            "Mechanical shredding and magnetic separation cost estimated at $0.36/kg.",
        ],
    },
    EwasteCategory.SMALL_APPLIANCES: {
        "recommended_pathway": CircularPathway.RECYCLING,
        "processing_cost_per_kg": 0.55,
        "fractions": [
            {"name": "Copper Windings", "cat": "base_metal", "pct": 9.5, "price": 9.00},
            {"name": "Recycled Steel", "cat": "base_metal", "pct": 48.0, "price": 0.35},
            {"name": "Mixed Polymers", "cat": "polymer", "pct": 34.0, "price": 0.85},
        ],
        "assumptions": [
            "Low-grade consumer electronics with mixed housing.",
        ],
    },
    EwasteCategory.BATTERIES: {
        "recommended_pathway": CircularPathway.MATERIAL_RECOVERY,
        "processing_cost_per_kg": 4.10,
        "fractions": [
            {"name": "Lithium Carbonate (Li2CO3)", "cat": "base_metal", "pct": 6.8, "price": 18.50},
            {"name": "Cobalt (Co)", "cat": "base_metal", "pct": 12.0, "price": 28.00},
            {"name": "Nickel Cathode (Ni)", "cat": "base_metal", "pct": 22.0, "price": 16.20},
            {"name": "Battery-Grade Graphite", "cat": "other", "pct": 18.0, "price": 1.40},
        ],
        "assumptions": [
            "Hydrometallurgical black mass leaching yield benchmarked at 94%.",
        ],
    },
}

def estimate_material_value(category: EwasteCategory, evidence_supported_kg: float) -> MaterialEstimate:
    profile = MATERIAL_DATABASE.get(category, MATERIAL_DATABASE[EwasteCategory.IT_TELECOM])
    fractions: List[MaterialFraction] = []
    total_gross = 0.0

    for item in profile["fractions"]:
        qty = round(evidence_supported_kg * (item["pct"] / 100.0), 2)
        val = round(qty * item["price"], 2)
        total_gross += val
        fractions.append(
            MaterialFraction(
                material_name=item["name"],
                category=item["cat"],
                fraction_percentage=item["pct"],
                estimated_quantity_kg=qty,
                unit_price_usd=item["price"],
                estimated_value_usd=val,
            )
        )

    proc_cost = round(evidence_supported_kg * profile["processing_cost_per_kg"], 2)
    net_val = max(0.0, round(total_gross - proc_cost, 2))

    return MaterialEstimate(
        total_gross_value_usd=round(total_gross, 2),
        modeled_processing_cost_usd=proc_cost,
        net_estimated_recovery_value_usd=net_val,
        currency="USD",
        recommended_pathway=profile["recommended_pathway"],
        fractions=fractions,
        assumptions=profile["assumptions"],
        reference_price_date="2025-03-01",
        dataset_version="LME-COMEX-2025.1",
        calculated_at=datetime.utcnow().isoformat() + "Z",
    )
