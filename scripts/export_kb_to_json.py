#!/usr/bin/env python3
"""
GermlineRx — Export knowledge bases to JSON for static (browser-only) mode.

Run this script once before building the static frontend:
    python scripts/export_kb_to_json.py

Outputs to frontend/src/static-mode/:
    tier1_kb.json   — FDA-approved therapy KB
    tier3_kb.json   — Emerging pipeline KB
    alias_table.json — Mutation alias table (normalizer)
"""
from __future__ import annotations
import json
import os
import sys

# Make sure we can import the backend modules
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(SCRIPT_DIR, "..", "germline_webapp", "backend")
sys.path.insert(0, BACKEND_DIR)

OUTPUT_DIR = os.path.join(
    SCRIPT_DIR, "..", "germline_webapp", "frontend", "src", "static-mode"
)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def export_tier1():
    from app.engine.tier1 import THERAPY_KB
    out_path = os.path.join(OUTPUT_DIR, "tier1_kb.json")
    with open(out_path, "w") as f:
        json.dump(THERAPY_KB, f, indent=2, default=str)
    print(f"  ✓ tier1_kb.json — {len(THERAPY_KB)} entries")


def export_tier3():
    from app.engine.tier3 import PIPELINE_KB
    out_path = os.path.join(OUTPUT_DIR, "tier3_kb.json")
    with open(out_path, "w") as f:
        json.dump(PIPELINE_KB, f, indent=2, default=str)
    print(f"  ✓ tier3_kb.json — {len(PIPELINE_KB)} entries")


def export_alias_table():
    from app.engine.normalizer import ALIAS_TABLE, DISEASE_TO_GENE
    out_path = os.path.join(OUTPUT_DIR, "alias_table.json")
    payload = {
        "aliases": ALIAS_TABLE,
        "disease_to_gene": DISEASE_TO_GENE,
    }
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2, default=str)
    print(f"  ✓ alias_table.json — {len(ALIAS_TABLE)} aliases, {len(DISEASE_TO_GENE)} disease mappings")


if __name__ == "__main__":
    print("Exporting GermlineRx knowledge bases to JSON...")
    export_tier1()
    export_tier3()
    export_alias_table()
    print(f"\nOutput directory: {os.path.abspath(OUTPUT_DIR)}")
    print("Done. You can now build the static frontend with:")
    print("  cd germline_webapp/frontend && VITE_STATIC_MODE=true npm run build")
