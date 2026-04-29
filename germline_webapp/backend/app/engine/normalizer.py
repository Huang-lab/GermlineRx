"""
GermlineRx — Mutation Normalizer
Converts any patient-supplied mutation description to canonical gene + HGVS + functional_class.
"""
from __future__ import annotations
import gzip
import os
import re
from functools import lru_cache
from typing import Optional, Tuple

# ─── Alias table: (gene, hgvs, display, functional_class, note) ──────────────
# Keyed by lowercase normalized input string
ALIAS_TABLE: dict[str, dict] = {
    # ── CFTR ──────────────────────────────────────────────────────────────────
    "f508del":          {"gene": "CFTR", "hgvs": "c.1521_1523del", "display": "F508del",    "fc": "f508del",          "note": "F508del (p.Phe508del) — most common CF mutation"},
    "phe508del":        {"gene": "CFTR", "hgvs": "c.1521_1523del", "display": "F508del",    "fc": "f508del",          "note": "F508del (p.Phe508del) — most common CF mutation"},
    "p.f508del":        {"gene": "CFTR", "hgvs": "c.1521_1523del", "display": "F508del",    "fc": "f508del",          "note": "F508del (p.Phe508del) — most common CF mutation"},
    "c.1521_1523del":   {"gene": "CFTR", "hgvs": "c.1521_1523del", "display": "F508del",    "fc": "f508del",          "note": "F508del (p.Phe508del) — most common CF mutation"},
    "g551d":            {"gene": "CFTR", "hgvs": "c.1652G>A",      "display": "G551D",      "fc": "gating_mutation",  "note": "G551D — gating mutation, responds to ivacaftor"},
    "g551d cftr":       {"gene": "CFTR", "hgvs": "c.1652G>A",      "display": "G551D",      "fc": "gating_mutation",  "note": "G551D — gating mutation, responds to ivacaftor"},
    "r117h":            {"gene": "CFTR", "hgvs": "c.350G>A",       "display": "R117H",      "fc": "residual_function","note": "R117H — residual function mutation"},
    "w1282x":           {"gene": "CFTR", "hgvs": "c.3846G>A",      "display": "W1282X",     "fc": "nonsense",         "note": "W1282X — nonsense mutation"},
    "g542x":            {"gene": "CFTR", "hgvs": "c.1624G>T",      "display": "G542X",      "fc": "nonsense",         "note": "G542X — nonsense mutation"},
    "n1303k":           {"gene": "CFTR", "hgvs": "c.3909C>G",      "display": "N1303K",     "fc": "f508del",          "note": "N1303K — responds to elexacaftor/tezacaftor/ivacaftor"},
    "r553x":            {"gene": "CFTR", "hgvs": "c.1657C>T",      "display": "R553X",      "fc": "nonsense",         "note": "R553X — nonsense mutation"},
    "621+1g>t":         {"gene": "CFTR", "hgvs": "c.489+1G>T",     "display": "621+1G>T",   "fc": "splicing",         "note": "621+1G>T — splice site mutation"},
    "1717-1g>a":        {"gene": "CFTR", "hgvs": "c.1585-1G>A",    "display": "1717-1G>A",  "fc": "splicing",         "note": "1717-1G>A — splice site mutation"},
    "2789+5g>a":        {"gene": "CFTR", "hgvs": "c.2657+5G>A",    "display": "2789+5G>A",  "fc": "splicing",         "note": "2789+5G>A — splice site mutation"},
    # ── DMD ───────────────────────────────────────────────────────────────────
    "exon 50 deletion": {"gene": "DMD",  "hgvs": "c.6439-?_6912+?del", "display": "Exon 50 del", "fc": "exon51_skippable", "note": "Exon 50 deletion — amenable to exon 51 skipping (eteplirsen)"},
    "exon50 deletion":  {"gene": "DMD",  "hgvs": "c.6439-?_6912+?del", "display": "Exon 50 del", "fc": "exon51_skippable", "note": "Exon 50 deletion — amenable to exon 51 skipping (eteplirsen)"},
    "exon50del":        {"gene": "DMD",  "hgvs": "c.6439-?_6912+?del", "display": "Exon 50 del", "fc": "exon51_skippable", "note": "Exon 50 deletion — amenable to exon 51 skipping (eteplirsen)"},
    "exon 51 deletion": {"gene": "DMD",  "hgvs": "c.6913-?_7660+?del", "display": "Exon 51 del", "fc": "exon52_skippable", "note": "Exon 51 deletion — amenable to exon 52 skipping"},
    "exon 52 deletion": {"gene": "DMD",  "hgvs": "c.7661-?_8027+?del", "display": "Exon 52 del", "fc": "exon53_skippable", "note": "Exon 52 deletion — amenable to exon 53 skipping (golodirsen/viltolarsen)"},
    # Exon 53 deletion is NOT amenable to exon 53 skipping (you can't skip the deleted exon itself).
    # It may be amenable to exon 52 skipping depending on reading frame — requires specialist review.
    "exon 53 deletion": {"gene": "DMD",  "hgvs": "c.7661-?_8027+?del", "display": "Exon 53 del", "fc": "dmd_deletion",     "note": "Exon 53 deletion — reading frame analysis required; consult specialist for exon-skipping eligibility"},
    "exon 44 deletion": {"gene": "DMD",  "hgvs": "c.6118-?_6438+?del", "display": "Exon 44 del", "fc": "exon45_skippable", "note": "Exon 44 deletion — amenable to exon 45 skipping (casimersen)"},
    # Exon 45 deletion: HGVS coordinates for exon 45 (c.6439-?_6912+?del is exon 50; exon 45 = c.6614-?_6912+?del approx)
    "exon 45 deletion": {"gene": "DMD",  "hgvs": "c.6614-?_6912+?del", "display": "Exon 45 del", "fc": "exon45_skippable", "note": "Exon 45 deletion — amenable to exon 45 skipping (casimersen)"},
    # ── SOD1 ──────────────────────────────────────────────────────────────────
    "a4v":              {"gene": "SOD1", "hgvs": "c.14C>T",         "display": "A4V",        "fc": "sod1_als",         "note": "A4V — most common SOD1 ALS variant in North America; aggressive course"},
    "d91a":             {"gene": "SOD1", "hgvs": "c.272A>C",        "display": "D91A",       "fc": "sod1_als",         "note": "D91A — SOD1 ALS variant; slower progression when homozygous"},
    "i113t":            {"gene": "SOD1", "hgvs": "c.338T>C",        "display": "I113T",      "fc": "sod1_als",         "note": "I113T — SOD1 ALS variant; variable penetrance"},
    "l38v":             {"gene": "SOD1", "hgvs": "c.112C>G",        "display": "L38V",       "fc": "sod1_als",         "note": "L38V — SOD1 ALS variant"},
    # ── SMN1 ──────────────────────────────────────────────────────────────────
    "smn1 deletion":    {"gene": "SMN1", "hgvs": "c.840C>T",        "display": "SMN1 del",   "fc": "smn1_loss",        "note": "SMN1 homozygous deletion — SMA type depends on SMN2 copy number"},
    "exon 7 deletion smn1": {"gene": "SMN1", "hgvs": "c.840C>T",   "display": "SMN1 ex7del","fc": "smn1_loss",        "note": "SMN1 exon 7 deletion — most common SMA-causing variant"},
    # ── BRCA1 / BRCA2 ─────────────────────────────────────────────────────────
    "brca1 185delAG":   {"gene": "BRCA1","hgvs": "c.68_69del",      "display": "185delAG",   "fc": "brca1_lof",        "note": "185delAG — founder mutation in Ashkenazi Jewish population"},
    "brca1 5382insc":   {"gene": "BRCA1","hgvs": "c.5266dup",       "display": "5382insC",   "fc": "brca1_lof",        "note": "5382insC — Ashkenazi Jewish founder mutation"},
    "brca2 6174delt":   {"gene": "BRCA2","hgvs": "c.5946del",       "display": "6174delT",   "fc": "brca2_lof",        "note": "6174delT — Ashkenazi Jewish founder mutation"},
    # ── HBB ───────────────────────────────────────────────────────────────────
    "hbs":              {"gene": "HBB",  "hgvs": "c.20A>T",         "display": "HbS (E6V)",  "fc": "sickle_cell",      "note": "HbS — sickle cell disease when homozygous"},
    "e6v":              {"gene": "HBB",  "hgvs": "c.20A>T",         "display": "HbS (E6V)",  "fc": "sickle_cell",      "note": "HbS — sickle cell disease when homozygous"},
    "hbc":              {"gene": "HBB",  "hgvs": "c.19G>A",         "display": "HbC (E6K)",  "fc": "hbb_variant",      "note": "HbC — mild hemolytic anemia; HbSC disease when with HbS"},
    "beta thalassemia": {"gene": "HBB",  "hgvs": "c.92+5G>C",       "display": "IVS1-5G>C",  "fc": "beta_thal",        "note": "Beta-thalassemia splice variant"},
    # ── TTR ───────────────────────────────────────────────────────────────────
    "v30m":             {"gene": "TTR",  "hgvs": "c.148G>A",        "display": "V30M",       "fc": "ttr_variant",      "note": "V30M — most common hereditary TTR amyloidosis variant"},
    "v122i":            {"gene": "TTR",  "hgvs": "c.424G>A",        "display": "V122I",      "fc": "ttr_variant",      "note": "V122I — common in African American population; cardiac TTR amyloidosis"},
    "t60a":             {"gene": "TTR",  "hgvs": "c.178A>G",        "display": "T60A",       "fc": "ttr_variant",      "note": "T60A — Irish founder mutation; cardiac + neuropathy"},
    # ── LDLR ──────────────────────────────────────────────────────────────────
    "ldlr lof":         {"gene": "LDLR", "hgvs": "c.1060+1G>A",    "display": "LDLR LOF",   "fc": "ldlr_lof",         "note": "LDLR loss-of-function — familial hypercholesterolemia"},
    # ── HTT ───────────────────────────────────────────────────────────────────
    "cag repeat expansion": {"gene": "HTT", "hgvs": "c.52_54CAGexp","display": "CAG exp",    "fc": "htt_expansion",    "note": "HTT CAG repeat expansion — Huntington disease (≥36 repeats pathogenic)"},
    "huntington":       {"gene": "HTT",  "hgvs": "c.52_54CAGexp",   "display": "CAG exp",    "fc": "htt_expansion",    "note": "HTT CAG repeat expansion — Huntington disease"},
    # ── FXN ───────────────────────────────────────────────────────────────────
    "gaa repeat expansion": {"gene": "FXN", "hgvs": "c.1-1242GAA[66_1000]", "display": "GAA exp", "fc": "fxn_expansion", "note": "FXN GAA repeat expansion — Friedreich ataxia"},
    "friedreich ataxia":{"gene": "FXN",  "hgvs": "c.1-1242GAA[66_1000]", "display": "GAA exp", "fc": "fxn_expansion",  "note": "FXN GAA repeat expansion — Friedreich ataxia"},
    # ── GBA ───────────────────────────────────────────────────────────────────
    "n370s":            {"gene": "GBA",  "hgvs": "c.1226A>G",       "display": "N370S",      "fc": "gba_variant",      "note": "N370S — most common Gaucher disease variant; also Parkinson risk"},
    "l444p":            {"gene": "GBA",  "hgvs": "c.1448T>C",       "display": "L444P",      "fc": "gba_variant",      "note": "L444P — severe Gaucher disease; high Parkinson risk"},
    # ── F8 ────────────────────────────────────────────────────────────────────
    "intron 22 inversion": {"gene": "F8","hgvs": "c.5999-6000inv",  "display": "Intron 22 inv","fc": "f8_lof",          "note": "Intron 22 inversion — most common severe hemophilia A variant (~45%)"},
    "f8 intron 22":     {"gene": "F8",   "hgvs": "c.5999-6000inv",  "display": "Intron 22 inv","fc": "f8_lof",          "note": "Intron 22 inversion — severe hemophilia A"},
    # ── MYBPC3 / MYH7 ─────────────────────────────────────────────────────────
    "mybpc3 del25bp":   {"gene": "MYBPC3","hgvs": "c.2373_2374del", "display": "MYBPC3 del", "fc": "hcm_variant",      "note": "MYBPC3 frameshift — hypertrophic cardiomyopathy"},
    "myh7 r403q":       {"gene": "MYH7", "hgvs": "c.1208G>A",       "display": "R403Q",      "fc": "hcm_variant",      "note": "R403Q — classic HCM-causing MYH7 variant"},
    # ── RET ───────────────────────────────────────────────────────────────────
    "ret c634r":        {"gene": "RET",  "hgvs": "c.1900T>C",       "display": "C634R",      "fc": "ret_men2a",        "note": "C634R — MEN2A; high risk medullary thyroid cancer"},
    "ret m918t":        {"gene": "RET",  "hgvs": "c.2753T>C",       "display": "M918T",      "fc": "ret_men2b",        "note": "M918T — MEN2B; highest risk RET variant"},
}

