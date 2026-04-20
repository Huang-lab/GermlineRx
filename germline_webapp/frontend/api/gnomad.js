const MYVARIANT_URL = 'https://myvariant.info/v1/query'

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
    // MyVariant.info accepts gene:hgvs directly — no coordinate conversion needed
    const q = encodeURIComponent(`${geneUpper}:${hgvs}`)
    const fields = 'gnomad_genome.af.af,gnomad_exome.af.af,dbsnp.rsid,_id'
    const url = `${MYVARIANT_URL}?q=${q}&fields=${fields}&size=1`

    const mvRes = await fetch(url)
    if (!mvRes.ok) return res.status(200).json({ af: null, gnomad_url: geneLevelUrl })

    const mvJson = await mvRes.json()
    const hit = mvJson?.hits?.[0]

    if (!hit) return res.status(200).json({ af: null, gnomad_url: geneLevelUrl })

    const af = hit?.gnomad_genome?.af?.af ?? hit?.gnomad_exome?.af?.af ?? null

    // Build gnomAD URL from the variant _id (e.g. "chr7:g.117548628CTT>C")
    // MyVariant _id format: "chr7:g.117548628CTT>C" → gnomAD wants "7-117548628-CTT-C"
    let gnomadUrl = geneLevelUrl
    const variantId = hit?._id || ''
    const idMatch = variantId.match(/^chr(\w+):g\.(\d+)([A-Z]+)>([A-Z]+)$/)
    if (idMatch) {
      const [, chr, pos, ref, alt] = idMatch
      gnomadUrl = `https://gnomad.broadinstitute.org/variant/${chr}-${pos}-${ref}-${alt}?dataset=gnomad_r2_1`
    }

    return res.status(200).json({ af, gnomad_url: gnomadUrl })
  } catch {
    return res.status(200).json({ af: null, gnomad_url: geneLevelUrl })
  }
}
