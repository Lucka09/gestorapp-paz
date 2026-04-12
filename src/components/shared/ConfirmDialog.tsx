import { AlertTriangle, Trash2, LogOut, CheckCircle } from 'lucide-react'
import Modal from './Modal'
import { Button } from '@/components/ui'

type TipoConfirm = 'danger' | 'warning' | 'success'

interface Props {
  open:        boolean
  onClose:     () => void
  onConfirm:   () => void | Promise<void>
  titulo:      string
  descripcion: string
  labelConfirm?: string
  labelCancel?:  string
  tipo?:        TipoConfirm
  loading?:     boolean
}

const iconos: Record<TipoConfirm, React.ReactNode> = {
  danger:  <Trash2 size={22} className="text-red-500" />,
  warning: <AlertTriangle size={22} className="text-amber-500" />,
  success: <CheckCircle size={22} className="text-emerald-500" />,
}

const colores: Record<TipoConfirm, string> = {
  danger:  'bg-red-50',
  warning: 'bg-amber-50',
  success: 'bg-emerald-50',
}

export default function ConfirmDialog({
  open, onClose, onConfirm,
  titulo, descripcion,
  labelConfirm = 'Confirmar',
  labelCancel  = 'Cancelar',
  tipo = 'danger',
  loading = false,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="" size="sm">
      <div className="text-center py-2">
        {/* Ícono */}
        <div className={`w-14 h-14 ${colores[tipo]} rounded-2xl flex items-center
                         justify-center mx-auto mb-5`}
             style={{ animation: 'modal-panel-in 0.3s ease-out' }}>
          {iconos[tipo]}
        </div>

        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
            className="text-gray-900 text-base mb-2">
          {titulo}
        </h3>
        <p className="text-gray-500 text-sm leading-relaxed mb-6 max-w-xs mx-auto">
          {descripcion}
        </p>

        <div className="flex gap-3">
          <Button
            variant={tipo === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
            className="flex-1"
          >
            {labelConfirm}
          </Button>
          <Button
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            {labelCancel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