# ─── Disease → gene fallback ──────────────────────────────────────────────────
DISEASE_TO_GENE: dict[str, str] = {
    "cystic fibrosis": "CFTR",
    "cf": "CFTR",
    "duchenne muscular dystrophy": "DMD",
    "dmd": "DMD",
    "becker muscular dystrophy": "DMD",
    "als": "SOD1",
    "amyotrophic lateral sclerosis": "SOD1",
    "spinal muscular atrophy": "SMN1",
    "sma": "SMN1",
    "breast cancer": "BRCA1",
    "hereditary breast cancer": "BRCA1",
    "ovarian cancer": "BRCA1",
    "sickle cell disease": "HBB",
    "sickle cell anemia": "HBB",
    "beta thalassemia": "HBB",
    "thalassemia": "HBB",
    "transthyretin amyloidosis": "TTR",
    "attr amyloidosis": "TTR",
    "familial hypercholesterolemia": "LDLR",
    "fh": "LDLR",
    "huntington disease": "HTT",
    "huntington's disease": "HTT",
    "friedreich ataxia": "FXN",
    "gaucher disease": "GBA",
    "hemophilia a": "F8",
    "hemophilia b": "F9",
    "hypertrophic cardiomyopathy": "MYBPC3",
    "hcm": "MYBPC3",
    "multiple endocrine neoplasia": "RET",
    "men2": "RET",
    "lynch syndrome": "MLH1",
    "hereditary colon cancer": "MLH1",
    "neurofibromatosis": "NF1",
    "nf1": "NF1",
    "von hippel-lindau": "VHL",
    "vhl": "VHL",
    "alzheimer": "APOE",
    "alzheimer's disease": "APOE",
    "apoe": "APOE",
    "late-onset alzheimer": "APOE",
    "parkinson disease": "LRRK2",
    "parkinson's disease": "LRRK2",
    "lrrk2": "LRRK2",
    "cowden syndrome": "PTEN",
    "pten": "PTEN",
    "familial adenomatous polyposis": "APC",
    "fap": "APC",
    "peutz-jeghers": "STK11",
    "hereditary diffuse gastric cancer": "CDH1",
    "cdh1": "CDH1",
    "tuberous sclerosis": "TSC1",
    "marfan syndrome": "FBN1",
    "wilson disease": "ATP7B",
    "hemochromatosis": "HFE",
    "polycystic kidney disease": "PKD1",
    "pkd": "PKD1",
    "maturity onset diabetes": "HNF1A",
    "mody": "HNF1A",
    "arrhythmogenic cardiomyopathy": "PKP2",
    "arvc": "PKP2",
    "dilated cardiomyopathy": "LMNA",
    "pcsk9": "PCSK9",
    "familial hypercholesterolemia pcsk9": "PCSK9",
}

