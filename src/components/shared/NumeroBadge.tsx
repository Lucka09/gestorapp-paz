// src/NumeroBadge.tsx  (o src/components/NumeroBadge.tsx)
// Badge visual del número de trámite con color según tipo

const COLORES_TIPO: Record<string, { bg: string; text: string; border: string }> = {
  TRF: { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  MUL: { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
  INS: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200' },
  T08: { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  PRE: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  IND: { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200' },
  CED: { bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200' },
  INH: { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  LEV: { bg: 'bg-lime-50',    text: 'text-lime-700',    border: 'border-lime-200' },
  ALT: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  BAJ: { bg: 'bg-gray-50',    text: 'text-gray-600',    border: 'border-gray-200' },
  DTI: { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200' },
  DCE: { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200' },
  RAD: { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200' },
  VTV: { bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200' },
  OTR: { bg: 'bg-gray-50',    text: 'text-gray-600',    border: 'border-gray-200' },
}

interface Props {
  numero: string
  tipo?:  string
  size?:  'sm' | 'md' | 'lg'
}

export default function NumeroBadge({ numero, tipo, size = 'md' }: Props) {
  const cod = numero?.split('-')[0] ?? 'OTR'
  const col = COLORES_TIPO[cod] ?? COLORES_TIPO['OTR']

  const sizeClass = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5 font-bold',
  }[size]

  return (
    <span className={`
      inline-flex items-center font-mono font-semibold rounded-lg border
      ${col.bg} ${col.text} ${col.border} ${sizeClass}
      tracking-wider select-all
    `}>
      {numero ?? '—'}
    </span>
  )
}