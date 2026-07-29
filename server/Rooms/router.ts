import KoaRouter from '@koa/router'
import { promisify } from 'util'
import fs from 'fs'
import sql from 'sqlate'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import Rooms, { STATUSES } from '../Rooms/Rooms.js'
import Prefs, { LOGO_MAX_LENGTH, qrWatermarkKey } from '../Prefs/Prefs.js'
import { ValidationError } from '../lib/Errors.js'

interface File {
  filepath: string
  size: number
}

interface RequestWithBody {
  body: Record<string, unknown>
  files?: Record<string, File | File[]>
}

const log = getLogger('Rooms')
const router = new KoaRouter({ prefix: '/api/rooms' })
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

import { ROOM_PREFS_PUSH } from '../../shared/actionTypes.js'

// list rooms
router.get(['/', '/:roomId'], (ctx) => {
  const roomId = ctx.params.roomId ? parseInt(ctx.params.roomId, 10) : undefined
  const status = ctx.user.isAdmin ? STATUSES : undefined
  const res = Rooms.get(roomId, { status })

  res.result.forEach((roomId) => {
    if (ctx.user.isAdmin) {
      const room = ctx.io.sockets.adapter.rooms.get(Rooms.prefix(roomId))
      res.entities[roomId].numUsers = room ? room.size : 0
    } else {
      // only pass the 'roles' prefs key
      res.entities[roomId].prefs = res.entities[roomId].prefs?.roles ? { roles: res.entities[roomId].prefs.roles } : {}
    }
  })

  ctx.body = res
})

// create room
router.post('/', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  try {
    const res = await Rooms.set(undefined, (ctx.request as unknown as RequestWithBody).body)
    log.verbose('%s created a room (roomId: %s)', ctx.user.name, res.lastID)
  } catch (err) {
    if (err instanceof ValidationError) ctx.throw(422, err.message)
    throw err
  }

  // send updated room list
  ctx.body = Rooms.get(null, { status: STATUSES })
})

// update room
router.put('/:roomId', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const roomId = parseInt(ctx.params.roomId, 10)

  try {
    await Rooms.set(roomId, (ctx.request as unknown as RequestWithBody).body)
  } catch (err) {
    if (err instanceof ValidationError) ctx.throw(422, err.message)
    throw err
  }

  log.verbose('%s updated a room (roomId: %s)', ctx.user.name, roomId)

  const sockets = await ctx.io.in(Rooms.prefix(roomId)).fetchSockets()

  for (const s of sockets) {
    if (s?.user.isAdmin) {
      ctx.io.to(s.id).emit('action', {
        type: ROOM_PREFS_PUSH,
        payload: Rooms.get(roomId),
      })
    }
  }

  // send updated room list
  ctx.body = Rooms.get(null, { status: STATUSES })
})

// remove room
router.delete('/:roomId', (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const roomId = parseInt(ctx.params.roomId, 10)

  if (typeof roomId !== 'number') {
    ctx.throw(422, 'Invalid roomId')
  }

  // remove room's queue first
  const queueQuery = sql`
    DELETE FROM queue
    WHERE roomId = ${roomId}
  `
  db.run(String(queueQuery), queueQuery.parameters)

  // remove room
  const roomQuery = sql`
    DELETE FROM rooms
    WHERE roomId = ${roomId}
  `
  db.run(String(roomQuery), roomQuery.parameters)

  log.verbose('%s deleted roomId %s', ctx.user.name, roomId)

  Prefs.clearBrandingImage(qrWatermarkKey(roomId))

  // send updated room list
  ctx.body = Rooms.get(null, { status: STATUSES })
})

// get room QR watermark PNG (public; used by player QR)
router.get('/:roomId/qr-watermark', (ctx) => {
  const roomId = parseInt(ctx.params.roomId, 10)

  if (isNaN(roomId)) {
    ctx.throw(422, 'Invalid roomId')
  }

  const image = Prefs.getBrandingImage(qrWatermarkKey(roomId))

  if (!image) {
    ctx.throw(404)
    return
  }

  if (typeof ctx.query.v !== 'undefined') {
    ctx.set('Cache-Control', 'max-age=31536000') // 1 year
  }

  ctx.type = 'image/png'
  ctx.body = image.image
})

// upload room QR watermark PNG (admin)
router.put('/:roomId/qr-watermark', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const roomId = parseInt(ctx.params.roomId, 10)

  if (isNaN(roomId)) {
    ctx.throw(422, 'Invalid roomId')
  }

  const room = Rooms.get(roomId)
  if (!room.result.length) {
    ctx.throw(404, 'Room not found')
  }

  const req = ctx.request as unknown as RequestWithBody
  const imageUpload = req.files?.image
  const imageFile = Array.isArray(imageUpload) ? imageUpload[0] : imageUpload

  if (!imageFile) {
    ctx.throw(422, 'Image required')
  }

  if (imageFile.size > LOGO_MAX_LENGTH) {
    await deleteFile(imageFile.filepath)
    ctx.throw(413, `Watermark must not exceed ${Math.floor(LOGO_MAX_LENGTH / 1024)}KB`)
  }

  const image = await readFile(imageFile.filepath)
  await deleteFile(imageFile.filepath)

  if (!isPng(image)) {
    ctx.throw(422, 'Watermark must be a PNG image')
  }

  const dateUpdated = Prefs.setBrandingImage(qrWatermarkKey(roomId), image)
  log.info('%s set QR watermark for roomId %s (%s bytes)', ctx.user.name, roomId, image.length)

  const current = room.entities[roomId]
  const prefs = {
    ...current.prefs,
    qr: {
      ...current.prefs?.qr,
      watermark: 'custom',
      watermarkDateUpdated: dateUpdated,
    },
  }

  await Rooms.set(roomId, {
    name: current.name,
    status: current.status,
    prefs,
  })

  pushRoomPrefs(ctx.io, roomId, prefs)

  ctx.body = { watermarkDateUpdated: dateUpdated, prefs }
})

// remove room QR watermark (admin)
router.delete('/:roomId/qr-watermark', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const roomId = parseInt(ctx.params.roomId, 10)

  if (isNaN(roomId)) {
    ctx.throw(422, 'Invalid roomId')
  }

  Prefs.clearBrandingImage(qrWatermarkKey(roomId))
  log.info('%s cleared QR watermark for roomId %s', ctx.user.name, roomId)

  const res = Rooms.get(roomId)
  const current = res.entities[roomId]
  let prefs = null

  if (current) {
    prefs = {
      ...current.prefs,
      qr: {
        ...current.prefs?.qr,
        watermark: 'default',
        watermarkDateUpdated: null,
      },
    }

    await Rooms.set(roomId, {
      name: current.name,
      status: current.status,
      prefs,
    })

    pushRoomPrefs(ctx.io, roomId, prefs)
  }

  ctx.body = { watermarkDateUpdated: null, prefs }
})

export default router

function pushRoomPrefs (io, roomId: number, prefs: unknown) {
  io.to(Rooms.prefix(roomId)).emit('action', {
    type: ROOM_PREFS_PUSH,
    payload: { roomId, prefs },
  })
}
