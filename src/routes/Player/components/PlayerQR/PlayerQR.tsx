import React, { useState, useEffect, useRef, useCallback } from 'react'
import clsx from 'clsx'
import { useAppSelector } from 'store/hooks'
import { CSSTransition } from 'react-transition-group'
import { QRCode } from 'react-qrcode-logo'
import { resolveQrWatermark } from 'shared/roomPrefs'
import type { QueueItem, IRoomPrefs } from 'shared/types'
import styles from './PlayerQR.css'

const MIN_STATIC_MS = 10000 // 10 sec
const MAX_STATIC_MS = 180000 // 3 min
const LOGO_MAX_RATIO = 0.5

interface PlayerQRProps {
  height: number
  prefs: IRoomPrefs['qr']
  queueItem: QueueItem
}

interface LogoFit {
  src: string
  width: number
  height: number
}

/** Fit logo inside a square max size without stretching (letterbox / pillarbox). */
function fitLogoSize (naturalWidth: number, naturalHeight: number, maxSize: number) {
  if (!naturalWidth || !naturalHeight) {
    return { width: maxSize, height: maxSize }
  }

  const scale = Math.min(maxSize / naturalWidth, maxSize / naturalHeight)
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  }
}

const PlayerQR = ({ height, prefs, queueItem }: PlayerQRProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const maxTimerID = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastToggleTime = useRef<number>(0)
  const [show, setShow] = useState(true)
  const [alternate, setAlternate] = useState(false)
  const [logoFit, setLogoFit] = useState<LogoFit | null>(null)
  const { isPlaying } = useAppSelector(state => state.player)
  const { roomId } = useAppSelector(state => state.user)
  const brandLogoDateUpdated = useAppSelector(state => state.prefs.logoDateUpdated)

  const scheduleNextToggle = useCallback(() => {
    if (maxTimerID.current) {
      clearTimeout(maxTimerID.current)
      maxTimerID.current = null
    }

    // wait for current song to end?
    if (isPlaying) return

    const now = Date.now()
    const timeSinceLastToggle = now - lastToggleTime.current
    const timeUntilMax = Math.max(MAX_STATIC_MS - timeSinceLastToggle, 0)

    maxTimerID.current = setTimeout(() => {
      setShow(false)
    }, timeUntilMax)
  }, [isPlaying])

  useEffect(() => {
    lastToggleTime.current = Date.now()
  }, [])

  useEffect(() => {
    scheduleNextToggle()

    return () => {
      if (maxTimerID.current) clearTimeout(maxTimerID.current)
    }
  }, [scheduleNextToggle])

  useEffect(() => {
    const now = Date.now()
    const timeSinceLastToggle = now - lastToggleTime.current

    if (timeSinceLastToggle > MIN_STATIC_MS) {
      const timeout = setTimeout(() => setShow(false), 0)
      return () => clearTimeout(timeout)
    }
  }, [queueItem?.queueId])

  const size = Math.round(height * (0.05 + (prefs.size ?? 0.5) / 5)) // min: 5vh, max: 25vh
  const quietZoneSize = 5 + (10 * (prefs.size ?? 0.5)) // min: 5px, max: 15px
  const { logoImage, logoOpacity } = resolveQrWatermark(prefs, {
    brandLogoDateUpdated,
    roomId,
    baseURI: document.baseURI,
  })
  const maxLogoSize = Math.round(size * LOGO_MAX_RATIO)

  useEffect(() => {
    let cancelled = false
    const img = new Image()

    img.onload = () => {
      if (cancelled) return
      const fitted = fitLogoSize(img.naturalWidth, img.naturalHeight, maxLogoSize)
      setLogoFit({ src: logoImage, ...fitted })
    }

    img.onerror = () => {
      if (cancelled) return
      setLogoFit({ src: logoImage, width: maxLogoSize, height: maxLogoSize })
    }

    img.src = logoImage

    return () => {
      cancelled = true
    }
  }, [logoImage, maxLogoSize])

  const handleTransitionEnd = () => {
    if (!show) {
      setAlternate(prev => !prev)
      setShow(true) // trigger enter transition
      lastToggleTime.current = Date.now()

      scheduleNextToggle()
    }
  }

  const url = new URL(window.location.href)
  url.pathname = url.pathname.replace(/\/player$/, '')
  url.searchParams.append('roomId', String(roomId))

  if (prefs.password) {
    url.searchParams.append('password', btoa(prefs.password))
  }

  return (
    <CSSTransition
      in={show}
      nodeRef={ref}
      classNames={{
        enterActive: styles.enterActive,
        exitActive: styles.exitActive,
      }}
      addEndListener={(done: () => void) => {
        const node = ref.current
        if (!node) return

        const onTransitionEnd = (e: Event) => {
          if (e.target !== node) return // ignore bubbling from children
          node.removeEventListener('transitionend', onTransitionEnd)
          done() // required for react-transition-group
          handleTransitionEnd()
        }

        node.addEventListener('transitionend', onTransitionEnd, false)
      }}
    >
      <div
        className={clsx(styles.container, alternate && styles.alternate)}
        ref={ref}
      >
        {logoFit && (
          <QRCode
            key={`${logoFit.src}:${logoFit.width}x${logoFit.height}`}
            value={url.href}
            ecLevel='M'
            size={size}
            quietZone={quietZoneSize}
            style={{ opacity: prefs.opacity ?? 0.625 }}
            logoImage={logoFit.src}
            logoWidth={logoFit.width}
            logoHeight={logoFit.height}
            logoOpacity={logoOpacity}
            qrStyle='dots'
          />
        )}
      </div>
    </CSSTransition>
  )
}

export default PlayerQR
