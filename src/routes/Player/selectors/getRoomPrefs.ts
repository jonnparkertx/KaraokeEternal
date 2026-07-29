import { RootState } from 'store/store'
import { createSelector } from '@reduxjs/toolkit'
import { DEFAULT_ROOM_PREFS } from 'shared/roomPrefs'

const getRoomId = (state: RootState) => state.user.roomId
const getRooms = (state: RootState) => state.rooms.entities

const getRoomPrefs = createSelector(
  [getRoomId, getRooms],
  (roomId, rooms) => {
    if (typeof roomId !== 'number'
      || !rooms[roomId]
      || !rooms[roomId].prefs
    ) {
      return DEFAULT_ROOM_PREFS
    }

    const prefs = rooms[roomId]?.prefs

    return {
      ...DEFAULT_ROOM_PREFS,
      ...prefs,
      qr: {
        ...DEFAULT_ROOM_PREFS.qr,
        ...prefs?.qr,
      },
      idle: {
        ...DEFAULT_ROOM_PREFS.idle,
        ...prefs?.idle,
      },
    }
  })

export default getRoomPrefs
