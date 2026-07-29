import React, { useEffect, useRef, useState } from 'react'
import Accordion from 'components/Accordion/Accordion'
import Button from 'components/Button/Button'
import Icon from 'components/Icon/Icon'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { clearLogo, setTheme, uploadLogo } from 'store/modules/prefs'
import {
  DEFAULT_THEME,
  hexToHue,
  hueToHex,
  normalizeTheme,
  themesEqual,
  type Theme,
} from 'shared/theme'
import styles from './BrandingPrefs.css'

const LOGO_MAX_LENGTH = 204800 // 200KB; keep in sync with server LOGO_MAX_LENGTH

const BrandingPrefs = () => {
  const logoDateUpdated = useAppSelector(state => state.prefs.logoDateUpdated)
  const theme = useAppSelector(state => state.prefs.theme)
  const dispatch = useAppDispatch()
  const [previewURL, setPreviewURL] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [draftTheme, setDraftTheme] = useState<Theme>(() => normalizeTheme(theme))
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDraftTheme(normalizeTheme(theme))
  }, [theme])

  useEffect(() => {
    if (!logoDateUpdated) {
      setPreviewURL(null)
      return
    }

    setPreviewURL(`${document.baseURI}api/prefs/logo?v=${logoDateUpdated}`)
  }, [logoDateUpdated])

  useEffect(() => {
    return () => {
      if (previewURL?.startsWith('blob:')) {
        URL.revokeObjectURL(previewURL)
      }
    }
  }, [previewURL])

  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current)
    }
  }, [])

  const persistTheme = (next: Theme) => {
    if (persistTimer.current) clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      dispatch(setTheme(next))
    }, 150)
  }

  const updateTheme = (partial: Partial<Theme>) => {
    const next = normalizeTheme({ ...draftTheme, ...partial })
    setDraftTheme(next)
    persistTheme(next)
  }

  const handleChoose = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)

    if (file.type !== 'image/png') {
      setError('Logo must be a PNG image')
      return
    }

    if (file.size > LOGO_MAX_LENGTH) {
      setError(`Logo must not exceed ${Math.floor(LOGO_MAX_LENGTH / 1024)}KB`)
      return
    }

    setIsUploading(true)

    try {
      await dispatch(uploadLogo(file)).unwrap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleClear = async () => {
    setError(null)
    setIsUploading(true)

    try {
      await dispatch(clearLogo()).unwrap()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleResetColors = () => {
    setDraftTheme({ ...DEFAULT_THEME })
    dispatch(setTheme(DEFAULT_THEME))
  }

  return (
    <Accordion
      className={styles.container}
      headingComponent={(
        <div className={styles.heading}>
          <Icon icon='PHOTO_ADD' size={32} className={styles.icon} />
          <div className={styles.title}>Branding</div>
        </div>
      )}
    >
      <div className={styles.content}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Logo</h3>
          <p className={styles.help}>
            Optional transparent PNG replaces the Karaoke Eternal text logo on sign-in.
          </p>

          <div className={styles.preview}>
            {!previewURL && (
              <Icon icon='PHOTO_ADD' size={48} className={styles.placeholder} />
            )}

            {previewURL && (
              <img
                src={previewURL}
                alt='Custom logo preview'
                className={styles.previewImage}
              />
            )}

            <input
              type='file'
              accept='image/png'
              onChange={handleChoose}
              className={styles.fileInput}
              disabled={isUploading}
              aria-label='Choose logo PNG'
            />
          </div>

          {logoDateUpdated && (
            <Button
              className={styles.clearBtn}
              onClick={handleClear}
              disabled={isUploading}
            >
              Clear logo
            </Button>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Colors</h3>
          <p className={styles.help}>
            These two hues drive the whole UI: backgrounds, links, buttons, chrome,
            library folders, panels, danger actions, queued songs, and glows.
          </p>

          <HueControl
            id='hue-primary'
            label='Primary'
            description='Background, links, buttons, header/footer, library, panels'
            value={draftTheme.hueBlue}
            onChange={hueBlue => updateTheme({ hueBlue })}
          />

          <HueControl
            id='hue-accent'
            label='Accent'
            description='Danger buttons, transport, queued songs, Up Now, logo glow'
            value={draftTheme.huePink}
            onChange={huePink => updateTheme({ huePink })}
          />

          {!themesEqual(draftTheme, DEFAULT_THEME) && (
            <Button className={styles.clearBtn} onClick={handleResetColors}>
              Reset colors to default
            </Button>
          )}
        </section>

        {error && (
          <div className={styles.error} role='alert'>{error}</div>
        )}
      </div>
    </Accordion>
  )
}

interface HueControlProps {
  id: string
  label: string
  description: string
  value: number
  onChange: (hue: number) => void
}

const HueControl = ({ id, label, description, value, onChange }: HueControlProps) => (
  <div className={styles.hueControl}>
    <div className={styles.hueHeader}>
      <label htmlFor={id} className={styles.hueLabel}>{label}</label>
      <input
        type='color'
        className={styles.colorSwatch}
        value={hueToHex(value)}
        onChange={e => onChange(hexToHue(e.target.value))}
        aria-label={`${label} color`}
        title={`${label} color`}
      />
      <span className={styles.hueValue}>{value}°</span>
    </div>
    <p className={styles.hueDescription}>{description}</p>
    <input
      id={id}
      type='range'
      min={0}
      max={359}
      step={1}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className={styles.hueSlider}
      style={{
        background: 'linear-gradient(to right, '
          + Array.from({ length: 13 }, (_, i) => hueToHex(i * 30)).join(', ')
          + ')',
      }}
    />
  </div>
)

export default BrandingPrefs
