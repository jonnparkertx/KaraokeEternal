# Queue Song Info: Corrupted CDG & Play This Version Now

## Goal

Extend the admin Song Info panel (swipe left → `(i)` on a queue item) with two actions that are available **only while that song is the currently playing queue item** (`status.isPlaying` and the current queue item’s `songId` matches Song Info’s `songId`):

1. **Corrupted CDG** — mark a specific media file so it is never chosen for playback again.
2. **Play this version now** — temporarily swap the media file for the currently playing queue item, without changing Preferred (or any other persistent song preference).

## Current behavior (baseline)

- Song Info UI: `src/components/SongInfo/SongInfo.tsx` (mounted from `CoreLayout`).
- Prefer API: `PUT|DELETE /api/media/:mediaId/prefer` → `Media.setPreferred` → `QUEUE_PUSH` + `LIBRARY_PUSH_SONG`.
- Queue resolves `mediaId` in `Queue.get` via `MAX(isPreferred)` over joined `media` rows (queue stores `songId` only).
- Players reload media only when `mediaKey` (`queueId`) changes; changing preferred mid-play does **not** hot-swap.

## Feature 1: Corrupted CDG

### Database

Add migration `server/lib/schemas/007-media-corrupted-cdg.sql`:

```sql
-- Up
ALTER TABLE "media" ADD COLUMN "isCorruptedCdg" INTEGER(1) NOT NULL DEFAULT 0;

-- Down
ALTER TABLE "media" DROP COLUMN "isCorruptedCdg";
```

### Server

- `Media.setCorruptedCdg(mediaId, isCorruptedCdg): songId`
  - Validate media exists; set `isCorruptedCdg` to `0`/`1`.
  - If marking corrupted and the row is preferred, clear `isPreferred` on that row (so selection can fall through to another file).
- HTTP: admin-only `PUT|DELETE /api/media/:mediaId/corrupted` (mirror prefer router pattern).
  - Fan out `QUEUE_PUSH` to active rooms + `LIBRARY_PUSH_SONG`.
- Playback selection must skip corrupted media:
  - `Queue.get`: exclude `media.isCorruptedCdg != 0` from the join (or equivalent `WHERE`).
  - Fallback: if a song has **only** corrupted media, still allow selecting a row so the queue item is not silently empty (prefer preferred, else first by path priority). Implement as: try non-corrupted first; if none, select from all.
  - `Library.getSong`: ignore corrupted rows when choosing duration/`numMedia` source when any non-corrupted media exists.

### Client / types

- `shared/types.ts` `Media`: add `isCorruptedCdg?: boolean` (also returned by existing `GET /api/song/:songId` via `Media.search`).
- `songInfo` module: `setCorruptedCdg` thunk → `PUT`/`DELETE` `media/${mediaId}/corrupted`, then refresh Song Info.
- Song Info UI per media row:
  - Show `Corrupted CDG: Yes/No` with toggle link/button.
  - Confirm with `window.confirm(...)` before marking as corrupted (prevent accidents). Unmarking can be direct or also confirmed lightly — confirm only for mark-as-corrupted.
  - Controls only rendered when **this song is currently playing** (see Visibility gate).

## Feature 2: Play this version now

Temporary only — does **not** call prefer APIs or write queue preference state.

### Protocol

New room player command (admin requester → player clients), matching existing REQ/CMD pattern:

- `PLAYER_REQ_PLAY_MEDIA` / `PLAYER_CMD_PLAY_MEDIA`
- Payload: `{ mediaId: number, fromStart: boolean }`

Server (`server/Player/socket.ts`):

- Require admin (`sock.user.isAdmin`); reject otherwise.
- Validate `mediaId` exists and belongs to the song for the room’s last-known playing `queueId` when available (best-effort using `sock._lastPlayerStatus` + `Queue.get` + `Media.search`). Still emit to players if queue status is incomplete but media is valid, and let the player ignore if it doesn’t match the current item.
- Emit `PLAYER_CMD_PLAY_MEDIA` to the room.

### Player state / reload

In `src/routes/Player/modules/player.ts`:

- Add private fields:
  - `_mediaIdOverride: number | null`
  - `_mediaTypeOverride: MediaType | null`
  - `_rgTrackGainOverride` / `_rgTrackPeakOverride` (optional; null if unknown)
  - `_seekAfterLoad: number | null` (seconds; `0` for start, current position when continuing)
