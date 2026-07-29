import React, { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import Accordion from 'components/Accordion/Accordion'
import Button from 'components/Button/Button'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import InputRadio from 'components/InputRadio/InputRadio'
import Icon from 'components/Icon/Icon'
import Slider from 'components/Slider/Slider'
import HttpApi from 'lib/HttpApi'
import { useAppSelector } from 'store/hooks'
import type { IRoomPrefs } from 'shared/types'
import styles from './QRPrefs.css'

const LOGO_MAX_LENGTH = 204800
const api = new HttpApi('rooms')

interface QRPrefsProps {
  prefs: Partial<IRoomPrefs>
  onChange: (prefs: Partial<IRoomPrefs>) => void
  roomId?: number
  roomPassword: string
  roomPasswordDirty: boolean
}

type WatermarkMode = 'default' | 'brand' | 'custom'

const QRPrefs = ({ onChange, prefs = {}, roomId, roomPassword, roomPasswordDirty }: QRPrefsProps) => {
  const brandLogoDateUpdated = useAppSelector(state => state.prefs.logoDateUpdated)
  const [isQRPasswordEnabled, setIsQRPasswordEnabled] = useState(!!prefs?.qr?.password)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const watermark = (prefs?.qr?.watermark ?? 'default') as WatermarkMode
  const watermarkOpacity = prefs?.qr?.watermarkOpacity ?? 0.5
  const watermarkDateUpdated = prefs?.qr?.watermarkDateUpdated ?? null

  const handleSetPref = useCallback((update: Partial<IRoomPrefs>) => {
    onChange({ ...prefs, ...update })
  }, [onChange, prefs])

  const handleSetQr = useCallback((update: Partial<IRoomPrefs['qr']>) => {
    handleSetPref({ qr: { ...prefs.qr, ...update } })
  }, [handleSetPref, prefs.qr])

  useEffect(() => {
    if (isQRPasswordEnabled && roomPasswordDirty && prefs?.qr?.password !== roomPassword) {
      handleSetPref({ qr: { ...prefs.qr, password: roomPassword } })
    }
  }, [handleSetPref, isQRPasswordEnabled, prefs, roomPassword, roomPasswordDirty])

  const handleWatermarkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || typeof roomId !== 'number') return

    setError(null)

    if (file.type !== 'image/png') {
      setError('Watermark must be a PNG image')
      return
    }

    if (file.size > LOGO_MAX_LENGTH) {
      setError(`Watermark must not exceed ${Math.floor(LOGO_MAX_LENGTH / 1024)}KB`)
      return
    }

    setIsUploading(true)

    try {
      const data = new FormData()
      data.append('image', file, 'watermark.png')
      const response = await api.put<{ watermarkDateUpdated: number }>(`/${roomId}/qr-watermark`, {
        body: data,
      })

      handleSetQr({
        watermark: 'custom',
        watermarkDateUpdated: response.watermarkDateUpdated,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleClearWatermark = async () => {
    if (typeof roomId !== 'number') return

    setError(null)
    setIsUploading(true)

    try {
      await api.delete(`/${roomId}/qr-watermark`)
      handleSetQr({
        watermark: 'default',
        watermarkDateUpdated: null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setIsUploading(false)
    }
  }

  const customPreview = typeof roomId === 'number' && watermarkDateUpdated
    ? `${document.baseURI}api/rooms/${roomId}/qr-watermark?v=${watermarkDateUpdated}`
    : null

  return (
    <Accordion
      headingComponent={(
        <div className={styles.heading}>
          <Icon icon='QR_CODE' />
          <div className={styles.title}>QR Code</div>
        </div>
      )}
    >
      <div className={styles.content}>
        <div className={styles.field}>
          <InputCheckbox
            label='Show QR code'
            checked={prefs?.qr?.isEnabled ?? false}
            onChange={event => handleSetQr({ isEnabled: event.currentTarget.checked })}
          />
        </div>
        {prefs?.qr?.isEnabled && roomPassword && (
          <div className={styles.field}>
            <InputCheckbox
              label='Include room password'
              checked={isQRPasswordEnabled}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                setIsQRPasswordEnabled(checked)
                if (!checked) handleSetQr({ password: '' })
              }}
            />
          </div>
        )}
        {(isQRPasswordEnabled && !roomPasswordDirty) && (
          <div className={styles.field}>
            <input
              type='password'
              autoComplete='new-password'
              value={prefs?.qr?.password ?? ''}
              onChange={e => handleSetQr({ password: e.target.value })}
              onFocus={e => e.target.select()}
              placeholder='re-enter room password'
            />
          </div>
        )}
        <div className={clsx(styles.field)}>
          <label id='label-qr-size'>Size</label>
          <Slider
            className={styles.slider}
            min={0}
            max={1}
            step={0.05}
            value={prefs?.qr?.size ?? 0.5}
            onChange={(val: number) => handleSetQr({ size: val })}
            aria-labelledby='label-qr-size'
          />
        </div>
        <div className={clsx(styles.field)}>
          <label id='label-qr-opacity'>Opacity</label>
          <Slider
            className={styles.slider}
            min={0.25}
            max={1}
            step={0.075}
            value={prefs?.qr?.opacity ?? 0.625}
            onChange={(val: number) => handleSetQr({ opacity: val })}
            aria-labelledby='label-qr-opacity'
          />
        </div>

        <div className={styles.field}>
          <div className={styles.sectionTitle}>Watermark</div>
          <p className={styles.help}>
            Faded image behind the QR pattern. Keep it light so phones can still scan.
          </p>
        </div>

        <div className={styles.field}>
          <InputRadio
            name='qr-watermark'
            value='default'
            checked={watermark === 'default'}
            label='Default (mic)'
            onChange={() => handleSetQr({ watermark: 'default' })}
          />
        </div>

        <div className={styles.field}>
          <InputRadio
            name='qr-watermark'
            value='brand'
            checked={watermark === 'brand'}
            label='Brand logo'
            onChange={() => handleSetQr({ watermark: 'brand' })}
            disabled={!brandLogoDateUpdated}
          />
          {!brandLogoDateUpdated && (
            <p className={styles.help}>Upload a brand logo in Preferences → Branding first.</p>
          )}
        </div>

        <div className={styles.field}>
          <InputRadio
            name='qr-watermark'
            value='custom'
            checked={watermark === 'custom'}
            label='Custom image'
            onChange={() => handleSetQr({ watermark: 'custom' })}
            disabled={typeof roomId !== 'number'}
          />
        </div>

        {typeof roomId !== 'number' && (
          <p className={styles.help}>Save the room first to upload a custom watermark.</p>
        )}

        {watermark === 'custom' && typeof roomId === 'number' && (
          <div className={styles.field}>
            <div className={styles.preview}>
              {!customPreview && (
                <Icon icon='PHOTO_ADD' size={40} className={styles.placeholder} />
              )}
              {customPreview && (
                <img
                  src={customPreview}
                  alt='QR watermark preview'
                  className={styles.previewImage}
                  style={{ opacity: watermarkOpacity }}
                />
              )}
              <input
                type='file'
                accept='image/png'
                onChange={handleWatermarkUpload}
                className={styles.fileInput}
                disabled={isUploading}
                aria-label='Choose QR watermark PNG'
              />
            </div>
            {customPreview && (
              <Button
                className={styles.clearBtn}
                onClick={handleClearWatermark}
                disabled={isUploading}
              >
                Clear custom watermark
              </Button>
            )}
          </div>
        )}

        <div className={clsx(styles.field)}>
          <label id='label-qr-watermark-opacity'>Watermark fade</label>
          <Slider
            className={styles.slider}
            min={0.1}
            max={0.6}
            step={0.05}
            value={watermarkOpacity}
            onChange={(val: number) => handleSetQr({ watermarkOpacity: val })}
            aria-labelledby='label-qr-watermark-opacity'
          />
        </div>

        {error && (
          <div className={styles.error} role='alert'>{error}</div>
        )}
      </div>
    </Accordion>
  )
}

export default QRPrefs