# ─── Regex patterns ───────────────────────────────────────────────────────────
_HGVS_C = re.compile(r"c\.\d+[^\s,;|]{2,}", re.I)
_PROTEIN_NOTATION = re.compile(r"p?\.?([A-Z][a-z]{2})?([A-Z])(\d+)([A-Z*]|del|dup|ins|fs)", re.I)
_EXON_RANGE = re.compile(r"exon[s]?\s*(\d+)[-–to]+(\d+)\s*del", re.I)
_EXON_SINGLE = re.compile(r"exon[s]?\s*(\d+)\s*del", re.I)
_RSID = re.compile(r"rs\d+", re.I)
# Broad token pattern — candidate gene symbols (2-10 uppercase letters/digits)
_GENE_TOKEN = re.compile(r"\b([A-Z][A-Z0-9]{1,9})\b")

# ─── NCBI gene symbol set (covers all ~20,000 human genes) ───────────────────
_NCBI_GENE_FILE = os.path.join(
    os.path.dirname(__file__), "..", "..", "Homo_sapiens.gene_info.gz"
)

@lru_cache(maxsize=1)
def _load_ncbi_genes() -> set:
    """Load official human gene symbols from NCBI gene_info file (~20k genes)."""
    genes: set = set()
    gz_path = os.path.abspath(_NCBI_GENE_FILE)
    if not os.path.exists(gz_path):
        # Fallback to hardcoded set if file not downloaded yet
        return _FALLBACK_GENES
    try:
        with gzip.open(gz_path, "rt", encoding="utf-8") as f:
            for line in f:
                if line.startswith("#"):
                    continue
                parts = line.split("\t")
                if len(parts) > 2:
                    symbol = parts[2].strip()
                    if symbol and symbol != "-":
                        genes.add(symbol)
    except Exception:
        return _FALLBACK_GENES
    return genes

