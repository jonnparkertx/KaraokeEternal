import Rooms from '../Rooms/Rooms.js'
import Media from '../Media/Media.js'
import Queue from '../Queue/Queue.js'
import User from '../User/User.js'

import {
  PLAYER_CMD_NEXT,
  PLAYER_CMD_OPTIONS,
  PLAYER_CMD_PAUSE,
  PLAYER_CMD_PLAY,
  PLAYER_CMD_REPLAY,
  PLAYER_CMD_VOLUME,
  PLAYER_CMD_COMMENT,
  PLAYER_CMD_PLAY_MEDIA,
  PLAYER_REQ_NEXT,
  PLAYER_REQ_OPTIONS,
  PLAYER_REQ_PAUSE,
  PLAYER_REQ_PLAY,
  PLAYER_REQ_REPLAY,
  PLAYER_REQ_VOLUME,
  PLAYER_REQ_COMMENT,
  PLAYER_REQ_PLAY_MEDIA,
  PLAYER_EMIT_STATUS,
  PLAYER_EMIT_LEAVE,
  PLAYER_STATUS,
  PLAYER_LEAVE,
} from '../../shared/actionTypes.js'

const COMMENT_MAX_LENGTH = 100
const COMMENT_COOLDOWN_MS = 3000
const lastCommentAt = new Map()

function getRoomPlayerStatus (sock) {
  if (sock._lastPlayerStatus) return sock._lastPlayerStatus

  for (const peer of sock.server.sockets.sockets.values()) {
    if (peer.user?.roomId === sock.user.roomId && peer._lastPlayerStatus) {
      return peer._lastPlayerStatus
    }
  }

  return null
}

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [PLAYER_REQ_OPTIONS]: (sock, { payload }) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_OPTIONS,
      payload,
    })
  },
  [PLAYER_REQ_NEXT]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_NEXT,
    })
  },
  [PLAYER_REQ_PAUSE]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_PAUSE,
    })
  },
  [PLAYER_REQ_PLAY]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_PLAY,
    })
  },
  [PLAYER_REQ_REPLAY]: (sock, { payload }) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_REPLAY,
      payload,
    })
  },
  [PLAYER_REQ_VOLUME]: (sock, { payload }) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_VOLUME,
      payload,
    })
  },
  [PLAYER_REQ_PLAY_MEDIA]: (sock, { payload }, acknowledge) => {
    if (!sock.user?.isAdmin || typeof sock.user?.roomId !== 'number') {
      acknowledge?.({
        type: PLAYER_REQ_PLAY_MEDIA + '_ERROR',
        error: 'Unauthorized',
      })
      return
    }

    const mediaId = typeof payload?.mediaId === 'number' ? payload.mediaId : NaN
    const fromStart = !!payload?.fromStart
    const mediaType = payload?.mediaType === 'mp4' || payload?.mediaType === 'cdg'
      ? payload.mediaType
      : null

    if (!Number.isInteger(mediaId) || !mediaType) {
      acknowledge?.({
        type: PLAYER_REQ_PLAY_MEDIA + '_ERROR',
        error: 'Invalid media',
      })
      return
    }

    const mediaRes = Media.search({ mediaId })
    if (!mediaRes.result.length) {
      acknowledge?.({
        type: PLAYER_REQ_PLAY_MEDIA + '_ERROR',
        error: 'Media not found',
      })
      return
    }

    const media = mediaRes.entities[mediaId]
    const lastStatus = getRoomPlayerStatus(sock)

    // best-effort: ensure media belongs to the currently playing song
    if (lastStatus && typeof lastStatus.queueId === 'number' && lastStatus.queueId !== -1) {
      const queueItem = Queue.get(sock.user.roomId).entities[lastStatus.queueId]
      if (queueItem && queueItem.songId !== media.songId) {
        acknowledge?.({
          type: PLAYER_REQ_PLAY_MEDIA + '_ERROR',
          error: 'Media does not belong to the currently playing song',
        })
        return
      }
    }

    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_PLAY_MEDIA,
      payload: {
        mediaId,
        mediaType,
        fromStart,
        rgTrackGain: typeof media.rgTrackGain === 'number' ? media.rgTrackGain : null,
        rgTrackPeak: typeof media.rgTrackPeak === 'number' ? media.rgTrackPeak : null,
      },
    })
  },
  [PLAYER_REQ_COMMENT]: (sock, { payload }, acknowledge) => {
    if (typeof sock.user?.roomId !== 'number' || typeof sock.user?.userId !== 'number') {
      acknowledge?.({
        type: PLAYER_REQ_COMMENT + '_ERROR',
        error: 'Unauthorized',
      })
      return
    }

    const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
    const queueId = typeof payload?.queueId === 'number' ? payload.queueId : NaN

    if (!text || text.length > COMMENT_MAX_LENGTH || !Number.isFinite(queueId)) {
      acknowledge?.({
        type: PLAYER_REQ_COMMENT + '_ERROR',
        error: 'Invalid comment',
      })
      return
    }

    const now = Date.now()
    const last = lastCommentAt.get(sock.user.userId) ?? 0
    if (now - last < COMMENT_COOLDOWN_MS) {
      acknowledge?.({
        type: PLAYER_REQ_COMMENT + '_ERROR',
        error: 'Please wait a moment before commenting again',
      })
      return
    }

    lastCommentAt.set(sock.user.userId, now)

    // Prefer live user row — sock.user is from the JWT at connect time and can
    // be stale after a profile photo / name update without reconnecting.
    const dbUser = User.getById(sock.user.userId)

    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_COMMENT,
      payload: {
        text: text.slice(0, COMMENT_MAX_LENGTH),
        queueId,
        userId: sock.user.userId,
        userDisplayName: (dbUser && dbUser.name) || sock.user.name,
        userDateUpdated: (dbUser && dbUser.dateUpdated) || sock.user.dateUpdated,
        id: now * 1000 + (sock.user.userId % 1000),
      },
    })
  },
  [PLAYER_EMIT_STATUS]: (sock, { payload }) => {
    // so we can tell the room when players leave and
    // relay last known player status on client join
    sock._lastPlayerStatus = payload

    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_STATUS,
      payload,
    })
  },
  [PLAYER_EMIT_LEAVE]: (sock) => {
    sock._lastPlayerStatus = null

    // any players left in room?
    if (!Rooms.isPlayerPresent(sock.server, sock.user.roomId)) {
      sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
        type: PLAYER_LEAVE,
        payload: { socketId: sock.id },
      })
    }
  },
}

export default ACTION_HANDLERS
