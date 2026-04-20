import type { VercelRequest, VercelResponse } from '@vercel/node'

const GNOMAD_GRAPHQL = 'https://gnomad.broadinstitute.org/api'
const NCBI_VARIATION = 'https://api.ncbi.nlm.nih.gov/variation/v0/hgvs'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { gene, hgvs } = req.body || {}
  if (!gene || !hgvs) return res.status(400).json({ error: 'gene and hgvs required' })

  try {
    // Step 1: NCBI Variation Services — HGVS → genomic coordinates
    const hgvsQuery = encodeURIComponent(`${gene.toUpperCase()}:${hgvs}`)
    const ncbiRes = await fetch(`${NCBI_VARIATION}/${hgvsQuery}/vcfsets/nc`)

    if (!ncbiRes.ok) {
      return res.status(200).json({ af: null, gnomad_url: `https://gnomad.broadinstitute.org/gene/${gene.toUpperCase()}?dataset=gnomad_r4` })
    }

    const ncbiJson = await ncbiRes.json()
    const spdi = ncbiJson?.placements_with_allele?.[0]?.alleles?.[0]?.allele?.spdi
    if (!spdi) {
      return res.status(200).json({ af: null, gnomad_url: `https://gnomad.broadinstitute.org/gene/${gene.toUpperCase()}?dataset=gnomad_r4` })
    }

    const { seq_id, position, deleted_sequence: ref, inserted_sequence: alt } = spdi
    const chrMatch = seq_id?.match(/NC_0+(\d+)\./)
    if (!chrMatch) {
      return res.status(200).json({ af: null, gnomad_url: `https://gnomad.broadinstitute.org/gene/${gene.toUpperCase()}?dataset=gnomad_r4` })
    }

    const chr = chrMatch[1]
    const pos = position + 1  // SPDI is 0-based, gnomAD uses 1-based
    const variantId = `${chr}-${pos}-${ref}-${alt}`
    const variantUrl = `https://gnomad.broadinstitute.org/variant/${variantId}?dataset=gnomad_r4`

    // Step 2: gnomAD v4 GraphQL — no CORS restriction server-side
    const gnomadQuery = `
      query($variantId: String!) {
        variant(variantId: $variantId, dataset: gnomad_r4) {
          genome { af }
          exome  { af }
        }
      }
    `
    const gnomadRes = await fetch(GNOMAD_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gnomadQuery, variables: { variantId } }),
    })

    if (!gnomadRes.ok) {
      return res.status(200).json({ af: null, gnomad_url: variantUrl })
    }

    const gnomadJson = await gnomadRes.json()
    const variant = gnomadJson?.data?.variant
    const af = variant?.genome?.af ?? variant?.exome?.af ?? null

    return res.status(200).json({ af, gnomad_url: variantUrl })
  } catch (err) {
    return res.status(200).json({ af: null, gnomad_url: `https://gnomad.broadinstitute.org/gene/${gene.toUpperCase()}?dataset=gnomad_r4` })
  }
}
