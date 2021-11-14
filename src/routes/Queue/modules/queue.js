import {
  LOGOUT,
  QUEUE_ADD,
  QUEUE_PUSH,
  QUEUE_REMOVE,
  _SUCCESS,
} from 'shared/actionTypes'

// add to queue
export function queueSong (songId) {
  return (dispatch, getState) => {
    dispatch({
      type: QUEUE_ADD,
      meta: { isOptimistic: true },
      payload: { songId },
    })
  }
}

// remove from queue
export function removeItem (queueId) {
  return {
    type: QUEUE_REMOVE,
    meta: { isOptimistic: true },
    payload: { queueId },
  }
}

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [LOGOUT + _SUCCESS]: (state, { payload }) => ({
    result: [],
    entities: {},
  }),
  [QUEUE_ADD]: (state, { payload }) => {
    // optimistic
    const nextQueueId = state.result.length ? state.result[state.result.length - 1] + 1 : 1

    return {
      ...state,
      result: [...state.result, nextQueueId],
      entities: {
        ...state.entities,
        [nextQueueId]: {
          ...payload,
          queueId: nextQueueId,
          prevQueueId: nextQueueId - 1 || null,
          isOptimistic: true
        },
      }
    }
  },
  [QUEUE_REMOVE]: (state, { payload }) => {
    // optimistic
    const result = state.result.slice()
    result.splice(result.indexOf(payload.queueId), 1)

    return {
      ...state,
      result,
    }
  },
  [QUEUE_PUSH]: (state, { payload }) => ({
    isLoading: false,
    result: payload.result,
    entities: payload.entities,
  }),
}

// ------------------------------------
// Reducer
// ------------------------------------
const initialState = {
  isLoading: true,
  result: [], // queueIds
  entities: {}, // keyed by queueId
}

export default function queueReducer (state = initialState, action) {
  const handler = ACTION_HANDLERS[action.type]

  return handler ? handler(state, action) : state
}