# Hardcoded fallback (used if NCBI file not downloaded)
_FALLBACK_GENES: set = {
    "BRCA1","BRCA2","MLH1","MSH2","MSH6","PMS2","CFTR","DMD","SOD1","SMN1",
    "LDLR","APOB","MYBPC3","MYH7","KCNQ1","KCNH2","SCN5A","TTR","HBB","F8",
    "F9","GBA","HTT","FXN","NF1","RET","TP53","VHL","PALB2","ATM","CHEK2",
    "APOE","PCSK9","LRRK2","PTEN","APC","STK11","CDH1","TSC1","TSC2","FBN1",
    "COL3A1","PKD1","PKD2","HFE","ATP7B","KCNJ11","ABCC8","GCK","HNF1A",
    "HNF4A","PKP2","LMNA","RB1","SCN5A","RYR2","DSP","DSG2","TMEM43",
    "MUTYH","RAD51C","RAD51D","BARD1","NBN","EPCAM","POLE","POLD1",
}


def normalize_mutation(disease: str, mutation_text: str) -> dict:
    """
    Normalize a plain-language mutation description to canonical gene + HGVS.
    Returns a dict matching NormalizeResponse fields.
    """
    raw = mutation_text.strip()

    # Gene-only mode: no mutation provided — extract gene from condition/disease
    if not raw:
        gene = _extract_gene("", disease)
        if gene:
            return _build_result("", gene, "unknown", f"{gene} (gene-only)", None, "LOW",
                                 f"Gene {gene} identified; no specific variant provided — showing gene-level results")
        return _build_result("", "UNKNOWN", "unknown", "", None, "LOW",
                             "No mutation or recognizable gene provided")

    key = raw.lower().strip()

    # 1. Direct alias lookup
    if key in ALIAS_TABLE:
        entry = ALIAS_TABLE[key]
        return _build_result(raw, entry["gene"], entry["hgvs"], entry["display"],
                             entry["fc"], "HIGH", entry["note"])

    # 2. Try with disease context stripped
    for alias_key, entry in ALIAS_TABLE.items():
        if alias_key in key:
            return _build_result(raw, entry["gene"], entry["hgvs"], entry["display"],
                                 entry["fc"], "HIGH", entry["note"])

    # 3. HGVS c. notation pass-through
    hgvs_match = _HGVS_C.search(raw)
    if hgvs_match:
        hgvs = hgvs_match.group(0)
        gene = _extract_gene(raw, disease)
        fc = _infer_functional_class(hgvs, gene)
        return _build_result(raw, gene or "UNKNOWN", hgvs, hgvs, fc, "MODERATE",
                             f"HGVS notation detected: {hgvs}")

    # 4. rsID pass-through
    rs_match = _RSID.search(raw)
    if rs_match:
        gene = _extract_gene(raw, disease)
        return _build_result(raw, gene or "UNKNOWN", rs_match.group(0), rs_match.group(0),
                             None, "MODERATE", f"rsID detected — will look up in ClinVar")

    # 5. Exon range deletion (DMD)
    exon_range = _EXON_RANGE.search(raw)
    if exon_range:
        start, end = int(exon_range.group(1)), int(exon_range.group(2))
        gene = _extract_gene(raw, disease) or "DMD"
        hgvs = f"c.?_?del (exons {start}-{end})"
        fc = _dmd_exon_to_fc(start, end)
        return _build_result(raw, gene, hgvs, f"Exon {start}-{end} del", fc, "MODERATE",
                             f"Exon {start}-{end} deletion in {gene}")

    # 6. Single exon deletion
    exon_single = _EXON_SINGLE.search(raw)
    if exon_single:
        exon_num = int(exon_single.group(1))
        gene = _extract_gene(raw, disease) or "DMD"
        hgvs = f"c.?_?del (exon {exon_num})"
        fc = _dmd_exon_to_fc(exon_num, exon_num)
        return _build_result(raw, gene, hgvs, f"Exon {exon_num} del", fc, "MODERATE",
                             f"Exon {exon_num} deletion in {gene}")

    # 7. Protein notation (e.g. p.R403Q or R403Q)
    prot_match = _PROTEIN_NOTATION.search(raw)
    if prot_match:
        gene = _extract_gene(raw, disease)
        display = prot_match.group(0).lstrip("p.")
        return _build_result(raw, gene or "UNKNOWN", f"p.{display}", display, None, "LOW",
                             f"Protein notation detected — HGVS lookup recommended")

    # 8. Gene-only fallback from disease
    gene = _extract_gene(raw, disease)
    if gene:
        return _build_result(raw, gene, "unknown", raw, None, "LOW",
                             f"Gene {gene} inferred from disease context; mutation not recognized")

    # 9. Unknown
    return _build_result(raw, "UNKNOWN", "unknown", raw, None, "LOW",
                         "Mutation format not recognized — please use HGVS notation or common name")


