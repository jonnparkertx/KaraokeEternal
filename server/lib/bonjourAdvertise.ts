import os from 'os'
import Bonjour from 'bonjour-service'
import getLogger from './Log.js'
import getIPAddress from './getIPAddress.js'

const log = getLogger('bonjour')

export type BonjourAdvertiseHandle = {
  stop: () => Promise<void>
}

/**
 * Advertise the web server on the LAN as `_karaokeeternal._tcp` so Apple TV
 * (and other) clients can discover host/port/path without manual config.
 *
 * Disable with KES_BONJOUR=0|false. Optional KES_BONJOUR_NAME overrides the instance name.
 */
export function startBonjourAdvertise (env: {
  KES_PORT?: number
  KES_URL_PATH?: string
  KES_BONJOUR?: boolean
  KES_BONJOUR_NAME?: string
  npm_package_version?: string
}, port: number): BonjourAdvertiseHandle | null {
  if (env.KES_BONJOUR === false) {
    log.verbose('Bonjour advertise disabled (KES_BONJOUR=0)')
    return null
  }

  const urlPath = (env.KES_URL_PATH || '/').replace(/\/?$/, '/')
  const displayName = (env.KES_BONJOUR_NAME || os.hostname() || 'Karaoke Eternal').trim() || 'Karaoke Eternal'
  const version = process.env.npm_package_version || env.npm_package_version || '0'

  const bonjour = new Bonjour()
  const service = bonjour.publish({
    name: displayName,
    type: 'karaokeeternal',
    protocol: 'tcp',
    port,
    txt: {
      path: urlPath,
      scheme: 'http',
      ver: String(version),
      name: displayName,
    },
  })

  const ip = getIPAddress() || 'localhost'
  log.info(`Advertising _karaokeeternal._tcp “${displayName}” at ${ip}:${port}${urlPath}`)

  service.on('error', (err: Error) => {
    log.warn(`Bonjour advertise error: ${err.message}`)
  })

  return {
    stop: () => new Promise((resolve) => {
      try {
        service.stop(() => {
          bonjour.destroy()
          resolve()
        })
      } catch {
        try { bonjour.destroy() } catch { /* ignore */ }
        resolve()
      }
    }),
  }
}
