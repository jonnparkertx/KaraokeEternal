import React from 'react'
import clsx from 'clsx'
import Accordion from 'components/Accordion/Accordion'
import Icon from 'components/Icon/Icon'
import InputRadio from 'components/InputRadio/InputRadio'
import { useAppSelector } from 'store/hooks'
import type { IRoomPrefs } from 'shared/types'
import { DEFAULT_IDLE_MESSAGE } from 'shared/roomPrefs'
import styles from './IdlePrefs.css'

interface IdlePrefsProps {
  prefs: Partial<IRoomPrefs>
  onChange: (prefs: Partial<IRoomPrefs>) => void
}

const IdlePrefs = ({ onChange, prefs = {} }: IdlePrefsProps) => {
  const logoDateUpdated = useAppSelector(state => state.prefs.logoDateUpdated)
  const mode = prefs.idle?.mode === 'logo' ? 'logo' : 'message'
  const message = prefs.idle?.message ?? ''

  const handleSetIdle = (update: Partial<NonNullable<IRoomPrefs['idle']>>) => {
    onChange({
      ...prefs,
      idle: {
        mode,
        message: prefs.idle?.message,
        ...update,
      },
    })
  }

  return (
    <Accordion
      headingComponent={(
        <div className={styles.heading}>
          <Icon icon='TELEVISION_PLAY' />
          <div className={styles.title}>Screensaver</div>
        </div>
      )}
    >
      <div className={styles.content}>
        <p className={styles.help}>
          Shown on the player when the queue is empty.
        </p>

        <div className={styles.field}>
          <InputRadio
            name='idle-mode'
            value='message'
            checked={mode === 'message'}
            label='Custom message'
            onChange={() => handleSetIdle({ mode: 'message' })}
          />
        </div>

        {mode === 'message' && (
          <div className={styles.field}>
            <input
              type='text'
              autoComplete='off'
              value={message}
              placeholder={DEFAULT_IDLE_MESSAGE}
              onChange={e => handleSetIdle({ message: e.target.value })}
              aria-label='Empty queue message'
            />
          </div>
        )}

        <div className={clsx(styles.field, mode === 'message' && styles.spacedFromInput)}>
          <InputRadio
            name='idle-mode'
            value='logo'
            checked={mode === 'logo'}
            label='Logo screensaver'
            onChange={() => handleSetIdle({ mode: 'logo' })}
          />
        </div>

        {mode === 'logo' && (
          <p className={styles.help}>
            {logoDateUpdated
              ? 'Uses the brand logo from Preferences → Branding. It glides around the player like a screensaver.'
              : 'Upload a brand logo in Preferences → Branding first. Until then, the custom message is shown instead.'}
          </p>
        )}
      </div>
    </Accordion>
  )
}

export default IdlePrefs
