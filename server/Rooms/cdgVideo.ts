import fs from 'fs'
import path from 'path'
import { db } from '../lib/Database.js'

/** Looping lyric-backdrop clips. Kept off the branding blob table so they can be streamed. */
export const CDG_VIDEO_MAX_BYTES = 32 * 1024 * 1024

const ALLOWED = new Map([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.mov', 'video/quicktime'],
])

function directory (): string {
  return path.join(path.dirname(db.config.filename), 'cdg-video')
}

export function extensionFor (filename: string): string | null {
  const ext = path.extname(filename).toLowerCase()
  return ALLOWED.has(ext) ? ext : null
}

export function cdgVideoFile (roomId: number): { file: string, mimeType: string } | null {
  let names: string[]
  try {
    names = fs.readdirSync(directory())
  } catch {
    return null
  }

  const name = names.find(entry => entry.startsWith(`${roomId}.`))
  if (!name) return null

  const mimeType = ALLOWED.get(path.extname(name).toLowerCase())
  if (!mimeType) return null

  return { file: path.join(directory(), name), mimeType }
}

export function clearCdgVideo (roomId: number): void {
  const existing = cdgVideoFile(roomId)
  if (!existing) return
  try {
    fs.unlinkSync(existing.file)
  } catch {
    // Already removed.
  }
}

export function isQuickTimeContainer (header: Buffer): boolean {
  return header.length >= 12 && header.subarray(4, 8).toString('ascii') === 'ftyp'
}

export async function readFileHeader (file: string): Promise<Buffer> {
  const handle = await fs.promises.open(file, 'r')
  try {
    const header = Buffer.alloc(12)
    await handle.read(header, 0, 12, 0)
    return header
  } finally {
    await handle.close()
  }
}

export async function saveCdgVideo (roomId: number, tmpPath: string, ext: string): Promise<void> {
  const destDir = directory()
  await fs.promises.mkdir(destDir, { recursive: true })
  clearCdgVideo(roomId)
  await fs.promises.copyFile(tmpPath, path.join(destDir, `${roomId}${ext}`))
}
