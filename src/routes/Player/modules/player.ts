import { createAction, createReducer } from '@reduxjs/toolkit'
import { AppThunk } from 'store/store'
import { CANCEL } from 'redux-throttle'
import getWebGLSupport from 'lib/getWebGLSupport'
import {
  PLAYER_CMD_NEXT,
  PLAYER_CMD_OPTIONS,
  PLAYER_CMD_PAUSE,
  PLAYER_CMD_PLAY,
  PLAYER_CMD_REPLAY,
  PLAYER_CMD_VOLUME,
  PLAYER_CMD_COMMENT,
  PLAYER_CMD_PLAY_MEDIA,
  PLAYER_EMIT_LEAVE,
  PLAYER_EMIT_STATUS,
  PLAYER_ERROR,
  PLAYER_LOAD,
  PLAYER_PLAY,
  PLAYER_UPDATE,
  REDUX_SLICE_INJECT_NOOP,
} from 'shared/actionTypes'
import type { MediaType } from 'shared/types'

// internal use
export const playerUpdate = createAction<object>(PLAYER_UPDATE)

// triggered by media events
export const playerError = createAction<string>(PLAYER_ERROR)
export const playerLoad = createAction(PLAYER_LOAD)
export const playerPlay = createAction(PLAYER_PLAY)
export const playerCmdNext = createAction(PLAYER_CMD_NEXT)

// triggered by clients
const playerCmdPause = createAction(PLAYER_CMD_PAUSE)
const playerCmdPlay = createAction(PLAYER_CMD_PLAY)
const playerCmdReplay = createAction<{ queueId: number }>(PLAYER_CMD_REPLAY)
const playerCmdVolume = createAction<number>(PLAYER_CMD_VOLUME)
const playerCmdOptions = createAction<{
  cdgAlpha: number
  cdgSize: number
  mp4Alpha: number
}>(PLAYER_CMD_OPTIONS)

export interface SongComment {
  text: string
  queueId: number
  userId: number
  userDisplayName: string
  userDateUpdated: number
  id: number
}

const playerCmdComment = createAction<SongComment>(PLAYER_CMD_COMMENT)
const playerCmdPlayMedia = createAction<{
  mediaId: number
  mediaType: MediaType
  fromStart: boolean
  rgTrackGain: number | null
  rgTrackPeak: number | null
}>(PLAYER_CMD_PLAY_MEDIA)

// ------------------------------------
// Actions for emitting to room
// ------------------------------------
export function playerStatus (status: Partial<PlayerState> = {}, deferEmit = false): AppThunk {
  return (dispatch, getState) => {
    const { player, playerVisualizer } = getState()

    // update "internal" state (player slice); status is partial
    dispatch(playerUpdate(status))

    // emit full updated status (excluding "private" properties)
    const emitStatus = Object.fromEntries(
      Object.entries({
        ...player, // previous complete state
        ...status, // current partial state
      }).filter(([key]) => !key.startsWith('_')),
    )

    dispatch({
      type: PLAYER_EMIT_STATUS,
      payload: {
        ...emitStatus,
        visualizer: playerVisualizer,
      },
      meta: {
        throttle: {
          wait: 1000,
          leading: !deferEmit,
        },
      },
    })
  }
}

// cancel any throttled/queued status emits
export function playerStatusCancel () {
  return {
    type: CANCEL,
    payload: {
      type: PLAYER_EMIT_STATUS,
    },
  }
}

export function playerLeave (): AppThunk {
  return (dispatch) => {
    dispatch(playerStatusCancel())
    dispatch({
      type: PLAYER_EMIT_LEAVE,
    })
  }
}

// ------------------------------------
// Reducer
// ------------------------------------
export interface PlayerState {
  cdgAlpha: number
  cdgSize: number
  errorMessage: string
  historyJSON: string
  isAtQueueEnd: boolean
  isErrored: boolean
  isPlaying: boolean
  isVideoKeyingEnabled: boolean
  isWebGLSupported: boolean
  mediaId: number | null
  mediaType: string | null
  mp4Alpha: number
  nextUserId: number | null
  position: number
  queueId: number
  rgTrackGain: number | null
  rgTrackPeak: number | null
  volume: number
  _isFetching: boolean
  _isPlayingNext: boolean
  _isReplayingQueueId: number | null
  _lastReplayTime: number
  _mediaIdOverride: number | null
  _mediaTypeOverride: MediaType | null
  _rgTrackGainOverride: number | null
  _rgTrackPeakOverride: number | null
  _seekAfterLoad: number | null
  _songComments: SongComment[]
}

