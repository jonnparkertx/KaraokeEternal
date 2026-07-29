import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { requestPlay } from 'store/modules/status'
import getRoomPrefs from '../../selectors/getRoomPrefs'
import { resolveIdlePrefs } from 'shared/roomPrefs'
import ColorCycle from './ColorCycle/ColorCycle'
import LogoScreensaver from './LogoScreensaver/LogoScreensaver'
import UpNow from './UpNow/UpNow'
import Icon from 'components/Icon/Icon'
import type { QueueItem } from 'shared/types'
import styles from './PlayerTextOverlay.css'

interface PlayerTextOverlayProps {
  queueItem?: QueueItem
  nextQueueItem?: QueueItem
  isAtQueueEnd: boolean
  isQueueEmpty: boolean
  isErrored: boolean
  width: number
  height: number
}

const PlayerTextOverlay = ({
  isQueueEmpty,
  isAtQueueEnd,
  isErrored,
  nextQueueItem,
  queueItem,
  width,
  height,
}: PlayerTextOverlayProps) => {
  const dispatch = useAppDispatch()
  const roomPrefs = useAppSelector(getRoomPrefs)
  const logoDateUpdated = useAppSelector(state => state.prefs.logoDateUpdated)
  const handlePlay = () => dispatch(requestPlay())
  const [errorOffset] = useState(() => Math.random() * -300)
  const [logoFailed, setLogoFailed] = useState(false)

  useEffect(() => {
    setLogoFailed(false)
  }, [logoDateUpdated])

  let Component

  if (isQueueEmpty || (isAtQueueEnd && !nextQueueItem)) {
    const idle = resolveIdlePrefs(roomPrefs)
    const logoSrc = logoDateUpdated
      ? `${document.baseURI}api/prefs/logo?v=${logoDateUpdated}`
      : null

    if (idle.mode === 'logo' && logoSrc && !logoFailed) {
      Component = (
        <LogoScreensaver
          src={logoSrc}
          width={width}
          height={height}
          onError={() => setLogoFailed(true)}
        />
      )
    } else {
      Component = <ColorCycle text={idle.message} className={styles.backdrop} />
    }
  } else if (!queueItem || (isAtQueueEnd && nextQueueItem)) {
    Component = (
      <>
        <svg width='0' height='0' style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id='play-icon-gradient' x1='0%' y1='0%' x2='100%' y2='100%'>
              <stop offset='0%' className={styles.gradientStop1} />
              <stop offset='100%' className={styles.gradientStop2} />
            </linearGradient>
          </defs>
        </svg>
        <button className={styles.playButton} onClick={handlePlay} aria-label='Play'>
          <Icon icon='PLAY' />
        </button>
      </>
    )
  } else if (isErrored) {
    Component = (
      <>
        <ColorCycle text='OOPS...' offset={errorOffset} className={styles.backdrop} />
        <ColorCycle text='SEE QUEUE FOR DETAILS' offset={errorOffset} className={styles.backdrop} />
      </>
    )
  } else {
    Component = <UpNow queueItem={queueItem} />
  }

  return (
    <div style={{ width, height }} className={styles.container}>
      {Component}
    </div>
  )
}

export default PlayerTextOverlay
