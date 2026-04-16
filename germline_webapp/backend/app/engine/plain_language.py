"""
GermlineRx — Plain Language Generator
Template-based synthesis of T0–T3 results into patient-readable summaries.
"""
from __future__ import annotations
from typing import Optional

DISCLAIMER = (
    "This information is for educational purposes only and does not constitute "
    "medical advice. Always consult a qualified healthcare provider before making "
    "any medical decisions."
)


def generate_patient_summary(
    gene: str,
    hgvs: str,
    display_mutation: str,
    disease: str,
    tier0: dict,
    tier1: dict,
    tier2: dict,
    tier3: dict,
    age: Optional[int] = None,
) -> tuple[str, list[str], list[str], str]:
    """
    Returns (patient_summary, patient_next_steps, clinician_notes, overall_status).
    """
    confidence = tier0.get("confidence", "LOW")
    classification = tier0.get("classification", "UNKNOWN")
    drugs = tier1.get("drugs", [])
    surveillance = tier1.get("surveillance", [])
    trials = tier2.get("trials", [])
    pipeline = tier3.get("pipeline", [])

    # ── Overall status ────────────────────────────────────────────────────────
    if drugs:
        overall_status = "FULLY_ACTIONABLE"
    elif trials:
        overall_status = "PARTIALLY_ACTIONABLE"
    elif pipeline:
        overall_status = "INVESTIGATIONAL_ONLY"
    else:
        overall_status = "NOT_ACTIONABLE"

    # ── Patient summary paragraph ─────────────────────────────────────────────
    parts = []

    # Variant intro
    if display_mutation and display_mutation != hgvs:
        parts.append(
            f"You have the {display_mutation} mutation (technical name: {hgvs}) in the {gene} gene, "
            f"which is associated with {disease}."
        )
    else:
        parts.append(
            f"You have a mutation ({hgvs}) in the {gene} gene, associated with {disease}."
        )

    # Clinical significance
    if classification == "PATHOGENIC" and confidence == "HIGH":
        parts.append(
            f"This mutation is classified as pathogenic (disease-causing) with high confidence, "
            f"based on strong evidence from clinical databases."
        )
    elif classification in ("PATHOGENIC", "LIKELY_PATHOGENIC") and confidence == "MODERATE":
        parts.append(
            f"This mutation is classified as {classification.replace('_', ' ').lower()}, "
            f"though the evidence level is moderate. Your doctor can provide more context."
        )
    elif classification == "VUS":
        parts.append(
            f"This mutation is currently classified as a Variant of Uncertain Significance (VUS). "
            f"This means scientists are still gathering evidence about its effects. "
            f"Results below are shown for informational purposes."
        )
    elif confidence == "NOT_ACTIONABLE":
        parts.append(
            f"This mutation is classified as benign (not disease-causing). "
            f"No specific treatment matching is available."
        )

    # gnomAD context
    gnomad_interp = tier0.get("gnomad_interpretation", "")
    if gnomad_interp and "not available" not in gnomad_interp:
        parts.append(f"Population data: {gnomad_interp}.")

    # Approved therapies
    if drugs:
        drug_names = [d["drug_name"] for d in drugs[:2]]
        if len(drugs) == 1:
            parts.append(
                f"Good news: there is an FDA-approved treatment for your mutation — "
                f"{drug_names[0]}. This is a significant development for patients with your condition."
            )
        else:
            parts.append(
                f"Good news: there are {len(drugs)} FDA-approved treatment(s) relevant to your mutation, "
                f"including {' and '.join(drug_names[:2])}."
            )
    else:
        parts.append(
            f"There are currently no FDA-approved therapies specifically matched to your mutation, "
            f"but clinical trials and emerging research may offer options."
        )

    # Clinical trials
    eligible_trials = [t for t in trials if t["eligibility_overall"] in ("ELIGIBLE", "LIKELY_ELIGIBLE")]
    if eligible_trials:
        parts.append(
            f"{len(eligible_trials)} recruiting clinical trial(s) appear to match your profile. "
            f"You may qualify for these studies — see details below."
        )
    elif trials:
        parts.append(
            f"{len(trials)} clinical trial(s) were found. Some criteria require verification with the trial team."
        )

    # Pipeline
    if pipeline:
        approaches = list({p["approach"] for p in pipeline})[:2]
        parts.append(
            f"Emerging research approaches ({', '.join(approaches)}) are in development for {gene}-related conditions."
        )

    summary = " ".join(parts)

    # ── Next steps ────────────────────────────────────────────────────────────
    next_steps = []
    step_num = 1

    if drugs:
        first_drug = drugs[0]
        next_steps.append(
            f"Step {step_num}: Talk to your specialist about {first_drug['drug_name']}. "
            f"This is {first_drug.get('line', 'an FDA-approved treatment')} for your condition. "
            + (f"Note: {first_drug['caveat']}" if first_drug.get("caveat") else "")
        )
        step_num += 1

    if surveillance:
        first_surv = surveillance[0]
        next_steps.append(
            f"Step {step_num}: Follow recommended monitoring guidelines. "
            f"{first_surv['recommendation']}"
        )
        step_num += 1

    if eligible_trials:
        trial = eligible_trials[0]
        next_steps.append(
            f"Step {step_num}: Consider enrolling in a clinical trial. "
            f"'{trial['title']}' ({trial['nct_id']}) appears to match your profile. "
            f"Visit {trial['url']} or ask your doctor for a referral."
        )
        step_num += 1
    elif trials:
        trial = trials[0]
        next_steps.append(
            f"Step {step_num}: Discuss clinical trial options with your doctor. "
            f"'{trial['title']}' ({trial['nct_id']}) may be relevant — eligibility requires verification."
        )
        step_num += 1

    if pipeline:
        prog = pipeline[0]
        next_steps.append(
            f"Step {step_num}: Stay informed about emerging therapies. "
            f"{prog['approach']} programs for {gene} are in {prog['stage']}. "
            f"Ask your specialist about expanded access or future trial opportunities."
        )
        step_num += 1

    next_steps.append(
        f"Step {step_num}: Share this report with your genetic counselor or specialist "
        f"to discuss what these findings mean for you and your family."
    )

    # ── Clinician notes ───────────────────────────────────────────────────────
    clinician_notes = []
    clinvar_id = tier0.get("clinvar_id")
    if clinvar_id:
        clinician_notes.append(
            f"ClinVar ID: {clinvar_id} | Classification: {classification} | "
            f"Review status: {tier0.get('review_status', 'N/A')} ({tier0.get('review_stars', 0)}★)"
        )
    gnomad_af = tier0.get("gnomad_af")
    if gnomad_af is not None:
        clinician_notes.append(f"gnomAD v4 allele frequency: {gnomad_af:.4g}")
    clingen = tier0.get("clingen_note")
    if clingen:
        clinician_notes.append(f"ClinGen: {clingen}")
    for d in drugs:
        clinician_notes.append(
            f"Therapy: {d['drug_name']} | Evidence: {d['evidence_level']} | "
            f"Approval: {d.get('approval_year', 'N/A')} | Source: {d.get('source', 'N/A')}"
        )
    for t in trials[:3]:
        clinician_notes.append(
            f"Trial: {t['nct_id']} | {t['title']} | Phase: {t.get('phase', 'N/A')} | "
            f"Eligibility: {t['eligibility_overall']} | Score: {t['relevance_score']}"
        )

    return summary, next_steps, clinician_notes, overall_status
