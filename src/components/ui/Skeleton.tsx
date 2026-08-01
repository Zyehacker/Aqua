import type { CSSProperties } from 'react'
import { cn } from '../../utils/cn'

type SkeletonProps = {
  className?: string
  style?: CSSProperties
}

export default function Skeleton({ className, style }: SkeletonProps) {
  return <div className={cn('skeleton', className)} style={style} aria-hidden="true" />
}

export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <div className="page-header">
        <div style={{ flex: 1 }}>
          <Skeleton style={{ width: 120, height: 12, marginBottom: 12, borderRadius: 999 }} />
          <Skeleton style={{ width: '42%', height: 34, marginBottom: 10, borderRadius: 14 }} />
          <Skeleton style={{ width: '28%', height: 16, borderRadius: 999 }} />
        </div>
        <Skeleton style={{ width: 140, height: 44, borderRadius: 14 }} />
      </div>
      <div className="grid-2" style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <Skeleton style={{ height: 240, borderRadius: 18 }} />
        <Skeleton style={{ height: 240, borderRadius: 18 }} />
      </div>
    </div>
  )
}