const initialState: PlayerState = {
  cdgAlpha: 1,
  cdgSize: 1,
  errorMessage: '',
  historyJSON: '[]', // queueIds (JSON string is hack to pass selector equality check on clients)
  isAtQueueEnd: false,
  isErrored: false,
  isPlaying: false,
  isVideoKeyingEnabled: false,
  isWebGLSupported: getWebGLSupport(),
  mediaId: null,
  mediaType: null,
  mp4Alpha: 0.5,
  nextUserId: null,
  position: 0,
  queueId: -1,
  rgTrackGain: null,
  rgTrackPeak: null,
  volume: 1,
  // "private" internal state that shouldn't be emitted
  _isFetching: false,
  _isPlayingNext: false,
  _isReplayingQueueId: null,
  _lastReplayTime: 0,
  _mediaIdOverride: null,
  _mediaTypeOverride: null,
  _rgTrackGainOverride: null,
  _rgTrackPeakOverride: null,
  _seekAfterLoad: null,
  _songComments: [],
}

const playerReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(playerCmdNext, (state) => {
      state._isPlayingNext = true
    })
    .addCase(playerCmdOptions, (state, { payload }) => ({
      ...state,
      cdgAlpha: typeof payload.cdgAlpha === 'number' ? payload.cdgAlpha : state.cdgAlpha,
      cdgSize: typeof payload.cdgSize === 'number' ? payload.cdgSize : state.cdgSize,
      mp4Alpha: typeof payload.mp4Alpha === 'number' ? payload.mp4Alpha : state.mp4Alpha,
    }))
    .addCase(playerCmdPause, (state) => {
      state.isPlaying = false
    })
    .addCase(playerCmdPlay, (state) => {
      state.isPlaying = true
    })
    .addCase(playerCmdReplay, (state, { payload }) => {
      state._isReplayingQueueId = payload.queueId
      state._lastReplayTime = Date.now()
    })
    .addCase(playerCmdPlayMedia, (state, { payload }) => {
      if (state.queueId === -1 || state.isAtQueueEnd) return

      state._mediaIdOverride = payload.mediaId
      state._mediaTypeOverride = payload.mediaType
      state._rgTrackGainOverride = payload.rgTrackGain
      state._rgTrackPeakOverride = payload.rgTrackPeak
      state._seekAfterLoad = payload.fromStart ? 0 : state.position
      state.isPlaying = true
      state.isErrored = false
      state.errorMessage = ''
      state.mediaId = payload.mediaId
      state.mediaType = payload.mediaType
    })
    .addCase(playerCmdVolume, (state, { payload }) => {
      state.volume = payload
    })
    .addCase(playerCmdComment, (state, { payload }) => {
      // only show comments aimed at the currently playing queue item
      if (payload.queueId === state.queueId && !state.isAtQueueEnd) {
        state._songComments.push(payload)
      }
    })
    .addCase(playerError, (state, { payload }) => ({
      ...state,
      errorMessage: payload,
      isErrored: true,
      isPlaying: false,
      _isFetching: false,
    }))
    .addCase(playerLoad, state => ({
      ...state,
      errorMessage: '',
      isErrored: false,
      _isFetching: true,
      _songComments: [],
    }))
    .addCase(playerPlay, (state) => {
      state._isFetching = false
    })
    .addCase(playerUpdate, (state, { payload }) => {
      const update = payload as Partial<PlayerState>
      const next = {
        ...state,
        ...update,
      }

      // clear comments and media override when the queue item changes
      if (typeof update.queueId === 'number' && update.queueId !== state.queueId) {
        next._songComments = []
        next._mediaIdOverride = null
        next._mediaTypeOverride = null
        next._rgTrackGainOverride = null
        next._rgTrackPeakOverride = null
        next._seekAfterLoad = null
      }

      return next
    })
})

export default playerReducer

declare module 'store/reducers' {
  export interface LazyLoadedSlices {
    player: typeof initialState
  }
}

export const sliceInjectNoOp = createAction(REDUX_SLICE_INJECT_NOOP)
