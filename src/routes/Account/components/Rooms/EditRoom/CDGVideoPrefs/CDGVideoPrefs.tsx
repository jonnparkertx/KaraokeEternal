import React, { useState } from 'react'
import Accordion from 'components/Accordion/Accordion'
import Button from 'components/Button/Button'
import Icon from 'components/Icon/Icon'
import HttpApi from 'lib/HttpApi'
import type { IRoomPrefs } from 'shared/types'
import styles from './CDGVideoPrefs.css'

const CDG_VIDEO_MAX_BYTES = 32 * 1024 * 1024
const api = new HttpApi('rooms')

interface CDGVideoPrefsProps {
  prefs: Partial<IRoomPrefs>
  onChange: (prefs: Partial<IRoomPrefs>) => void
  roomId?: number
}

const CDGVideoPrefs = ({ onChange, prefs = {}, roomId }: CDGVideoPrefsProps) => {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dateUpdated = prefs.cdgVideo?.dateUpdated ?? null

  const handleSetVideo = (nextUpdated: number | null) => {
    onChange({
      ...prefs,
      cdgVideo: { dateUpdated: nextUpdated },
    })
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || typeof roomId !== 'number') return

    setError(null)

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'mp4' && ext !== 'm4v' && ext !== 'mov') {
      setError('Video must be an MP4, M4V, or MOV file')
      return
    }

    if (file.size > CDG_VIDEO_MAX_BYTES) {
      setError(`Video must not exceed ${Math.floor(CDG_VIDEO_MAX_BYTES / (1024 * 1024))}MB`)
      return
    }

    setIsUploading(true)

    try {
      const data = new FormData()
      data.append('video', file, file.name)
      const response = await api.put<{ dateUpdated: number }>(`/${roomId}/cdg-video`, {
        body: data,
      })
      handleSetVideo(response.dateUpdated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleClear = async () => {
    if (typeof roomId !== 'number') return

    setError(null)
    setIsUploading(true)

    try {
      await api.delete(`/${roomId}/cdg-video`)
      handleSetVideo(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setIsUploading(false)
    }
  }

  const preview = typeof roomId === 'number' && dateUpdated
    ? `${document.baseURI}api/rooms/${roomId}/cdg-video?v=${dateUpdated}`
    : null

  return (
    <Accordion
      headingComponent={(
        <div className={styles.heading}>
          <Icon icon='PLAY' />
          <div className={styles.title}>CD+G backdrop</div>
        </div>
      )}
    >
      <div className={styles.content}>
        <p className={styles.help}>
          Loops on the Apple TV between the CD+G background color and the lyrics.
          Export it as HEVC with Alpha (.mov) so the transparent areas show the lyric color.
          MP4, M4V, or MOV, up to 32MB. The clip is muted.
        </p>

        {typeof roomId !== 'number' && (
          <p className={styles.help}>Save the room first to upload a video.</p>
        )}

        {typeof roomId === 'number' && (
          <div className={styles.field}>
            <div className={styles.preview}>
              {!preview && (
                <Icon icon='PLAY' size={40} className={styles.placeholder} />
              )}
              {preview && (
                <video
                  key={preview}
                  src={preview}
                  className={styles.previewVideo}
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              )}
              <input
                type='file'
                accept='video/mp4,video/quicktime,.mp4,.m4v,.mov'
                onChange={handleUpload}
                className={styles.fileInput}
                disabled={isUploading}
                aria-label='Choose CD+G backdrop video'
              />
            </div>
            {preview && (
              <Button onClick={handleClear} disabled={isUploading}>
                Remove video
              </Button>
            )}
            {isUploading && (
              <p className={styles.help}>{preview ? 'Updating…' : 'Uploading…'}</p>
            )}
          </div>
        )}

        {error && (
          <div className={styles.error} role='alert'>{error}</div>
        )}
      </div>
    </Accordion>
  )
}

export default CDGVideoPrefs
