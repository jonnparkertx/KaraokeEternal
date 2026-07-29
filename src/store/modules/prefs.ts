import { createAction, createAsyncThunk, createReducer } from '@reduxjs/toolkit'
import { RootState } from 'store/store'
import type { Path, Role } from 'shared/types'
import type { Theme } from 'shared/theme'
import { DEFAULT_THEME, normalizeTheme } from 'shared/theme'
import {
  PREFS_RECEIVE,
  PREFS_REQUEST,
  PREFS_SET,
  PREFS_PATH_UPDATE,
  PREFS_PATH_SET_PRIORITY,
  PREFS_PUSH,
  PREFS_REQ_SCANNER_START,
  PREFS_REQ_SCANNER_STOP,
  SCANNER_WORKER_STATUS,
  LOGOUT,
} from 'shared/actionTypes'

import HttpApi from 'lib/HttpApi'
const api = new HttpApi('prefs')

// ------------------------------------
// Actions
// ------------------------------------
const logout = createAction(LOGOUT)
export const setPref = createAction<{ key: string, data: unknown }>(PREFS_SET)
export const receivePrefs = createAction<object>(PREFS_RECEIVE)
export const setPathPriority = createAction<number[]>(PREFS_PATH_SET_PRIORITY)
const prefsPush = createAction<PrefsState>(PREFS_PUSH)
const scannerWorkerStatus = createAction<{ isScanning: boolean, pct: number, text: string }>(SCANNER_WORKER_STATUS)

export const setPathPrefs = createAsyncThunk(
  PREFS_PATH_UPDATE,
  async ({
    pathId,
    data,
  }: {
    pathId: number
    data: FormData
  }, thunkAPI) => {
    const response = await api.put(`/path/${pathId}`, {
      body: data,
    })

    thunkAPI.dispatch(receivePrefs(response))
  },
)

export const fetchPrefs = createAsyncThunk<object, void, { state: RootState }>(
  PREFS_REQUEST,
  async (_, thunkAPI) => {
    const response = await api.get('')

    // sign out if we see isFirstRun flag
    if (response.isFirstRun && thunkAPI.getState().user.userId !== null) {
      thunkAPI.dispatch(logout())
    }

    return response
  },
)

export const requestScan = createAsyncThunk(
  PREFS_REQ_SCANNER_START,
  async (pathId: number) => await api.get(`/path/${pathId}/scan`),
)

export const requestScanAll = createAsyncThunk(
  PREFS_REQ_SCANNER_START,
  async () => await api.get('/paths/scan'),
)

export const requestScanStop = createAsyncThunk(
  PREFS_REQ_SCANNER_STOP,
  async () => await api.get('/paths/scan/stop'),
)

export const uploadLogo = createAsyncThunk(
  'prefs/UPLOAD_LOGO',
  async (blob: Blob, thunkAPI) => {
    const data = new FormData()
    data.append('image', blob, 'logo.png')

    const response = await api.put('/logo', {
      body: data,
    })

    thunkAPI.dispatch(receivePrefs(response))
  },
)

export const clearLogo = createAsyncThunk(
  'prefs/CLEAR_LOGO',
  async (_, thunkAPI) => {
    const response = await api.delete('/logo')
    thunkAPI.dispatch(receivePrefs(response))
  },
)

export const setTheme = createAsyncThunk(
  'prefs/SET_THEME',
  async (theme: Theme, thunkAPI) => {
    const next = normalizeTheme(theme)
    // optimistic local update for live preview
    thunkAPI.dispatch(receivePrefs({ theme: next }))
    thunkAPI.dispatch(setPref({ key: 'theme', data: next }))
  },
)

// ------------------------------------
// Reducer
// ------------------------------------
interface PrefsState {
  isFirstRun?: boolean
  isScanning: boolean
  isReplayGainEnabled: boolean
  logoDateUpdated: number | null
  theme: Theme
  paths: {
    result: number[]
    entities: Record<number, Path>
  }
  roles: {
    result: number[]
    entities: Record<number, Role>
  }
  scannerPct: number
  scannerText: string
}

const initialState: PrefsState = {
  isScanning: false,
  isReplayGainEnabled: false,
  logoDateUpdated: null,
  theme: { ...DEFAULT_THEME },
  paths: {
    result: [],
    entities: {},
  },
  roles: {
    result: [],
    entities: {},
  },
  scannerPct: 0,
  scannerText: '',
}

function mergePrefs (state: PrefsState, payload: object): PrefsState {
  const next = {
    ...state,
    ...payload,
  }

  if ('theme' in (payload as PrefsState) || !next.theme) {
    next.theme = normalizeTheme((payload as PrefsState).theme ?? next.theme)
  }

  return next
}

const prefsReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchPrefs.fulfilled, (state, { payload }) => mergePrefs(state, payload))
    .addCase(receivePrefs, (state, { payload }) => mergePrefs(state, payload))
    .addCase(prefsPush, (state, { payload }) => mergePrefs(state, payload))
    .addCase(scannerWorkerStatus, (state, { payload }) => ({
      ...state,
      isScanning: payload.isScanning,
      scannerPct: payload.pct,
      scannerText: payload.text,
    }))
})

export default prefsReducer
