interface Props {
  value: string
  onChange: (value: string) => void
}

export default function SexSelector({ value, onChange }: Props) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">
        4. Biological sex{' '}
        <span className="font-normal text-gray-400">(optional — improves trial matching)</span>
      </label>
      <div className="flex gap-2">
        {(['', 'MALE', 'FEMALE'] as const).map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`px-4 py-1.5 rounded-full text-sm border transition font-medium ${
              value === opt
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400 hover:text-brand-700'
            }`}
          >
            {opt === '' ? 'Not specified' : opt === 'MALE' ? 'Male' : 'Female'}
          </button>
        ))}
      </div>
    </div>
  )
}
