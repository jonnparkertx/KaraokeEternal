import path from 'path'
import { promisify } from 'util'
import fs from 'fs'
import getLogger from '../lib/Log.js'
import KoaRouter from '@koa/router'
import getFolders from '../lib/getFolders.js'
import getWindowsDrives from '../lib/getWindowsDrives.js'
import Prefs, { LOGO_MAX_LENGTH } from './Prefs.js'
import Media from '../Media/Media.js'
import pushQueuesAndLibrary from '../lib/pushQueuesAndLibrary.js'
import Rooms from '../Rooms/Rooms.js'
import Queue from '../Queue/Queue.js'
import { PREFS_PATHS_CHANGED, PREFS_PUSH, QUEUE_PUSH } from '../../shared/actionTypes.js'
import type { Prefs as PrefsType } from '../../shared/types.js'

interface File {
  filepath: string
  size: number
  mimetype?: string
  originalFilename?: string
}

interface RequestWithBody {
  body: Record<string, unknown>
  files?: Record<string, File | File[]>
}

const log = getLogger('Prefs')
const router = new KoaRouter({ prefix: '/api/prefs' })
const readFile = promisify(fs.readFile)
const deleteFile = promisify(fs.unlink)

function isPng (buf: Buffer): boolean {
  return buf.length >= 8
    && buf[0] === 0x89
    && buf[1] === 0x50
    && buf[2] === 0x4E
    && buf[3] === 0x47
    && buf[4] === 0x0D
    && buf[5] === 0x0A
    && buf[6] === 0x1A
    && buf[7] === 0x0A
}

function pushPrefsToAdmins (io: { emit: (event: string, action: object) => void }) {
  io.emit('action', {
    type: PREFS_PUSH,
    payload: Prefs.get(),
  })
}

// get all prefs (including media paths)
router.get('/', (ctx) => {
  const prefs = Prefs.get() as unknown as PrefsType

  // must be admin or firstrun
  if (prefs.isFirstRun || ctx.user.isAdmin) {
    ctx.body = prefs
    return
  }

  // non-admins get roles + branding metadata (for signed-out screens)
  ctx.body = {
    roles: prefs.roles,
    logoDateUpdated: prefs.logoDateUpdated ?? null,
    theme: prefs.theme,
  }
})

// get custom logo PNG (public; used on signed-out screens)
router.get('/logo', (ctx) => {
  const logo = Prefs.getLogo()

  if (!logo) {
    ctx.throw(404)
    return
  }

  if (typeof ctx.query.v !== 'undefined') {
    // client can cache a versioned image forever
    ctx.set('Cache-Control', 'max-age=31536000') // 1 year
  }

  ctx.type = 'image/png'
  ctx.body = logo.image
})

// upload custom logo PNG (admin)
router.put('/logo', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const req = ctx.request as unknown as RequestWithBody
  const imageUpload = req.files?.image
  const imageFile = Array.isArray(imageUpload) ? imageUpload[0] : imageUpload

  if (!imageFile) {
    ctx.throw(422, 'Image required')
  }

  if (imageFile.size > LOGO_MAX_LENGTH) {
    await deleteFile(imageFile.filepath)
    ctx.throw(413, `Logo must not exceed ${Math.floor(LOGO_MAX_LENGTH / 1024)}KB`)
  }

  const image = await readFile(imageFile.filepath)
  await deleteFile(imageFile.filepath)

  if (!isPng(image)) {
    ctx.throw(422, 'Logo must be a PNG image')
  }

  Prefs.setLogo(image)
  log.info('%s set custom logo (%s bytes)', ctx.user.name, image.length)

  const prefs = Prefs.get() as unknown as PrefsType
  ctx.body = prefs
  pushPrefsToAdmins(ctx.io)
})

// remove custom logo (admin)
router.delete('/logo', (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  Prefs.clearLogo()
  log.info('%s cleared custom logo', ctx.user.name)

  const prefs = Prefs.get() as unknown as PrefsType
  ctx.body = prefs
  pushPrefsToAdmins(ctx.io)
})

// add a media path
router.post('/path', (ctx) => {
  const dir = decodeURIComponent(ctx.query.dir as string)

  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  // required
  if (!dir) {
    ctx.throw(422, 'Invalid path')
  }

  const pathId = Prefs.addPath(dir, {
    prefs: (ctx.request as unknown as RequestWithBody).body,
  })

  // respond with updated prefs
  const prefs = Prefs.get() as unknown as PrefsType
  ctx.body = prefs

  // (re)start watcher
  process.emit(PREFS_PATHS_CHANGED, prefs.paths)

  ctx.startScanner(pathId)
})

// set media path preferences
router.put('/path/:pathId', (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const pathId = parseInt(ctx.params.pathId, 10)

  if (isNaN(pathId)) {
    ctx.throw(422, 'Invalid pathId')
  }

  Prefs.setPathData(pathId, 'prefs.', (ctx.request as unknown as RequestWithBody).body)

  // respond with updated prefs
  const prefs = Prefs.get() as unknown as PrefsType
  ctx.body = prefs

  // (re)start watcher?
  if ('isWatchingEnabled' in (ctx.request as unknown as RequestWithBody).body) {
    process.emit(PREFS_PATHS_CHANGED, prefs.paths)
  }

  // need to push updated queue items?
  if ('isVideoKeyingEnabled' in (ctx.request as unknown as RequestWithBody).body) {
    for (const { room, roomId } of Rooms.getActive(ctx.io)) {
      ctx.io.to(room).emit('action', {
        type: QUEUE_PUSH,
        payload: Queue.get(roomId),
      })
    }
  }
})

// remove a media path
router.delete('/path/:pathId', (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const pathId = parseInt(ctx.params.pathId, 10)

  if (isNaN(pathId)) {
    ctx.throw(422, 'Invalid pathId')
  }

  ctx.stopScanner()

  Prefs.removePath(pathId)

  // respond with updated prefs
  const prefs = Prefs.get() as unknown as PrefsType
  ctx.body = prefs

  // (re)start watcher
  process.emit(PREFS_PATHS_CHANGED, prefs.paths)

  Media.cleanup()

  pushQueuesAndLibrary(ctx.io)
})

// scan a media path
router.get('/path/:pathId/scan', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const pathId = parseInt(ctx.params.pathId, 10)

  if (isNaN(pathId)) {
    ctx.throw(422, 'Invalid pathId')
  }

  ctx.status = 200
  ctx.startScanner(pathId)
})

// scan all media paths
router.get('/paths/scan', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  ctx.status = 200
  ctx.startScanner(true)
})

// stop scanning
router.get('/paths/scan/stop', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  ctx.status = 200
  ctx.stopScanner()
})

// get folder listing for path browser
router.get('/path/ls', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const dir = decodeURIComponent(ctx.query.dir as string)

  // windows is a special snowflake and gets an
  // extra top level of available drive letters
  if (dir === '' && process.platform === 'win32') {
    const drives = getWindowsDrives()

    ctx.body = {
      current: '',
      parent: false,
      children: drives,
    }
  } else {
    const current = path.resolve(dir)
    const parent = path.resolve(dir, '../')

    const list = await getFolders(dir)
    log.verbose('%s listed path: %s', ctx.user.name, current)

    ctx.body = {
      current,
      // if at root, windows gets a special top level
      parent: parent === current ? (process.platform === 'win32' ? '' : false) : parent,
      children: list.map(p => ({
        path: p,
        label: p.replace(current + path.sep, ''),
      })).filter(c => !(c.label.startsWith('.') || c.label.startsWith('/.'))),
    }
  }
})

export default router
