// src/hooks/useDescargaCupones.ts
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { DescargaCuponesJob } from '@/cupon_types'

export function useDescargaCupones(tramiteId: string | undefined) {
  const [job, setJob] = useState<DescargaCuponesJob | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tramiteId) {
      setJob(null)
      setLoading(false)
      return
    }

    const ref = doc(db, 'descargaCupones', tramiteId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setJob(snap.data() as DescargaCuponesJob)
        } else {
          setJob(null)
        }
        setLoading(false)
      },
      (err) => {
        console.error('[useDescargaCupones] error:', err)
        setLoading(false)
      },
    )

    return () => unsub()
  }, [tramiteId])

  return { job, loading }
}