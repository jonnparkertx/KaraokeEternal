export interface Theme {
  /** Primary hue (0–360); drives background, links, buttons, chrome, library, panels */
  hueBlue: number
  /** Accent hue (0–360); drives danger/actions, queued items, Up Now, glows */
  huePink: number
}

export const DEFAULT_THEME: Theme = {
  hueBlue: 209,
  huePink: 270,
}

export function normalizeTheme (value: unknown): Theme {
  const raw = (value && typeof value === 'object') ? value as Partial<Theme> : {}

  return {
    hueBlue: clampHue(raw.hueBlue, DEFAULT_THEME.hueBlue),
    huePink: clampHue(raw.huePink, DEFAULT_THEME.huePink),
  }
}

export function themesEqual (a: Theme, b: Theme): boolean {
  return a.hueBlue === b.hueBlue && a.huePink === b.huePink
}

function clampHue (value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  let rounded = Math.round(n) % 360
  if (rounded < 0) rounded += 360
  return rounded
}

/** Representative hex for a hue (for <input type="color">) */
export function hueToHex (hue: number, saturation = 70, lightness = 50): string {
  const { r, g, b } = hslToRgb(hue, saturation, lightness)
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function hexToHue (hex: string): number {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!match) return 0

  const r = parseInt(match[1], 16) / 255
  const g = parseInt(match[2], 16) / 255
  const b = parseInt(match[3], 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  if (delta === 0) return 0

  let hue = 0
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4

  hue = Math.round(hue * 60)
  return hue < 0 ? hue + 360 : hue
}

export function applyThemeToDocument (theme: Theme, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--hue-blue', String(theme.hueBlue))
  root.style.setProperty('--hue-pink', String(theme.huePink))
}

export function clearThemeFromDocument (root: HTMLElement = document.documentElement): void {
  root.style.removeProperty('--hue-blue')
  root.style.removeProperty('--hue-pink')
}

function hslToRgb (h: number, s: number, l: number): { r: number, g: number, b: number } {
  const sat = s / 100
  const light = l / 100
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = light - c / 2

  let rp = 0
  let gp = 0
  let bp = 0

  if (h < 60) { rp = c; gp = x }
  else if (h < 120) { rp = x; gp = c }
  else if (h < 180) { gp = c; bp = x }
  else if (h < 240) { gp = x; bp = c }
  else if (h < 300) { rp = x; bp = c }
  else { rp = c; bp = x }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  }
}

function toHex (n: number): string {
  return n.toString(16).padStart(2, '0')
}
