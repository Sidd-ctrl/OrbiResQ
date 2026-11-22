import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

export type SheetState = 'peek' | 'half' | 'full'

interface Tab {
  id: string
  label: string
  badge?: number
}

interface Props {
  state: SheetState
  onStateChange: (state: SheetState) => void
  tabs: Tab[]
  active: string
  onTab: (id: string) => void
  children: ReactNode
}

const ORDER: SheetState[] = ['peek', 'half', 'full']

function snapPoints() {
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  return {
    peek: 112,
    half: Math.round(vh * 0.46),
    full: Math.round(vh * 0.86),
  }
}

export default function BottomSheet({ state, onStateChange, tabs, active, onTab, children }: Props) {
  const sheetRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const [dragHeight, setDragHeight] = useState<number | null>(null)

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const el = sheetRef.current
    if (!el) return
    dragRef.current = { startY: event.clientY, startHeight: el.offsetHeight }
    setDragHeight(el.offsetHeight)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const limit = window.innerHeight * 0.92
    const next = drag.startHeight + (drag.startY - event.clientY)
    setDragHeight(Math.min(Math.max(next, 88), limit))
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    const points = snapPoints()
    const current = dragHeight ?? points.half
    let best: SheetState = 'half'
    let bestDistance = Number.POSITIVE_INFINITY
    ORDER.forEach((key) => {
      const distance = Math.abs(points[key] - current)
      if (distance < bestDistance) {
        bestDistance = distance
        best = key
      }
    })
    setDragHeight(null)
    onStateChange(best)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const cycle = () => {
    const index = ORDER.indexOf(state)
    onStateChange(ORDER[(index + 1) % ORDER.length])
  }

  return (
    <section
      ref={sheetRef}
      className={`bottom-sheet sheet-${state}`}
      style={dragHeight ? { height: `${dragHeight}px` } : undefined}
      aria-label="Monitoring sheet"
    >
      <div
        className="sheet-grab"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="button"
        tabIndex={0}
        aria-label="Resize monitoring sheet"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            cycle()
          }
        }}
      >
        <span className="sheet-grab-bar" aria-hidden="true" />
      </div>

      <div className="sheet-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={`sheet-tab${active === tab.id ? ' active' : ''}`}
            onClick={() => {
              onTab(tab.id)
              if (state === 'peek') onStateChange('half')
            }}
          >
            <span>{tab.label}</span>
            {tab.badge != null && tab.badge > 0 ? <span className="sheet-badge mono">{tab.badge}</span> : null}
          </button>
        ))}
        <button
          type="button"
          className="sheet-cycle"
          onClick={cycle}
          aria-label={state === 'full' ? 'Collapse sheet' : 'Expand sheet'}
        >
          <span className="mono">{state === 'full' ? '▾' : '▴'}</span>
        </button>
      </div>

      <div className="sheet-body">{children}</div>
    </section>
  )
}
