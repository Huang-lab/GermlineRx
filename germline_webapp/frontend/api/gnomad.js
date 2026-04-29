const MYVARIANT_URL = 'https://myvariant.info/v1/query'
const GNOMAD_GRAPHQL = 'https://gnomad.broadinstitute.org/api'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { gene, hgvs } = req.body || {}
  if (!gene || !hgvs) return res.status(400).json({ error: 'gene and hgvs required' })

  const geneUpper = gene.toUpperCase()
  const geneLevelUrl = `https://gnomad.broadinstitute.org/gene/${geneUpper}?dataset=gnomad_r4`

  try {
    // Step 1: MyVariant.info with assembly=hg38 → GRCh38 VCF coords + ClinVar ID
    const q = encodeURIComponent(`${geneUpper} ${hgvs}`)
    const mvRes = await fetch(
      `${MYVARIANT_URL}?q=${q}&fields=vcf,_id,clinvar.variant_id&assembly=hg38&size=1`
    )
    if (!mvRes.ok) return res.status(200).json({ af: null, gnomad_url: geneLevelUrl, clinvar_id: null })

    const mvJson = await mvRes.json()
    const hit = mvJson?.hits?.[0]
    // Extract ClinVar ID (may be integer or string in MyVariant response)
    const clinvarId = hit?.clinvar?.variant_id != null
      ? String(hit.clinvar.variant_id)
      : null

    if (!hit?.vcf?.position || !hit?.vcf?.ref || !hit?.vcf?.alt) {
      return res.status(200).json({ af: null, gnomad_url: geneLevelUrl, clinvar_id: clinvarId })
    }

    const chrMatch = (hit._id || '').match(/^chr(\w+):/)
    if (!chrMatch) return res.status(200).json({ af: null, gnomad_url: geneLevelUrl, clinvar_id: clinvarId })

    const chr = chrMatch[1]
    const { position: pos, ref, alt } = hit.vcf
    const variantId = `${chr}-${pos}-${ref}-${alt}`
    const variantUrl = `https://gnomad.broadinstitute.org/variant/${variantId}?dataset=gnomad_r4`

    // Step 2: gnomAD v4 GraphQL — server-side, no CORS restriction
    const gnomadRes = await fetch(GNOMAD_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($v: String!) {
          variant(variantId: $v, dataset: gnomad_r4) {
            genome { af }
            exome  { af }
          }
        }`,
        variables: { v: variantId },
      }),
    })

    if (!gnomadRes.ok) return res.status(200).json({ af: null, gnomad_url: variantUrl, clinvar_id: clinvarId })

    const gnomadJson = await gnomadRes.json()
    const variant = gnomadJson?.data?.variant
    const af = variant?.genome?.af ?? variant?.exome?.af ?? null

    return res.status(200).json({ af, gnomad_url: variantUrl, clinvar_id: clinvarId })
  } catch {
    return res.status(200).json({ af: null, gnomad_url: geneLevelUrl, clinvar_id: null })
  }
}
