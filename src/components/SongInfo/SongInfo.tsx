import React, { useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Button from 'components/Button/Button'
import Modal from 'components/Modal/Modal'
import { formatDuration } from 'lib/dateTime'
import getRoundRobinQueue from 'routes/Queue/selectors/getRoundRobinQueue'
import { requestPlayMedia } from 'store/modules/status'
import { closeSongInfo, setCorruptedCdg, setPreferredSong } from 'store/modules/songInfo'
import type { MediaType } from 'shared/types'
import styles from './SongInfo.css'

function getMediaType (relPath: string): MediaType {
  return /\.mp4$/i.test(relPath) ? 'mp4' : 'cdg'
}

const SongInfo = () => {
  const { isLoading, isVisible, songId, media } = useAppSelector(state => state.songInfo)
  const status = useAppSelector(state => state.status)
  const queue = useAppSelector(getRoundRobinQueue)
  const [playMediaId, setPlayMediaId] = useState<number | null>(null)

  const current = queue.entities[status.queueId]
  const canUsePlaybackActions = status.isPlaying
    && !!current
    && current.songId === songId
    && !status.isAtQueueEnd

  const dispatch = useAppDispatch()
  const handleCloseSongInfo = () => {
    setPlayMediaId(null)
    dispatch(closeSongInfo())
  }
  const handlePrefer = (mediaId: number) => dispatch(setPreferredSong({ songId, mediaId, isPreferred: true }))
  const handleRemovePrefer = (mediaId: number) => dispatch(setPreferredSong({ songId, mediaId, isPreferred: false }))

  const handleMarkCorrupted = (mediaId: number) => {
    if (!window.confirm('Mark this CDG/media file as corrupted? It will not be selected for playback in the future.')) {
      return
    }
    dispatch(setCorruptedCdg({ songId, mediaId, isCorruptedCdg: true }))
  }

  const handleUnmarkCorrupted = (mediaId: number) => {
    dispatch(setCorruptedCdg({ songId, mediaId, isCorruptedCdg: false }))
  }

  const handlePlayMedia = (fromStart: boolean) => {
    if (playMediaId === null) return
    const item = media.entities[playMediaId]
    if (!item) return

    dispatch(requestPlayMedia({
      mediaId: playMediaId,
      mediaType: getMediaType(item.relPath),
      fromStart,
    }))
    setPlayMediaId(null)
    dispatch(closeSongInfo())
  }

  const mediaDetails = media.result.map((mediaId) => {
    const item = media.entities[mediaId]
    const isPreferred = !!item.isPreferred
    const isCorruptedCdg = !!item.isCorruptedCdg
    const isCurrentlyPlayingVersion = canUsePlaybackActions
      && (status.mediaId ?? current?.mediaId) === mediaId

    return (
      <div key={item.mediaId} className={styles.media}>
        {item.path + (item.path.indexOf('/') === 0 ? '/' : '\\') + item.relPath}
        <br />
        <span className={styles.label}>Duration: </span>
        {formatDuration(item.duration)}
        <br />
        <span className={styles.label}>Media ID: </span>
        {mediaId}
        <br />
        <span className={styles.label}>Preferred: </span>
        {isPreferred
          && (
            <span>
              <strong>Yes</strong>
&nbsp;
              <a onClick={() => handleRemovePrefer(mediaId)}>(Unset)</a>
            </span>
          )}
        {!isPreferred
          && (
            <span>
              No&nbsp;
              <a onClick={() => handlePrefer(mediaId)}>(Set)</a>
            </span>
          )}
        {canUsePlaybackActions && (
          <>
            <br />
            <span className={styles.label}>Corrupted CDG: </span>
            {isCorruptedCdg
              ? (
                  <span>
                    <strong>Yes</strong>
&nbsp;
                    <a onClick={() => handleUnmarkCorrupted(mediaId)}>(Unset)</a>
                  </span>
                )
              : (
                  <span>
                    No&nbsp;
                    <a onClick={() => handleMarkCorrupted(mediaId)}>(Set)</a>
                  </span>
                )}
            {!isCurrentlyPlayingVersion && (
              <>
                <br />
                <button
                  type='button'
                  className={styles.actionButton}
                  onClick={() => setPlayMediaId(mediaId)}
                >
                  Play this version now
                </button>
              </>
            )}
          </>
        )}
      </div>
    )
  })

  return (
    <>
      <Modal
        visible={isVisible}
        onClose={handleCloseSongInfo}
        title='Song Info'
      >
        <div className={styles.container}>
          <p>
            <span className={styles.label}>Song ID: </span>
            {songId}
            <br />
            <span className={styles.label}>Media Files: </span>
            {isLoading ? '?' : media.result.length}
          </p>

          <div className={styles.mediaContainer}>
            {isLoading ? <p>Loading...</p> : mediaDetails}
          </div>

          <div>
            <Button variant='primary' onClick={handleCloseSongInfo}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        visible={playMediaId !== null}
        onClose={() => setPlayMediaId(null)}
        title='Play this version now'
      >
        <div className={styles.container}>
          <p>Start playback of the selected media file for the current song?</p>
          <div className={styles.playNowActions}>
            <Button variant='primary' onClick={() => handlePlayMedia(false)}>
              Current position
            </Button>
            <Button variant='primary' onClick={() => handlePlayMedia(true)}>
              From beginning
            </Button>
            <Button onClick={() => setPlayMediaId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default SongInfo
