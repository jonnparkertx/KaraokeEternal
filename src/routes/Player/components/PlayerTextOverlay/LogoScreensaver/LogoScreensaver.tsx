import React, { useEffect, useRef } from 'react'
import styles from './LogoScreensaver.css'

interface LogoScreensaverProps {
  src: string
  width: number
  height: number
  onError?: () => void
}

const SPEED = 80 // px per second
const LOGO_SIZE_RATIO = 0.22 // of the shorter viewport edge

const LogoScreensaver = ({ src, width, height, onError }: LogoScreensaverProps) => {
  const logoSize = Math.max(80, Math.min(width, height) * LOGO_SIZE_RATIO)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const pos = useRef({ x: width * 0.2, y: height * 0.2 })
  const vel = useRef({
    x: SPEED * (Math.random() < 0.5 ? 1 : -1),
    y: SPEED * (Math.random() < 0.5 ? 1 : -1),
  })
  const sizeRef = useRef({ width, height, logoSize })
  sizeRef.current = { width, height, logoSize }

  useEffect(() => {
    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      const { width: w, height: h, logoSize: size } = sizeRef.current
      const maxX = Math.max(0, w - size)
      const maxY = Math.max(0, h - size)

      let { x, y } = pos.current
      let { x: vx, y: vy } = vel.current

      x += vx * dt
      y += vy * dt

      if (x <= 0) { x = 0; vx = Math.abs(vx) }
      else if (x >= maxX) { x = maxX; vx = -Math.abs(vx) }

      if (y <= 0) { y = 0; vy = Math.abs(vy) }
      else if (y >= maxY) { y = maxY; vy = -Math.abs(vy) }

      pos.current = { x, y }
      vel.current = { x: vx, y: vy }

      const el = imgRef.current
      if (el) {
        el.style.transform = `translate(${x}px, ${y}px)`
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Clamp position when container resizes
  useEffect(() => {
    const maxX = Math.max(0, width - logoSize)
    const maxY = Math.max(0, height - logoSize)
    pos.current = {
      x: Math.min(pos.current.x, maxX),
      y: Math.min(pos.current.y, maxY),
    }
  }, [width, height, logoSize])

  return (
    <img
      ref={imgRef}
      className={styles.logo}
      src={src}
      alt=''
      width={logoSize}
      height={logoSize}
      draggable={false}
      onError={onError}
      style={{
        width: logoSize,
        height: logoSize,
        transform: `translate(${pos.current.x}px, ${pos.current.y}px)`,
      }}
    />
  )
}

export default LogoScreensaver
