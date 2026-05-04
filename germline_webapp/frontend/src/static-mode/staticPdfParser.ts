import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { UploadResponse, ExtractedVariant } from '../types'

const KNOWN_GENES = [
  'BRCA1','BRCA2','CFTR','DMD','TTR','HBB','SOD1','SMN1','GBA','LDLR',
  'MYBPC3','MYH7','HTT','FXN','F8','F9','NF1','VHL','RET','TP53',
  'PALB2','ATM','CHEK2','PMS2','MLH1','MSH2','MSH6','TSC1','TSC2',
  'PTEN','APC','FBN1','PKD1','PKD2','HFE','ATP7B','KCNQ1','KCNH2',
  'SCN5A','LMNA','PKP2','COL3A1','RB1','STK11','CDH1','HNF1A','GCK',
  'PCSK9','APOE','LRRK2','RYR1','RYR2',
  // Renal
  'PKHD1','NPHP1','NPHP4','CEP290','UMOD','SLC12A3','CLCNKB',
  // Neuro
  'SCN1A','SCN2A','KCNQ2','MECP2','UBE3A','CDKL5','FOXG1',
  // Neuromuscular
  'DYSF','CAPN3','FKRP','LAMA2','COL6A1','COL6A2','COL6A3',
  // Metabolic
  'PAH','GAA','HEXA','IDUA','SGSH','ACADM','OTC','CBS','MTHFR',
  // Hearing
  'GJB2','SLC26A4','OTOF','MYO7A','CDH23',
  // Eye
  'ABCA4','USH2A','RPE65','RS1',
  // Connective tissue
  'COL1A1','COL1A2','ELN','FLNA',
  // RASopathies
  'PTPN11','SOS1','RAF1','BRAF','MAP2K1','HRAS','KRAS','NRAS','RIT1',
  // Vascular
  'ACTA2','MYH11','TGFBR1','TGFBR2','SMAD3','NOTCH1',
  // Immune
  'CYBB','AIRE','FOXP3','RAG1','RAG2',
  // Other commonly reported
  'SERPINA1','CYP21A2','CFHR5','COL4A3','COL4A4','COL4A5',
]

const KNOWN_ALIASES: Record<string, { gene: string; hgvs: string }> = {
  'F508del': { gene: 'CFTR', hgvs: 'c.1521_1523del' },
  'Phe508del': { gene: 'CFTR', hgvs: 'c.1521_1523del' },
  'G551D': { gene: 'CFTR', hgvs: 'c.1652G>A' },
  'W1282X': { gene: 'CFTR', hgvs: 'c.3846G>A' },
  'R117H': { gene: 'CFTR', hgvs: 'c.350G>A' },
  'HbS': { gene: 'HBB', hgvs: 'c.20A>T' },
  'E6V': { gene: 'HBB', hgvs: 'c.20A>T' },
  'V30M': { gene: 'TTR', hgvs: 'c.148G>A' },
  'V122I': { gene: 'TTR', hgvs: 'c.424G>A' },
  'A4V': { gene: 'SOD1', hgvs: 'c.14C>T' },
  'N370S': { gene: 'GBA', hgvs: 'c.1226A>G' },
  'L444P': { gene: 'GBA', hgvs: 'c.1448T>C' },
  '6174delT': { gene: 'BRCA2', hgvs: 'c.5946del' },
  '185delAG': { gene: 'BRCA1', hgvs: 'c.68_69del' },
  '5382insC': { gene: 'BRCA1', hgvs: 'c.5266dup' },
}

const CLS_KEYWORDS: Record<string, string> = {
  'pathogenic': 'Pathogenic',
  'likely pathogenic': 'Likely Pathogenic',
  'likely benign': 'Likely Benign',
  'benign': 'Benign',
  'variant of uncertain significance': 'VUS',
  'vus': 'VUS',
  'uncertain significance': 'VUS',
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
  }
  return pages.join('\n')
}

function findClassificationNear(text: string, start: number): string | null {
  const window = text.slice(Math.max(0, start - 500), start + 500).toLowerCase()
  for (const [kw, cls] of Object.entries(CLS_KEYWORDS)) {
    if (window.includes(kw)) return cls
  }
  return null
}

