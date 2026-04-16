"""
GermlineRx — Tier 2: Clinical Trial Matching
Fetches recruiting trials from ClinicalTrials.gov v2 API, scores relevance,
extracts eligibility criteria via NLP, and checks patient eligibility.
"""
from __future__ import annotations
import logging
import httpx
from typing import Optional, List
from .eligibility import extract_criteria, check_eligibility

logger = logging.getLogger(__name__)

CT_API = "https://clinicaltrials.gov/api/v2/studies"

# ─── Gene → search term variants ─────────────────────────────────────────────
SEARCH_TERMS: dict[str, list[str]] = {
    "CFTR":   ["cystic fibrosis CFTR modulator", "elexacaftor tezacaftor", "CFTR F508del", "cystic fibrosis gene therapy"],
    "DMD":    ["Duchenne muscular dystrophy gene therapy", "DMD exon skipping", "dystrophin", "DMD antisense"],
    "SOD1":   ["SOD1 ALS tofersen", "SOD1 amyotrophic lateral sclerosis", "SOD1 antisense"],
    "SMN1":   ["spinal muscular atrophy SMN", "SMA nusinersen risdiplam", "SMN gene therapy"],
    "BRCA1":  ["BRCA1 PARP inhibitor", "hereditary breast cancer BRCA", "BRCA1 olaparib"],
    "BRCA2":  ["BRCA2 PARP inhibitor", "hereditary breast cancer BRCA2", "BRCA2 olaparib"],
    "MLH1":   ["Lynch syndrome MLH1", "mismatch repair deficiency", "MSI-H pembrolizumab Lynch"],
    "MSH2":   ["Lynch syndrome MSH2", "mismatch repair MSH2", "MSI-H Lynch syndrome"],
    "MSH6":   ["Lynch syndrome MSH6", "mismatch repair MSH6"],
    "TTR":    ["transthyretin amyloidosis TTR", "hATTR tafamidis", "TTR gene silencing"],
    "HBB":    ["sickle cell disease gene therapy", "HBB beta thalassemia", "sickle cell CRISPR"],
    "LDLR":   ["familial hypercholesterolemia LDLR", "PCSK9 inhibitor FH", "LDL-C familial"],
    "MYBPC3": ["hypertrophic cardiomyopathy mavacamten", "HCM sarcomere MYBPC3", "obstructive HCM"],
    "MYH7":   ["hypertrophic cardiomyopathy MYH7", "HCM sarcomere MYH7"],
    "NF1":    ["neurofibromatosis NF1 selumetinib", "NF1 plexiform neurofibroma", "NF1 MEK inhibitor"],
    "VHL":    ["von Hippel-Lindau VHL belzutifan", "VHL disease HIF-2alpha", "VHL renal cell carcinoma"],
    "RET":    ["MEN2 RET medullary thyroid", "RET selpercatinib", "hereditary medullary thyroid cancer"],
    "GBA":    ["Gaucher disease GBA", "GBA Parkinson disease", "glucocerebrosidase"],
    "HTT":    ["Huntington disease HTT", "huntingtin lowering", "HTT antisense"],
    "FXN":    ["Friedreich ataxia FXN", "frataxin", "Friedreich ataxia omaveloxolone"],
    "F8":     ["hemophilia A gene therapy", "factor VIII F8", "hemophilia A emicizumab"],
    "F9":     ["hemophilia B gene therapy", "factor IX F9", "hemophilia B etranacogene"],
    "TP53":   ["Li-Fraumeni syndrome TP53", "TP53 germline surveillance", "p53 hereditary cancer"],
    "PALB2":  ["PALB2 breast cancer PARP", "PALB2 hereditary breast"],
    "ATM":    ["ATM breast cancer PARP inhibitor", "ATM pancreatic cancer olaparib"],
    "CHEK2":  ["CHEK2 breast cancer surveillance", "CHEK2 hereditary breast"],
}

# ─── Relevance scoring signals ────────────────────────────────────────────────
PHASE_SCORES = {"PHASE3": 0.10, "PHASE2_3": 0.09, "PHASE2": 0.07, "PHASE1_2": 0.05, "PHASE1": 0.03}


async def match_tier2(gene: str, hgvs: str, functional_class: Optional[str],
                      disease: str, age: Optional[int]) -> dict:
    """
    Fetch, score, and eligibility-check clinical trials for the given variant.
    """
    search_terms = SEARCH_TERMS.get(gene.upper(), [f"{gene} genetic disease"])
    patient = {"gene": gene.upper(), "hgvs": hgvs, "functional_class": functional_class,
               "age": age, "disease": disease}

    # Fetch candidates across all search terms
    all_trials: dict[str, dict] = {}
    for term in search_terms[:3]:  # limit to 3 terms to avoid rate limiting
        trials = await _fetch_trials(term)
        for t in trials:
            nct = t.get("protocolSection", {}).get("identificationModule", {}).get("nctId", "")
            if nct and nct not in all_trials:
                all_trials[nct] = t

    total_fetched = len(all_trials)

    # Score and filter
    scored = []
    gene_keywords = _gene_keywords(gene, disease, functional_class)
    for nct, trial in all_trials.items():
        score = _score_trial(trial, gene_keywords, gene)
        if score >= 0.25:
            scored.append((score, nct, trial))

    scored.sort(key=lambda x: x[0], reverse=True)
    top_trials = scored[:20]

    # Eligibility check
    results = []
    for score, nct, trial in top_trials:
        result = _build_trial_result(trial, score, patient)
        if result["eligibility_overall"] != "INELIGIBLE":
            results.append(result)

    # Sort: ELIGIBLE → LIKELY_ELIGIBLE → CHECK_WITH_DOCTOR, then by score
    order = {"ELIGIBLE": 0, "LIKELY_ELIGIBLE": 1, "CHECK_WITH_DOCTOR": 2}
    results.sort(key=lambda r: (order.get(r["eligibility_overall"], 3), -r["relevance_score"]))

    return {
        "trials": results[:10],
        "total_fetched": total_fetched,
        "total_after_scoring": len(scored),
    }


