import Rooms from '../Rooms/Rooms.js'

import {
  PLAYER_CMD_NEXT,
  PLAYER_CMD_OPTIONS,
  PLAYER_CMD_PAUSE,
  PLAYER_CMD_PLAY,
  PLAYER_CMD_REPLAY,
  PLAYER_CMD_VOLUME,
  PLAYER_CMD_COMMENT,
  PLAYER_REQ_NEXT,
  PLAYER_REQ_OPTIONS,
  PLAYER_REQ_PAUSE,
  PLAYER_REQ_PLAY,
  PLAYER_REQ_REPLAY,
  PLAYER_REQ_VOLUME,
  PLAYER_REQ_COMMENT,
  PLAYER_EMIT_STATUS,
  PLAYER_EMIT_LEAVE,
  PLAYER_STATUS,
  PLAYER_LEAVE,
} from '../../shared/actionTypes.js'

const COMMENT_MAX_LENGTH = 100
const COMMENT_COOLDOWN_MS = 3000
const lastCommentAt = new Map()

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

    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_COMMENT,
      payload: {
        text: text.slice(0, COMMENT_MAX_LENGTH),
        queueId,
        userId: sock.user.userId,
        userDisplayName: sock.user.name,
        userDateUpdated: sock.user.dateUpdated,
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