def _build_result(original, gene, hgvs, display, fc, confidence, note) -> dict:
    return {
        "original_text": original,
        "gene": gene,
        "hgvs": hgvs,
        "display_mutation": display,
        "functional_class": fc,
        "confidence": confidence,
        "note": note,
    }


def _extract_gene(text: str, disease: str) -> Optional[str]:
    """Try to extract gene symbol from text or disease name.
    Uses NCBI gene_info file for full ~20,000 gene coverage.
    Falls back to hardcoded set if file not downloaded.
    """
    valid_genes = _load_ncbi_genes()
    # Scan tokens in the mutation text for a known gene symbol
    for token in _GENE_TOKEN.findall(text):
        if token in valid_genes:
            return token
    # Disease name → gene fallback
    disease_key = disease.lower().strip()
    for d_key, gene in DISEASE_TO_GENE.items():
        if d_key in disease_key:
            return gene
    return None


def _infer_functional_class(hgvs: str, gene: Optional[str]) -> Optional[str]:
    """Infer functional class from HGVS notation."""
    h = hgvs.lower()
    if gene == "CFTR":
        if "1521_1523del" in h:
            return "f508del"
        if re.search(r"[*x]", h):
            return "nonsense"
        if re.search(r"\+\d+|\-\d+", h):
            return "splicing"
    if gene == "DMD":
        if "del" in h:
            return "exon51_skippable"  # default; exon-specific logic above
    if re.search(r"del|dup|ins|fs", h):
        return "frameshift"
    return None


def _dmd_exon_to_fc(start: int, end: int) -> Optional[str]:
    """Map DMD exon deletion range to exon-skipping functional class."""
    exons = set(range(start, end + 1))
    if 50 in exons:
        return "exon51_skippable"
    if 52 in exons or 53 in exons:
        return "exon53_skippable"
    if 44 in exons or 45 in exons:
        return "exon45_skippable"
    return "dmd_deletion"
