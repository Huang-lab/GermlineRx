"""
GermlineRx — Tier 3: Emerging Pipeline
Curated knowledge base of gene therapy, ASO, CRISPR, mRNA, and RNAi programs
not yet approved but in active development.
"""
from __future__ import annotations
from typing import Optional

PIPELINE_KB: list[dict] = [
    {
        "gene": "CFTR",
        "approach": "mRNA Therapy",
        "description": "Inhaled CFTR mRNA encapsulated in lipid nanoparticles to restore CFTR protein in airway epithelial cells — mutation-agnostic approach that could help patients with any CFTR mutation including those not responsive to modulators.",
        "stage": "Preclinical / Early Phase",
        "target": "CFTR mRNA restoration",
        "key_programs": ["Spirovant Sciences", "ReCode Therapeutics"],
        "caveat": "Repeated dosing required. Delivery efficiency to lower airways still being optimized. Note: Sanofi/Translate Bio MRT5005 was discontinued in 2022 after Phase 2 results.",
        "n_of_1_flag": False,
    },
    {
        "gene": "DMD",
        "approach": "CRISPR Exon Skipping",
        "description": "CRISPR-Cas9 permanent genomic deletion of exon 51 splice acceptor to restore dystrophin reading frame. Unlike ASO therapies, a single treatment could provide durable benefit.",
        "stage": "Phase 1/2",
        "target": "DMD exon 51 splice site",
        "key_programs": ["Editas Medicine (EDIT-301 related approaches)", "Broad Institute CRISPR DMD programs"],
        "caveat": "Delivery efficiency to muscle tissue still being established. Off-target editing risk under evaluation.",
        "n_of_1_flag": False,
    },
    {
        "gene": "DMD",
        "approach": "Micro-dystrophin Gene Therapy (next-gen)",
        "description": "Next-generation AAV micro-dystrophin constructs with improved muscle tropism and larger dystrophin domains than Elevidys, potentially benefiting non-ambulatory patients.",
        "stage": "Phase 1/2",
        "target": "Dystrophin restoration",
        "key_programs": ["Solid Biosciences SGT-003", "Genethon GNT0004"],
        "caveat": "Pre-existing AAV antibodies may exclude. Immune response monitoring required.",
        "n_of_1_flag": False,
    },
    {
        "gene": "SOD1",
        "approach": "CRISPR Base Editing",
        "description": "In vivo base editing to correct or silence mutant SOD1 in motor neurons via CNS delivery. Could provide one-time durable SOD1 silencing.",
        "stage": "Preclinical / IND-enabling",
        "target": "SOD1 gene correction",
        "key_programs": ["Prime Medicine", "Beam Therapeutics"],
        "caveat": "CNS delivery remains a major challenge. Tofersen (approved ASO) is current standard.",
        "n_of_1_flag": True,
    },
    {
        "gene": "SMN1",
        "approach": "Next-gen AAV Gene Therapy",
        "description": "Improved AAV9 and AAVrh10 vectors for SMN1 gene replacement with better CNS penetration and potentially broader age eligibility than Zolgensma.",
        "stage": "Phase 1/2",
        "target": "SMN1 gene replacement",
        "key_programs": ["Novartis OAV101 (intrathecal Zolgensma)", "AveXis next-gen"],
        "caveat": "Intrathecal delivery may extend age eligibility beyond current 2-year limit.",
        "n_of_1_flag": False,
    },
    {
        "gene": "HTT",
        "approach": "Huntingtin Lowering (ASO / siRNA)",
        "description": "Multiple programs targeting HTT mRNA to reduce toxic mutant huntingtin protein. Wave Life Sciences allele-selective approach aims to preserve wild-type HTT while silencing mutant allele.",
        "stage": "Phase 2/3",
        "target": "HTT mRNA silencing",
        "key_programs": ["Wave Life Sciences WVE-003 (allele-selective)", "uniQure AMT-130 (AAV-miRNA)", "Roche/Ionis tominersen"],
        "caveat": "Tominersen Phase 3 paused due to safety signal at high dose; lower dose trials ongoing. AMT-130 showing promising biomarker data.",
        "n_of_1_flag": False,
    },
    {
        "gene": "BRCA1",
        "approach": "PARP Inhibitor Combinations / Immunotherapy",
        "description": "Combinations of PARP inhibitors with immune checkpoint inhibitors (pembrolizumab, atezolizumab) and with PI3K/AKT inhibitors (capivasertib) for BRCA1/2-mutant cancers.",
        "stage": "Phase 2/3",
        "target": "HRD tumor vulnerability",
        "key_programs": ["AstraZeneca olaparib + durvalumab", "Pfizer capivasertib + olaparib", "KEYNOTE-522 BRCA cohort"],
        "caveat": "Multiple combination trials ongoing. Benefit beyond PARP inhibitor monotherapy still being established.",
        "n_of_1_flag": False,
    },
    {
        "gene": "BRCA2",
        "approach": "PARP Inhibitor Combinations / Immunotherapy",
        "description": "Same combination strategies as BRCA1 — PARP inhibitors with checkpoint inhibitors and targeted agents for BRCA2-mutant cancers.",
        "stage": "Phase 2/3",
        "target": "HRD tumor vulnerability",
        "key_programs": ["AstraZeneca olaparib + durvalumab", "Rucaparib combinations", "BRCA2 prostate cancer trials"],
        "caveat": "BRCA2-mutant prostate cancer (mCRPC) is an active area with multiple dedicated trials.",
        "n_of_1_flag": False,
    },
    {
        "gene": "TTR",
        "approach": "CRISPR In Vivo Gene Editing",
        "description": "NTLA-2001 (Intellia/Regeneron): first in vivo CRISPR therapy in humans — single IV infusion of LNP-delivered CRISPR to permanently knock out TTR gene in liver. Phase 1 data showed >90% TTR reduction.",
        "stage": "Phase 1/2",
        "target": "TTR gene knockout (liver)",
        "key_programs": ["Intellia NTLA-2001 (nexiguran ziclumeran)", "Beam Therapeutics base editing"],
        "caveat": "If approved, would be one-time treatment vs. ongoing siRNA/ASO therapy. Long-term safety data still accumulating.",
        "n_of_1_flag": False,
    },
    {
        "gene": "HBB",
        "approach": "Base Editing / Prime Editing",
        "description": "Next-generation gene editing approaches to correct the HbS mutation directly (E6V → E6A or wild-type) without double-strand breaks, potentially safer than CRISPR-Cas9.",
        "stage": "Preclinical / Phase 1",
        "target": "HBB E6V correction",
        "key_programs": ["Beam Therapeutics BEAM-101 (base editing)", "Prime Medicine PM359"],
        "caveat": "BEAM-101 Phase 1 data expected 2025-2026. Casgevy (CRISPR) already approved as alternative.",
        "n_of_1_flag": False,
    },
    {
        "gene": "GBA",
        "approach": "Gene Therapy + Parkinson Prevention",
        "description": "AAV-based GBA gene therapy for Gaucher disease and GBA-associated Parkinson disease risk. Also: GLP-1 receptor agonists and GBA chaperones being studied for Parkinson prevention in GBA carriers.",
        "stage": "Phase 1/2",
        "target": "GBA enzyme restoration / neurodegeneration prevention",
        "key_programs": ["Prevail Therapeutics PR001 (AAV9-GBA)", "Sanofi venglustat (substrate reduction)", "Ambroxol (chaperone therapy, investigational for GBA-PD)"],

        "caveat": "GBA-associated Parkinson risk is significant (5-10x increased risk). Preventive trials enrolling GBA carriers without PD.",
        "n_of_1_flag": False,
    },
    {
        "gene": "FXN",
        "approach": "Gene Therapy / Frataxin Upregulation",
        "description": "AAV-based frataxin gene delivery and epigenetic approaches to reactivate silenced FXN alleles (GAA repeat expansion silences the gene via heterochromatin).",
        "stage": "Phase 1/2",
        "target": "Frataxin restoration",
        "key_programs": ["Lexeo Therapeutics LX2006 (AAV-FXN cardiac)", "Design Therapeutics DT-216 (GAA repeat targeting)"],
        "caveat": "Omaveloxolone (Skyclarys) is now approved. Gene therapy aims for disease modification beyond symptom management.",
        "n_of_1_flag": False,
    },
    {
        "gene": "MYBPC3",
        "approach": "Gene Therapy / Allele-Specific Silencing",
        "description": "AAV-based delivery of MYBPC3 or allele-specific silencing of mutant MYBPC3 to restore normal sarcomere function. Complementary to mavacamten for patients with non-obstructive HCM.",
        "stage": "Preclinical / Phase 1",
        "target": "MYBPC3 restoration",
        "key_programs": ["Tenax Therapeutics", "Rocket Pharmaceuticals HCM program"],
        "caveat": "Mavacamten (Camzyos) is approved for obstructive HCM. Gene therapy targets underlying cause.",
        "n_of_1_flag": False,
    },
]


def match_tier3(gene: str) -> dict:
    """Return emerging pipeline entries for the given gene."""
    gene_upper = gene.upper()
    pipeline = [
        {
            "gene": e["gene"],
            "approach": e["approach"],
            "description": e["description"],
            "stage": e["stage"],
            "target": e.get("target"),
            "key_programs": e["key_programs"],
            "caveat": e.get("caveat"),
            "n_of_1_flag": e.get("n_of_1_flag", False),
        }
        for e in PIPELINE_KB
        if e["gene"].upper() == gene_upper
    ]
    return {"pipeline": pipeline}
