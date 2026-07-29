import { useEffect } from 'react'
import { useAppSelector } from 'store/hooks'
import { applyThemeToDocument, normalizeTheme } from 'shared/theme'

/**
 * Applies branding theme CSS variables from prefs to :root.
 */
const ThemeApplier = (): null => {
  const theme = useAppSelector(state => state.prefs.theme)

  useEffect(() => {
    applyThemeToDocument(normalizeTheme(theme))
  }, [theme])

  return null
}

export default ThemeApplier