- On `PLAYER_CMD_PLAY_MEDIA`:
  - Resolve media type from extension (or include `mediaType` in payload from Song Info client to avoid guessing).
  - Prefer sending `{ mediaId, mediaType, rgTrackGain?, rgTrackPeak?, fromStart }` from the client (Song Info already has the media entity + queue has RG fields only for selected media — send what we know; RG may be null).
  - Set overrides; set `_seekAfterLoad` to `0` or current `position`.
- Clear overrides when `queueId` changes (advance / replay different item / next).

`PlayerController`:

- Effective media: `_mediaIdOverride ?? queueItem.mediaId` (same for type / RG).
- Change `mediaKey` to include media id, e.g. `${queueId}:${mediaId}`, so CDG/MP4 remount/reload when version swaps.
- Pass `startPosition={player._seekAfterLoad}` (or similar) into `Player` → CDG/MP4; after load, seek then clear `_seekAfterLoad`.

CDGPlayer / MP4Player / MP4AlphaPlayer:

- On source update / `canplay`, if `startPosition` is a finite number, set `currentTime` then notify status.
- Keep existing `mediaReplayKey` seek-to-zero behavior.

### Client request path

- `status.ts`: `requestPlayMedia({ mediaId, mediaType, fromStart, ... })` → `PLAYER_REQ_PLAY_MEDIA`.
- Song Info button **Play this version now**:
  - Visibility gate (below).
  - Confirmation: ask whether to play from **current position** or **beginning**.
    - Use two-step `confirm` is awkward; prefer a small inline choice or sequential confirms:
      1. `confirm('Play this version now?')`
      2. If OK: `confirm('OK = from current position, Cancel = start from beginning')` **or** a tiny Modal with two buttons (“Current position” / “From beginning”) + Cancel.
    - Prefer a Modal with three actions for clarity (Current position / From beginning / Cancel), matching existing Modal usage in Song Info.

## Visibility gate

In `SongInfo.tsx`:

```ts
const status = useAppSelector(s => s.status)
const queue = useAppSelector(getRoundRobinQueue) // or queue entities
const current = queue.entities[status.queueId]
const canUsePlaybackActions =
  status.isPlaying &&
  !!current &&
  current.songId === songId &&
  !status.isAtQueueEnd
```

Show **Corrupted CDG** controls and **Play this version now** only when `canUsePlaybackActions` is true. Prefer / Unprefer remain available as today (admin Song Info anytime).

Also hide “Play this version now” when the selected media is already the effective playing media (`current.mediaId === mediaId` and no override conflict — optional polish).

## Action types / shared

Add to `shared/actionTypes.ts`:

- `PLAYER_REQ_PLAY_MEDIA`, `PLAYER_CMD_PLAY_MEDIA`
- `SONG_INFO_SET_CORRUPTED` (for thunk type string)

## File checklist

| Area | Files |
|------|--------|
| Migration | `server/lib/schemas/007-media-corrupted-cdg.sql` |
| Media API/model | `server/Media/Media.ts`, `server/Media/router.ts` |
| Selection | `server/Queue/Queue.ts`, `server/Library/Library.ts` |
| Player socket | `server/Player/socket.ts` |
| Types / actions | `shared/types.ts`, `shared/actionTypes.ts` |
| Song Info UI | `src/components/SongInfo/SongInfo.tsx`, `SongInfo.css` (if needed) |
| Redux | `src/store/modules/songInfo.ts`, `src/store/modules/status.ts` |
| Player | `src/routes/Player/modules/player.ts`, `PlayerController.tsx`, `Player.tsx`, `CDGPlayer.tsx`, `MP4Player.tsx`, `MP4AlphaPlayer.tsx` |

## Test plan

1. Migration applies cleanly on existing DB; Song Info still lists media.
2. While song A is playing, open Song Info for A → both new controls visible; for a queued/not-playing song → controls hidden.
3. Mark media as Corrupted CDG → confirm cancels safely; confirm OK persists flag; after next `QUEUE_PUSH`, that file is not selected when alternatives exist; Preferred cleared if it was preferred.
4. Unmark corrupted → file eligible again.
5. Play this version now → modal choices:
   - From beginning: new media loads at `0`.
   - Current position: new media loads and seeks near previous position.
6. Preferred flag unchanged after play-this-version.
7. Advancing to next queue item clears media override; new item uses normal selection.
8. Non-admin cannot hit corrupted / play-media endpoints or socket handlers.

## Out of scope

- Auto-detecting CDG corruption in the scanner.
- Permanently pinning a queue row to a mediaId.
- Changing Prefer behavior or Library swipe Song Info beyond the shared Song Info component (Library gets the same gate: actions only when that song is currently playing).
