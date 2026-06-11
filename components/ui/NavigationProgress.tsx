'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export default function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const [width, setWidth] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  function clearAll() {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => {
    clearAll()
    setVisible(true)
    setWidth(0)

    const push = (delay: number, fn: () => void) => {
      const t = setTimeout(fn, delay)
      timers.current.push(t)
    }

    push(10,  () => setWidth(20))
    push(150, () => setWidth(50))
    push(500, () => setWidth(72))
    push(900, () => setWidth(85))
    push(1400, () => {
      setWidth(100)
      push(500, () => {
        setVisible(false)
        setWidth(0)
      })
    })

    return clearAll
  }, [pathname, searchParams])

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[9999] h-[3px]"
      style={{
        width: `${width}%`,
        opacity: visible ? 1 : 0,
        transition: width === 0
          ? 'none'
          : width === 100
            ? 'width 0.3s ease, opacity 0.4s ease 0.3s'
            : 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        background: 'linear-gradient(90deg, #1E3A8A 0%, #3A5FC4 60%, #DDB022 100%)',
        boxShadow: visible ? '0 0 12px rgba(58, 95, 196, 0.7), 0 0 4px rgba(221, 176, 34, 0.5)' : 'none',
      }}
    />
  )
}
