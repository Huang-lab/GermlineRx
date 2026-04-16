import { useState, useRef } from 'react'
import { uploadFile } from '../../utils/api'
import type { UploadResponse, ExtractedVariant } from '../../types'

interface Props {
  onVariantSelected: (gene: string, hgvs: string, disease: string) => void
}

export default function FileUpload({ onVariantSelected }: Props) {
  const [dragging, setDragging] = useState(false)
  const [result, setResult] = useState<UploadResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await uploadFile(file)
      setResult(res)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const confidenceBadge = (c: string) => {
    const colors: Record<string, string> = {
      HIGH: 'bg-green-100 text-green-700',
      MEDIUM: 'bg-yellow-100 text-yellow-700',
      LOW: 'bg-red-100 text-red-700',
    }
    return colors[c] || 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-400'
        }`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef} type="file"
          accept=".pdf,.vcf,.vcf.gz"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
        />
        <div className="text-4xl mb-2">📄</div>
        {loading ? (
          <p className="text-sm text-gray-500 animate-pulse">Parsing file...</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700">Drop your genetic report here</p>
            <p className="text-xs text-gray-400 mt-1">Supports PDF genetic reports and annotated VCF files (.vcf, .vcf.gz)</p>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700">
            Found {result.variants_found} variant{result.variants_found !== 1 ? 's' : ''}
          </p>
          {result.parse_warnings.map((w, i) => (
            <p key={i} className="text-xs text-yellow-700 bg-yellow-50 rounded px-3 py-1.5">{w}</p>
          ))}
          {result.variants.map((v: ExtractedVariant, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 hover:border-brand-400 transition">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-gray-800">{v.gene} {v.hgvs}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceBadge(v.confidence)}`}>
                  {v.confidence}
                </span>
              </div>
              {v.classification && (
                <p className="text-xs text-gray-500 mb-2">{v.classification}</p>
              )}
              <p className="text-xs text-gray-400 font-mono truncate mb-2">{v.raw_text}</p>
              <button
                className="text-xs bg-brand-600 text-white px-3 py-1 rounded-md hover:bg-brand-700 transition"
                onClick={() => onVariantSelected(v.gene, v.hgvs, `${v.gene} disease`)}
              >
                Analyze this variant
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
