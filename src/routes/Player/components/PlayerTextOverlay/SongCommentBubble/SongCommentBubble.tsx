import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useAppSelector } from 'store/hooks'
import UserImage from 'components/UserImage/UserImage'
import type { SongComment } from 'routes/Player/modules/player'
import styles from './SongCommentBubble.css'

const FADE_MS = 1500
const HOLD_MS = 3000
const DURATION_MS = FADE_MS + HOLD_MS + FADE_MS
const SHOWN_OPACITY = 0.94
const X_BOUND_VW = 4.5
const Y_START_VH = 8
const Y_END_VH = -40
/** Vertical clearance needed before another bubble can spawn on the same side */
const CLEAR_SAME_SIDE_VH = 14
/** Slightly less clearance when the new bubble is on the opposite side */
const CLEAR_OPPOSITE_SIDE_VH = 7
const SPAWN_POLL_MS = 100

type Side = 'left' | 'right'

interface ActiveBubble extends SongComment {
  side: Side
  spawnedAt: number
  key: string
}

function randomBetween (min: number, max: number) {
  return min + Math.random() * (max - min)
}

function estimateRiseVh (spawnedAt: number, now: number) {
  const t = Math.min(1, Math.max(0, (now - spawnedAt) / DURATION_MS))
  return (Y_START_VH - Y_END_VH) * t
}

function canSpawn (side: Side, active: ActiveBubble[], now: number) {
  for (const bubble of active) {
    if (now - bubble.spawnedAt >= DURATION_MS) continue

    const risen = estimateRiseVh(bubble.spawnedAt, now)
    const needed = bubble.side === side ? CLEAR_SAME_SIDE_VH : CLEAR_OPPOSITE_SIDE_VH
    if (risen < needed) return false
  }

  return true
}

function buildMotionKeyframes (): Keyframe[] {
  const amp1 = randomBetween(1.4, 2.6)
  const amp2 = randomBetween(0.5, 1.5)
  const amp3 = randomBetween(0.2, 0.7)
  const freq1 = randomBetween(0.7, 1.4)
  const freq2 = randomBetween(1.6, 2.8)
  const freq3 = randomBetween(3.2, 4.8)
  const phase1 = randomBetween(0, Math.PI * 2)
  const phase2 = randomBetween(0, Math.PI * 2)
  const phase3 = randomBetween(0, Math.PI * 2)
  const samples = 48
  const frames: Keyframe[] = []

  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const y = Y_START_VH + (Y_END_VH - Y_START_VH) * t
    const x = amp1 * Math.sin(t * Math.PI * 2 * freq1 + phase1)
      + amp2 * Math.sin(t * Math.PI * 2 * freq2 + phase2)
      + amp3 * Math.sin(t * Math.PI * 2 * freq3 + phase3)
    const clampedX = Math.max(-X_BOUND_VW, Math.min(X_BOUND_VW, x))

    frames.push({
      transform: `translate(${clampedX.toFixed(3)}vw, ${y.toFixed(3)}vh)`,
      offset: t,
    })
  }

  return frames
}

const opacityKeyframes: Keyframe[] = [
  { opacity: 0, offset: 0 },
  { opacity: SHOWN_OPACITY, offset: FADE_MS / DURATION_MS },
  { opacity: SHOWN_OPACITY, offset: (FADE_MS + HOLD_MS) / DURATION_MS },
  { opacity: 0, offset: 1 },
]

interface BubbleItemProps {
  comment: SongComment
  side: Side
  onDone: (key: string) => void
  bubbleKey: string
}

const BubbleItem = ({ comment, side, onDone, bubbleKey }: BubbleItemProps) => {
  const nodeRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = nodeRef.current
    if (!el) return

    const motion = el.animate(buildMotionKeyframes(), {
      duration: DURATION_MS,
      fill: 'forwards',
      easing: 'linear',
    })

    const fade = el.animate(opacityKeyframes, {
      duration: DURATION_MS,
      fill: 'forwards',
      easing: 'linear',
    })

    const done = () => onDone(bubbleKey)
    fade.addEventListener('finish', done)

    return () => {
      fade.removeEventListener('finish', done)
      motion.cancel()
      fade.cancel()
    }
  }, [bubbleKey, onDone])

  return (
    <div
      ref={nodeRef}
      className={clsx(styles.container, styles[side])}
      translate='no'
    >
      <div className={styles.bubble}>
        <UserImage
          userId={comment.userId}
          dateUpdated={comment.userDateUpdated}
          className={styles.userImage}
        />
        <div className={styles.body}>
          <div className={styles.name}>{comment.userDisplayName}</div>
          <div className={styles.text}>{comment.text}</div>
        </div>
      </div>
    </div>
  )
}

const SongCommentBubble = () => {
  const comments = useAppSelector(state => state.player?._songComments ?? [])
  const queueId = useAppSelector(state => state.player?.queueId)
  const [active, setActive] = useState<ActiveBubble[]>([])
  const pendingRef = useRef<SongComment[]>([])
  const seenIdsRef = useRef(new Set<number>())
  const nextSideRef = useRef<Side>('left')
  const activeRef = useRef<ActiveBubble[]>([])
  const spawnKeyRef = useRef(0)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  activeRef.current = active

  const clearPoll = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }

  const trySpawn = useCallback(() => {
    clearPoll()

    const now = Date.now()
    // drop finished from the clearance check source of truth
    const living = activeRef.current.filter(b => now - b.spawnedAt < DURATION_MS)
    if (living.length !== activeRef.current.length) {
      activeRef.current = living
      setActive(living)
    }

    if (pendingRef.current.length === 0) return

    const side = nextSideRef.current
    if (!canSpawn(side, living, now)) {
      pollRef.current = setTimeout(trySpawn, SPAWN_POLL_MS)
      return
    }

    const comment = pendingRef.current.shift()!
    spawnKeyRef.current += 1
    const bubble: ActiveBubble = {
      ...comment,
      side,
      spawnedAt: now,
      key: `${comment.id}-${spawnKeyRef.current}`,
    }

    nextSideRef.current = side === 'left' ? 'right' : 'left'
    const nextActive = [...living, bubble]
    activeRef.current = nextActive
    setActive(nextActive)

    if (pendingRef.current.length > 0) {
      pollRef.current = setTimeout(trySpawn, SPAWN_POLL_MS)
    }
  }, [])

  // reset when the playing song changes
  useEffect(() => {
    clearPoll()
    pendingRef.current = []
    seenIdsRef.current.clear()
    nextSideRef.current = 'left'
    activeRef.current = []
    setActive([])
  }, [queueId])

  // enqueue newly arrived comments
  useEffect(() => {
    let added = false

    for (const comment of comments) {
      if (seenIdsRef.current.has(comment.id)) continue
      seenIdsRef.current.add(comment.id)
      pendingRef.current.push(comment)
      added = true
    }

    if (added) trySpawn()
  }, [comments, trySpawn])

  useEffect(() => () => clearPoll(), [])

  const handleDone = useCallback((key: string) => {
    const next = activeRef.current.filter(b => b.key !== key)
    activeRef.current = next
    setActive(next)
    if (pendingRef.current.length > 0) trySpawn()
  }, [trySpawn])

  if (active.length === 0) return null

  return (
    <>
      {active.map(bubble => (
        <BubbleItem
          key={bubble.key}
          bubbleKey={bubble.key}
          comment={bubble}
          side={bubble.side}
          onDone={handleDone}
        />
      ))}
    </>
  )
}

export default SongCommentBubble
