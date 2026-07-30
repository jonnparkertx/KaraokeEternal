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
 * Disable with KES_BONJOUR=0|false.
 * In Docker bridge networking, set KES_BONJOUR_HOST to a LAN-reachable address
 * (e.g. 192.168.1.10 or jonncloud.local) and KES_BONJOUR_PORT to the published
 * host port when it differs from the container listen port.
 */
export function startBonjourAdvertise (env: {
  KES_PORT?: number
  KES_URL_PATH?: string
  KES_BONJOUR?: boolean
  KES_BONJOUR_NAME?: string
  KES_BONJOUR_HOST?: string
  KES_BONJOUR_PORT?: number
  npm_package_version?: string
}, port: number): BonjourAdvertiseHandle | null {
  if (env.KES_BONJOUR === false) {
    log.verbose('Bonjour advertise disabled (KES_BONJOUR=0)')
    return null
  }

  const urlPath = (env.KES_URL_PATH || '/').replace(/\/?$/, '/')
  const rawName = (env.KES_BONJOUR_NAME || os.hostname() || 'Karaoke Eternal').trim() || 'Karaoke Eternal'
  // Bonjour instance names should be human labels, not FQDNs.
  const displayName = rawName
    .replace(/\.localdomain$/i, '')
    .replace(/\.local$/i, '')
    .replace(/[._]/g, '-')
    .slice(0, 63) || 'Karaoke-Eternal'

  const version = process.env.npm_package_version || env.npm_package_version || '0'
  const detected = getIPAddress() || undefined
  const host = env.KES_BONJOUR_HOST || detected
  const advertisePort = env.KES_BONJOUR_PORT || port

  if (host && isLikelyDockerBridgeIP(host) && !env.KES_BONJOUR_HOST) {
    log.warn(
      `Bonjour host ${host} looks like a Docker bridge address and is not reachable from Apple TV / phones. ` +
      `Set KES_BONJOUR_HOST to your NAS LAN IP or .local name (and KES_BONJOUR_PORT to the published port if needed).`
    )
  }

  const bonjour = new Bonjour()
  const service = bonjour.publish({
    name: displayName,
    type: 'karaokeeternal',
    protocol: 'tcp',
    port: advertisePort,
    host: host || undefined,
    txt: {
      path: urlPath,
      scheme: 'http',
      ver: String(version),
      name: displayName,
    },
  })

  log.info(
    `Advertising _karaokeeternal._tcp “${displayName}” at ${host || 'auto'}:${advertisePort}${urlPath} ` +
    `(continuous while server runs)`
  )

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

function isLikelyDockerBridgeIP (host: string) {
  // Docker bridge / Desktop ranges — do NOT treat normal LAN 192.168.x as Docker.
  return /^(172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.65\.)/.test(host)
}
