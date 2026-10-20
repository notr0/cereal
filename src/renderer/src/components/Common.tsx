import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { mdToHtml } from '../lib/markdown'
import { currentLevel } from '../lib/session'

export function Logo({ size = 18 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 11.5h19a9.5 9.5 0 0 1-19 0Z" fill="currentColor" />
      <circle cx="7.5" cy="8" r="2.1" fill="none" stroke="var(--accent-bars)" strokeWidth="1.7" />
      <circle cx="12.6" cy="6.2" r="2.1" fill="none" stroke="var(--accent-bars)" strokeWidth="1.7" />
      <circle cx="17" cy="8.6" r="2.1" fill="none" stroke="var(--accent-bars)" strokeWidth="1.7" />
    </svg>
  )
}

export function Topbar({ left, right }: { left?: ReactNode; right?: ReactNode }): ReactNode {
  return (
    <div className="topbar drag">
      <div className="left no-drag">{left}</div>
      <div className="no-drag" style={{ display: 'flex', gap: 8 }}>
        {right}
      </div>
    </div>
  )
}

export function Markdown({ text, className = 'md' }: { text: string; className?: string }): ReactNode {
  return <div className={className} dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />
}

/** Granola-style "dancing bars" level meter, driven straight from the recorder at 60 fps. */
export function Bars({ live }: { live: boolean }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!live) return
    let raf = 0
    let t = 0
    const tick = (): void => {
      t++
      const level = currentLevel()
      const spans = ref.current?.children
      if (spans) {
        for (let i = 0; i < spans.length; i++) {
          const wobble = 0.55 + 0.45 * Math.sin(t / 5 + i * 1.9)
          ;(spans[i] as HTMLElement).style.height = `${4 + level * 14 * wobble}px`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [live])
  return (
    <div ref={ref} className={`bars ${live ? 'live' : ''}`}>
      <span />
      <span />
      <span />
      <span />
    </div>
  )
}

export type MenuEntry =
  | { label: string; desc?: string; icon?: ReactNode; checked?: boolean; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | { heading: string }
  | 'sep'

interface MenuState {
  rect: DOMRect
  items: MenuEntry[]
  placement: 'below' | 'above'
}

function Menu({ rect, items, placement, onClose }: MenuState & { onClose: () => void }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8))
    const below = rect.bottom + 6
    const above = rect.top - h - 6
    const top = placement === 'above' ? (above > 8 ? above : below) : below + h < window.innerHeight - 8 ? below : Math.max(8, above)
    setPos({ left, top })
  }, [rect, placement])
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])
  return createPortal(
    <div ref={ref} className="menu popover" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
      {items.map((item, i) => {
        if (item === 'sep') return <div key={i} className="menu-sep" />
        if ('heading' in item)
          return (
            <div key={i} className="menu-label">
              {item.heading}
            </div>
          )
        return (
          <button
            key={i}
            className={`menu-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
            style={item.disabled ? { opacity: 0.45, cursor: 'default' } : undefined}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            {item.icon}
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span>{item.label}</span>
              {item.desc && <span className="desc">{item.desc}</span>}
            </span>
            {item.checked && <Check size={15} className="check" />}
          </button>
        )
      })}
    </div>,
    document.body
  )
}

export function useMenu(): {
  open: (anchor: Element | DOMRect, items: MenuEntry[], placement?: 'below' | 'above') => void
  node: ReactNode
} {
  const [state, setState] = useState<MenuState | null>(null)
  return {
    open: (anchor, items, placement = 'below') =>
      setState({ rect: anchor instanceof Element ? anchor.getBoundingClientRect() : anchor, items, placement }),
    node: state ? <Menu {...state} onClose={() => setState(null)} /> : null
  }
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): ReactNode {
  return <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} />
}

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): ReactNode {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