async def _fetch_trials(search_term: str) -> list[dict]:
    """Fetch recruiting trials from ClinicalTrials.gov v2 API."""
    try:
        params = {
            "query.term": search_term,
            "filter.overallStatus": "RECRUITING",
            "pageSize": 20,
            "fields": "NCTId,BriefTitle,Phase,EligibilityCriteria,InterventionName,"
                      "Condition,CentralContact,OverallStatus,BriefSummary",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(CT_API, params=params)
            r.raise_for_status()
            data = r.json()
        return data.get("studies", [])
    except Exception as e:
        logger.warning(f"ClinicalTrials.gov fetch failed for '{search_term}': {e}")
        return []


def _score_trial(trial: dict, gene_keywords: list[str], gene: str) -> float:
    """Score trial relevance 0–1."""
    proto = trial.get("protocolSection", {})
    id_mod = proto.get("identificationModule", {})
    elig_mod = proto.get("eligibilityModule", {})
    design_mod = proto.get("designModule", {})
    arms_mod = proto.get("armsInterventionsModule", {})

    title = id_mod.get("briefTitle", "").lower()
    summary = id_mod.get("briefSummary", "").lower()
    elig_text = elig_mod.get("eligibilityCriteria", "").lower()
    interventions = " ".join(
        i.get("name", "") for i in arms_mod.get("interventions", [])
    ).lower()

    full_text = f"{title} {summary} {elig_text} {interventions}"
    score = 0.0

    # Gene symbol in title
    if gene.lower() in title:
        score += 0.35
    elif gene.lower() in full_text:
        score += 0.15

    # Keyword matches
    for kw in gene_keywords:
        if kw.lower() in full_text:
            score += 0.10
            break

    # Disease keyword
    for kw in gene_keywords[1:]:
        if kw.lower() in title:
            score += 0.15
            break

    # Phase bonus
    phases = design_mod.get("phases", [])
    for phase in phases:
        phase_key = phase.replace("/", "_").replace(" ", "").upper()
        score += PHASE_SCORES.get(phase_key, 0)

    # Exclusion penalty
    excl_patterns = [
        f"non-{gene.lower()}", f"non {gene.lower()}",
        "healthy volunteer", "healthy subject",
    ]
    for pat in excl_patterns:
        if pat in title or pat in summary:
            score -= 0.50

    return min(max(score, 0.0), 1.0)


def _build_trial_result(trial: dict, score: float, patient: dict) -> dict:
    """Build a TrialResult dict from raw ClinicalTrials.gov data."""
    proto = trial.get("protocolSection", {})
    id_mod = proto.get("identificationModule", {})
    elig_mod = proto.get("eligibilityModule", {})
    design_mod = proto.get("designModule", {})
    arms_mod = proto.get("armsInterventionsModule", {})
    contacts_mod = proto.get("contactsLocationsModule", {})
    cond_mod = proto.get("conditionsModule", {})

    nct_id = id_mod.get("nctId", "")
    title = id_mod.get("briefTitle", "Unknown trial")
    phases = design_mod.get("phases", [])
    phase_str = "/".join(phases) if phases else None

    conditions = cond_mod.get("conditions", [])
    interventions = [i.get("name", "") for i in arms_mod.get("interventions", [])]

    elig_text = elig_mod.get("eligibilityCriteria", "")
    criteria = extract_criteria(elig_text)
    elig_result = check_eligibility(criteria, patient)

    # Contact info
    central_contacts = contacts_mod.get("centralContacts", [])
    contact = central_contacts[0] if central_contacts else {}

    return {
        "nct_id": nct_id,
        "title": title,
        "phase": phase_str,
        "conditions": conditions[:3],
        "interventions": interventions[:3],
        "relevance_score": round(score, 3),
        "eligibility_overall": elig_result["eligibility_overall"],
        "eligibility_plain": elig_result["eligibility_plain"],
        "criterion_checks": elig_result["criterion_checks"],
        "contact_name": contact.get("name"),
        "contact_email": contact.get("email"),
        "contact_phone": contact.get("phone"),
        "url": f"https://clinicaltrials.gov/study/{nct_id}",
    }


def _gene_keywords(gene: str, disease: str, fc: Optional[str]) -> list[str]:
    """Build keyword list for relevance scoring."""
    kws = [gene.upper()]
    disease_words = [w for w in disease.lower().split() if len(w) > 3]
    kws.extend(disease_words[:3])
    if fc:
        kws.append(fc.replace("_", " "))
    return kws
