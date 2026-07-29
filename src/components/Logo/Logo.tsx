import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
import { useAppSelector } from 'store/hooks'
import styles from './Logo.css'

interface LogoProps {
  className?: string
  /** Always show the neon text logo (e.g. About), ignoring any custom PNG */
  forceOriginal?: boolean
}

const Logo = (props: LogoProps) => {
  const logoDateUpdated = useAppSelector(state => state.prefs.logoDateUpdated)
  const [isFontLoaded, setIsFontLoaded] = useState(() => {
    // if the font loading API is not supported, we can't wait for it
    return typeof document !== 'undefined' && !document.fonts
  })
  const [customLogoFailed, setCustomLogoFailed] = useState(false)

  useEffect(() => {
    setCustomLogoFailed(false)
  }, [logoDateUpdated])

  useEffect(() => {
    if (document.fonts) {
      document.fonts.load('1em Beon')
        .then(() => {
          setIsFontLoaded(true)
          return true
        })
        .catch(() => {
          setIsFontLoaded(true)
          return false
        })
    }
  }, [])

  if (logoDateUpdated && !customLogoFailed && !props.forceOriginal) {
    return (
      <div className={clsx(styles.container, styles.custom, props.className)}>
        <img
          className={styles.customImage}
          src={`${document.baseURI}api/prefs/logo?v=${logoDateUpdated}`}
          alt='Karaoke Eternal'
          onError={() => setCustomLogoFailed(true)}
        />
      </div>
    )
  }

  return (
    <div className={clsx(styles.container, props.className)} role='img' aria-label='Karaoke Eternal'>
      <span className={styles.title} aria-hidden='true'>
        Karaoke
        <span className={clsx(styles.eternal, { [styles.eternalVisible]: isFontLoaded })}>
          Eterna
          <span className={styles.lastChar}>l</span>
        </span>
      </span>
    </div>
  )
}

export default Logo
