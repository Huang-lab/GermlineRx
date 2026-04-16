import type { NormalizeResponse, AnalyzeResponse, UploadResponse } from '../types'
import { staticNormalize } from '../static-mode/staticEngine'

const BASE = '/api'
const STATIC_MODE = import.meta.env.VITE_STATIC_MODE === 'true'

export async function normalizeVariant(disease: string, mutationText: string): Promise<NormalizeResponse> {
  if (STATIC_MODE) {
    return staticNormalize(disease, mutationText)
  }
  const res = await fetch(`${BASE}/normalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disease, mutation_text: mutationText }),
  })
  if (!res.ok) throw new Error(`Normalize failed: ${res.statusText}`)
  return res.json()
}

export async function analyzeVariant(
  gene: string,
  hgvs: string,
  disease: string,
  age: number | null,
  functionalClass: string | null,
): Promise<AnalyzeResponse> {
  const res = await fetch(`${BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      variant: {
        gene,
        hgvs,
        disease,
        age,
        functional_class: functionalClass,
        patient_label: 'Patient',
      },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Analysis failed: ${res.statusText}`)
  }
  return res.json()
}

export async function uploadFile(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
  return res.json()
}
