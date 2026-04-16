interface Props {
  confidence: string
  stars?: number
}

const COLORS: Record<string, string> = {
  HIGH:           'bg-green-100 text-green-800 border-green-200',
  MODERATE:       'bg-yellow-100 text-yellow-800 border-yellow-200',
  LOW:            'bg-orange-100 text-orange-800 border-orange-200',
  NOT_ACTIONABLE: 'bg-gray-100 text-gray-600 border-gray-200',
}

const LABELS: Record<string, string> = {
  HIGH:           'High Confidence',
  MODERATE:       'Moderate Confidence',
  LOW:            'Low Confidence',
  NOT_ACTIONABLE: 'Not Actionable',
}

export default function ConfidenceBadge({ confidence, stars }: Props) {
  const color = COLORS[confidence] || COLORS.LOW
  const label = LABELS[confidence] || confidence

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${color}`}>
      {stars !== undefined && (
        <span className="text-yellow-500">
          {'★'.repeat(stars)}{'☆'.repeat(Math.max(0, 4 - stars))}
        </span>
      )}
      {label}
    </span>
  )
}
