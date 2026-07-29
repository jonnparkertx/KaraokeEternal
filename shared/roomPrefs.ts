import type { IRoomPrefs } from './types.js'

export const DEFAULT_IDLE_MESSAGE = 'CAN HAZ MOAR SONGZ?'

export const DEFAULT_ROOM_PREFS: IRoomPrefs = {
  qr: {
    isEnabled: false,
    opacity: 0.625,
    password: '',
    size: 0.5,
    watermark: 'default',
    watermarkOpacity: 0.5,
    watermarkDateUpdated: null,
  },
  idle: {
    mode: 'message',
    message: DEFAULT_IDLE_MESSAGE,
  },
}

export function resolveIdlePrefs (prefs?: Partial<IRoomPrefs> | null) {
  const idle = prefs?.idle
  const mode = idle?.mode === 'logo' ? 'logo' as const : 'message' as const
  const message = (idle?.message?.trim() || DEFAULT_IDLE_MESSAGE)

  return { mode, message }
}

export function resolveQrWatermark (
  qr: IRoomPrefs['qr'] | undefined,
  opts: { brandLogoDateUpdated: number | null, roomId: number | null, baseURI: string },
): { logoImage: string, logoOpacity: number } {
  const watermark = qr?.watermark === 'brand' || qr?.watermark === 'custom'
    ? qr.watermark
    : 'default'
  const logoOpacity = typeof qr?.watermarkOpacity === 'number'
    ? Math.min(1, Math.max(0.1, qr.watermarkOpacity))
    : 0.5

  if (watermark === 'brand' && opts.brandLogoDateUpdated) {
    return {
      logoImage: `${opts.baseURI}api/prefs/logo?v=${opts.brandLogoDateUpdated}`,
      logoOpacity,
    }
  }

  if (watermark === 'custom' && opts.roomId != null && qr?.watermarkDateUpdated) {
    return {
      logoImage: `${opts.baseURI}api/rooms/${opts.roomId}/qr-watermark?v=${qr.watermarkDateUpdated}`,
      logoOpacity,
    }
  }

  return {
    logoImage: `${opts.baseURI}assets/app.png`,
    logoOpacity,
  }
}
