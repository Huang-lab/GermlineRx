"""
GermlineRx — Eligibility NLP Engine
Rule-based extraction of eligibility criteria from ClinicalTrials.gov free text,
and per-criterion patient eligibility checking.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Optional, List

# ─── Regex patterns ───────────────────────────────────────────────────────────

_AGE_MIN = re.compile(
    r"(?:age[sd]?\s*(?:≥|>=|>|at\s+least|minimum|older\s+than)\s*(\d+))"
    r"|(?:(\d+)\s*(?:years?|yrs?)\s*(?:of\s+age\s+)?(?:or\s+)?(?:older|above|and\s+above))"
    r"|(?:minimum\s+age[:\s]+(\d+))",
    re.I,
)
_AGE_MAX = re.compile(
    r"(?:age[sd]?\s*(?:≤|<=|<|no\s+more\s+than|at\s+most|maximum|younger\s+than)\s*(\d+))"
    r"|(?:(\d+)\s*(?:years?|yrs?)\s*(?:of\s+age\s+)?(?:or\s+)?(?:younger|below|and\s+below|and\s+under))"
    r"|(?:maximum\s+age[:\s]+(\d+))"
    r"|(?:up\s+to\s+(\d+)\s*(?:years?|yrs?))",
    re.I,
)

_GENE_RE = re.compile(
    r"\b(BRCA[12]|MLH1|MSH[26]|PMS2|CFTR|DMD|SOD1|SMN1|LDLR|APOB|MYBPC3|MYH7|"
    r"KCNQ1|KCNH2|SCN5A|TTR|HBB|F[89]|GBA|HTT|FXN|NF1|RET|TP53|VHL|PALB2|ATM|CHEK2)\b",
    re.I,
)

_MUTATION_TYPE_PATTERNS: dict[str, re.Pattern] = {
    "nonsense":          re.compile(r"\bnonsense\b|\bstop\s+codon\b|\bptc\b", re.I),
    "exon51_skippable":  re.compile(r"\bexon\s*51\s*skip|\bamenable\s+to\s+exon\s*51", re.I),
    "exon53_skippable":  re.compile(r"\bexon\s*53\s*skip|\bamenable\s+to\s+exon\s*53", re.I),
    "exon45_skippable":  re.compile(r"\bexon\s*45\s*skip|\bamenable\s+to\s+exon\s*45", re.I),
    "f508del":           re.compile(r"\bF508del\b|\bc\.1521_1523del\b|\bphe508del\b", re.I),
    "gating_mutation":   re.compile(r"\bgating\s+mutation\b|\bclass\s+III\b|\bg551d\b", re.I),
    "sod1_als":          re.compile(r"\bSOD1\s+(?:mutation|variant|pathogenic)\b|\bSOD1[-\s]ALS\b", re.I),
    "smn1_loss":         re.compile(r"\bSMN1\s+(?:deletion|mutation|biallelic)\b", re.I),
    "sickle_cell":       re.compile(r"\bsickle\s+cell\b|\bHbSS\b|\bHbS\b", re.I),
    "brca1_lof":         re.compile(r"\bBRCA1\s+(?:pathogenic|mutation|variant)\b", re.I),
    "brca2_lof":         re.compile(r"\bBRCA2\s+(?:pathogenic|mutation|variant)\b", re.I),
    "ttr_variant":       re.compile(r"\bhereditary\s+TTR\b|\bhATTR\b|\bTTR\s+(?:mutation|variant)\b", re.I),
    "hcm_variant":       re.compile(r"\bsarcomere\s+(?:mutation|variant)\b|\bMYBPC3\b|\bMYH7\b", re.I),
}

_AMBULATORY = re.compile(r"\bambulatory\b|\bable\s+to\s+walk\b|\bwalking\s+independently\b", re.I)
_CONFIRMED_DX = re.compile(
    r"\bconfirmed\s+(?:diagnosis|genetic)\b|\bgenetically\s+confirmed\b"
    r"|\bdocumented\s+(?:diagnosis|mutation)\b|\bpathogenic\s+variant\b",
    re.I,
)

_EXCLUDED_CONDITIONS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bpregnant\b|\bpregnancy\b|\bbreastfeeding\b|\bnursing\b", re.I),          "pregnancy/breastfeeding"),
    (re.compile(r"\bliver\s+(?:disease|failure|cirrhosis|impairment)\b|\bcirrhosis\b", re.I), "liver disease"),
    (re.compile(r"\brenal\s+(?:impairment|failure|disease)\b|\bkidney\s+(?:failure|disease)\b", re.I), "renal impairment"),
    (re.compile(r"\bactive\s+(?:cancer|malignancy|tumor)\b|\bconcurrent\s+malignancy\b", re.I), "active cancer"),
    (re.compile(r"\bimmunosuppressed\b|\bimmunosuppressive\s+therapy\b|\bimmunocompromised\b", re.I), "immunosuppression"),
    (re.compile(r"\bHIV\b|\bHuman\s+Immunodeficiency\b", re.I),                              "HIV"),
    (re.compile(r"\bprior\s+(?:gene\s+therapy|AAV\s+vector|viral\s+vector)\b", re.I),        "prior gene therapy"),
    (re.compile(r"\bAAV\s+(?:antibod|neutralizing)\b|\bneutralizing\s+antibod.*AAV\b", re.I),"pre-existing AAV antibodies"),
    (re.compile(r"\bprior\s+(?:organ\s+)?transplant\b|\btransplant\s+recipient\b", re.I),    "prior transplant"),
]


@dataclass
class EligibilityCriteria:
    required_genes: List[str] = field(default_factory=list)
    required_mutation_types: List[str] = field(default_factory=list)
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    requires_ambulatory: bool = False
    requires_confirmed_dx: bool = False
    excluded_conditions: List[str] = field(default_factory=list)
    excluded_genes: List[str] = field(default_factory=list)


def extract_criteria(eligibility_text: str) -> EligibilityCriteria:
    """Parse free-text eligibility criteria into structured EligibilityCriteria."""
    criteria = EligibilityCriteria()

    # Split into inclusion and exclusion sections
    incl_text, excl_text = _split_sections(eligibility_text)

    # Age from inclusion
    age_min_match = _AGE_MIN.search(incl_text)
    if age_min_match:
        val = next(v for v in age_min_match.groups() if v is not None)
        criteria.age_min = int(val)

    age_max_match = _AGE_MAX.search(incl_text)
    if age_max_match:
        val = next(v for v in age_max_match.groups() if v is not None)
        criteria.age_max = int(val)

    # Required genes (inclusion section)
    for m in _GENE_RE.finditer(incl_text):
        g = m.group(0).upper()
        if g not in criteria.required_genes:
            criteria.required_genes.append(g)

    # Required mutation types
    for fc, pattern in _MUTATION_TYPE_PATTERNS.items():
        if pattern.search(incl_text):
            criteria.required_mutation_types.append(fc)

    # Ambulatory requirement
    if _AMBULATORY.search(incl_text):
        criteria.requires_ambulatory = True

    # Confirmed diagnosis
    if _CONFIRMED_DX.search(incl_text):
        criteria.requires_confirmed_dx = True

    # Excluded conditions (exclusion section)
    for pattern, label in _EXCLUDED_CONDITIONS:
        if pattern.search(excl_text):
            criteria.excluded_conditions.append(label)

    # Excluded genes (exclusion section — e.g. "Non-SOD1 ALS")
    for m in _GENE_RE.finditer(excl_text):
        g = m.group(0).upper()
        # Only add if it looks like an exclusion context
        context = excl_text[max(0, m.start()-30):m.end()+30]
        if re.search(r"\bnon[-\s]|without|absence|negative\b", context, re.I):
            if g not in criteria.excluded_genes:
                criteria.excluded_genes.append(g)

    return criteria


def check_eligibility(criteria: EligibilityCriteria, patient: dict) -> dict:
    """
    Check patient profile against extracted criteria.
    Returns dict with criterion_checks list and overall eligibility label.
    """
    checks = []
    gene = patient.get("gene", "").upper()
    fc = patient.get("functional_class")
    age = patient.get("age")

    # ── Gene match ────────────────────────────────────────────────────────────
    if criteria.required_genes:
        if gene in criteria.required_genes:
            checks.append(_check("Gene match", "MET",
                f"Trial requires {'/'.join(criteria.required_genes)}; patient has {gene}"))
        else:
            checks.append(_check("Gene match", "NOT_MET",
                f"Trial requires {'/'.join(criteria.required_genes)}; patient has {gene}"))

    # ── Mutation type ─────────────────────────────────────────────────────────
    if criteria.required_mutation_types:
        if fc and fc in criteria.required_mutation_types:
            checks.append(_check("Mutation type", "MET",
                f"Mutation type '{fc}' matches trial requirement"))
        elif fc:
            checks.append(_check("Mutation type", "WARNING",
                f"Trial requires {criteria.required_mutation_types}; patient has '{fc}' — verify with trial team"))
        else:
            checks.append(_check("Mutation type", "UNKNOWN",
                "Mutation type could not be determined — verify with trial team"))

    # ── Age ───────────────────────────────────────────────────────────────────
    if criteria.age_min is not None or criteria.age_max is not None:
        if age is None:
            checks.append(_check("Age requirement", "UNKNOWN",
                f"Age not provided — trial requires age "
                f"{criteria.age_min or '?'}–{criteria.age_max or '?'}"))
        else:
            age_ok = True
            age_desc = []
            if criteria.age_min is not None:
                if age >= criteria.age_min:
                    age_desc.append(f"≥{criteria.age_min} ✓")
                else:
                    age_ok = False
                    age_desc.append(f"≥{criteria.age_min} ✗ (patient is {age})")
            if criteria.age_max is not None:
                if age <= criteria.age_max:
                    age_desc.append(f"≤{criteria.age_max} ✓")
                else:
                    age_ok = False
                    age_desc.append(f"≤{criteria.age_max} ✗ (patient is {age})")
            status = "MET" if age_ok else "NOT_MET"
            checks.append(_check("Age requirement", status, f"Age {age}: {', '.join(age_desc)}"))

    # ── Ambulatory ────────────────────────────────────────────────────────────
    if criteria.requires_ambulatory:
        checks.append(_check("Ambulatory status", "UNKNOWN",
            "Trial requires ambulatory patients — cannot verify from variant alone"))

    # ── Confirmed diagnosis ───────────────────────────────────────────────────
    if criteria.requires_confirmed_dx:
        checks.append(_check("Confirmed diagnosis", "MET",
            "Genetic variant provided — diagnosis assumed confirmed"))

    # ── Excluded conditions ───────────────────────────────────────────────────
    for cond in criteria.excluded_conditions:
        checks.append(_check(f"Exclusion: {cond}", "UNKNOWN",
            f"Trial excludes patients with {cond} — cannot verify from variant alone"))

    # ── Excluded genes ────────────────────────────────────────────────────────
    for excl_gene in criteria.excluded_genes:
        if gene == excl_gene:
            checks.append(_check(f"Gene exclusion: {excl_gene}", "NOT_MET",
                f"Trial explicitly excludes {excl_gene} patients"))

    # ── Overall label ─────────────────────────────────────────────────────────
    not_met = sum(1 for c in checks if c["status"] == "NOT_MET")
    # Distinguish structural unknowns (gene/age/mutation) from boilerplate exclusion unknowns
    # Boilerplate exclusions (pregnancy, liver disease, etc.) are standard for almost all trials
    # and should not degrade the eligibility label — they are always UNKNOWN from variant data alone.
    boilerplate_labels = {"pregnancy/breastfeeding", "liver disease", "renal impairment",
                          "active cancer", "immunosuppression", "HIV",
                          "prior gene therapy", "pre-existing AAV antibodies", "prior transplant"}
    structural_unknown = sum(
        1 for c in checks
        if c["status"] == "UNKNOWN"
        and not any(b in c["criterion"].lower() for b in boilerplate_labels)
    )
    met = sum(1 for c in checks if c["status"] == "MET")
    total_unknown = sum(1 for c in checks if c["status"] == "UNKNOWN")

    if not_met >= 1:
        overall = "INELIGIBLE"
        plain = "Based on the available information, you do not appear to meet one or more key eligibility criteria for this trial."
    elif structural_unknown == 0 and met >= 1:
        overall = "ELIGIBLE"
        plain = "You appear to meet the key eligibility criteria for this trial."
    elif structural_unknown <= 1:
        overall = "LIKELY_ELIGIBLE"
        plain = "You likely meet the eligibility criteria. One criterion requires verification with the trial team."
    else:
        overall = "CHECK_WITH_DOCTOR"
        plain = "Several eligibility criteria could not be verified from your genetic information alone. Discuss with your doctor or the trial team."

    return {
        "eligibility_overall": overall,
        "eligibility_plain": plain,
        "criterion_checks": checks,
    }


def _check(criterion: str, status: str, explanation: str) -> dict:
    return {"criterion": criterion, "status": status, "explanation": explanation}


def _split_sections(text: str) -> tuple[str, str]:
    """Split eligibility text into inclusion and exclusion sections."""
    excl_match = re.search(r"exclusion\s+criteria[:\s]", text, re.I)
    if excl_match:
        return text[:excl_match.start()], text[excl_match.start():]
    return text, ""