export async function parsePdf(file: File): Promise<UploadResponse> {
  let fullText: string
  try {
    fullText = await extractPdfText(file)
  } catch (e) {
    return {
      file_type: 'pdf',
      variants_found: 0,
      variants: [],
      parse_warnings: [`Could not read PDF: ${e instanceof Error ? e.message : String(e)}`],
    }
  }

  const seen = new Set<string>()
  const variants: ExtractedVariant[] = []

  // 1. Alias matches (e.g. F508del, HbS)
  for (const [alias, mapped] of Object.entries(KNOWN_ALIASES)) {
    const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    let m: RegExpExecArray | null
    while ((m = regex.exec(fullText)) !== null) {
      const key = `${mapped.gene}:${mapped.hgvs}`
      if (seen.has(key)) continue
      seen.add(key)
      variants.push({
        gene: mapped.gene,
        hgvs: mapped.hgvs,
        confidence: 'HIGH',
        raw_text: m[0],
        classification: findClassificationNear(fullText, m.index),
      })
    }
  }

  // 2. HGVS c. notation with nearby gene symbol
  const hgvsRegex = /\b(c\.[0-9A-Za-z_>+\-*[\]()]+)/g
  let m: RegExpExecArray | null
  while ((m = hgvsRegex.exec(fullText)) !== null) {
    const hgvs = m[1]
    const surrounding = fullText.slice(Math.max(0, m.index - 150), m.index + 50)
    const geneMatch = surrounding.match(new RegExp(`\\b(${KNOWN_GENES.join('|')})\\b`))
    const gene = geneMatch ? geneMatch[1] : null
    if (!gene) continue
    const key = `${gene}:${hgvs}`
    if (seen.has(key)) continue
    seen.add(key)
    variants.push({
      gene,
      hgvs,
      confidence: 'MODERATE',
      raw_text: `${gene} ${hgvs}`,
      classification: findClassificationNear(fullText, m.index),
    })
  }

  // 3. Protein notation p.Xxx000Xxx near a gene
  const protRegex = /\b(p\.[A-Z][a-z]{2}\d+[A-Z][a-z]{2}|p\.[A-Z]\d+[A-Z])\b/g
  while ((m = protRegex.exec(fullText)) !== null) {
    const prot = m[1]
    const surrounding = fullText.slice(Math.max(0, m.index - 150), m.index + 50)
    const geneMatch = surrounding.match(new RegExp(`\\b(${KNOWN_GENES.join('|')})\\b`))
    const gene = geneMatch ? geneMatch[1] : null
    if (!gene) continue
    const key = `${gene}:${prot}`
    if (seen.has(key)) continue
    seen.add(key)
    variants.push({
      gene,
      hgvs: prot,
      confidence: 'MODERATE',
      raw_text: `${gene} ${prot}`,
      classification: findClassificationNear(fullText, m.index),
    })
  }

  // 3b. Extended protein notation (frameshift, nonsense, in-frame del/dup)
  const protRegexExt = /\b(p\.[A-Z][a-z]{2}\d+[A-Z][a-z]{2,}fs\*\d+|p\.[A-Z][a-z]{2}\d+\*|p\.[A-Z][a-z]{2}\d+_[A-Z][a-z]{2}\d+(?:del|dup)|p\.[A-Z][a-z]{2}\d+del)\b/g
  while ((m = protRegexExt.exec(fullText)) !== null) {
    const prot = m[1]
    const surrounding = fullText.slice(Math.max(0, m.index - 150), m.index + 50)
    const geneMatch = surrounding.match(new RegExp(`\\b(${KNOWN_GENES.join('|')})\\b`))
    const gene = geneMatch ? geneMatch[1] : null
    if (!gene) continue
    const key = `${gene}:${prot}`
    if (seen.has(key)) continue
    seen.add(key)
    variants.push({
      gene,
      hgvs: prot,
      confidence: 'MODERATE',
      raw_text: `${gene} ${prot}`,
      classification: findClassificationNear(fullText, m.index),
    })
  }

  // 4. Fallback: any gene-like symbol near HGVS that wasn't caught above
  const GENE_FALSE_POSITIVES = new Set([
    'THE','AND','FOR','NOT','THIS','WITH','FROM','THAT','HAVE','BEEN',
    'ALSO','ONLY','INTO','EACH','SUCH','THAN','PAGE','TEST','TYPE',
    'LAST','GENE','OMIM','MODE','HIGH','NEXT','BOTH','DATE','NAME',
    'MALE','INFO','YEAR','CLIA','NONE','BASED','EXON','STOP','PLUS',
  ])
  const hgvsHits = [...fullText.matchAll(/\b(c\.[0-9A-Za-z_>+\-*[\]()]+)/g)]
  for (const hit of hgvsHits) {
    const window = fullText.slice(Math.max(0, hit.index! - 200), hit.index!)
    const geneCandidate = window.match(/\b([A-Z][A-Z0-9]{1,12})\b/g)
    if (!geneCandidate) continue
    const gene = geneCandidate[geneCandidate.length - 1]
    if (GENE_FALSE_POSITIVES.has(gene)) continue
    if (gene.length < 2) continue
    const key = `${gene}:${hit[1]}`
    if (seen.has(key)) continue
    seen.add(key)
    variants.push({
      gene,
      hgvs: hit[1],
      confidence: 'LOW',
      raw_text: `${gene} ${hit[1]}`,
      classification: findClassificationNear(fullText, hit.index!),
    })
  }

  // Post-processing: extract clinvar_id, zygosity, inheritance
  for (const v of variants) {
    const idx = fullText.indexOf(v.raw_text)
    if (idx === -1) continue
    const nearbyText = fullText.slice(Math.max(0, idx - 300), idx + 300)

    const clinvarMatch = nearbyText.match(/\b(\d{5,7})\b/g)
    if (clinvarMatch) {
      for (const candidate of clinvarMatch) {
        const num = parseInt(candidate)
        if (num >= 10000 && (num < 2000 || num > 2030)) {
          v.clinvar_id = candidate
          break
        }
      }
    }

    const zygoMatch = nearbyText.match(/\b(heterozygous|homozygous|hemizygous)\b/i)
    if (zygoMatch) v.zygosity = zygoMatch[1].toLowerCase()

    const inheritMatch = nearbyText.match(/\b(paternal|maternal|de novo)\b/i)
    if (inheritMatch) v.inheritance = inheritMatch[1].toLowerCase()
  }

  const warnings: string[] = []
  if (variants.length === 0) {
    warnings.push('No recognized variants found in this PDF. Try entering your variant manually using the text box above.')
  }

  return {
    file_type: 'pdf',
    variants_found: variants.length,
    variants,
    parse_warnings: warnings,
  }
}
