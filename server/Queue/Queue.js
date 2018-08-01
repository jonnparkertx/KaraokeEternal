const db = require('sqlite')
const squel = require('squel')
const path = require('path')

class Queue {
  /**
   * Get queued items for a given room
   *
   * @param  {Number}  roomId
   * @return {Promise}
   */
  static async getQueue (roomId) {
    const result = []
    const entities = {}

    const q = squel.select()
      .field('queueId, mediaId, userId')
      .field('media.relPath, media.duration')
      .field('artists.name AS artist')
      .field('songs.songId, songs.title')
      .field('users.name AS userDisplayName')
      .from('queue')
      .join('users USING(userId)')
      .join('media USING(mediaId)')
      .join('songs USING (songId)')
      .join('artists USING (artistId)')
      .where('roomId = ?', roomId)
      .order('queueId')

    const { text, values } = q.toParam()
    const rows = await db.all(text, values)

    for (const row of rows) {
      // determine player component
      const ext = path.extname(row.relPath).substr(1).toUpperCase()
      row.player = `${ext}Player`
      delete row.relPath

      // normalize
      result.push(row.queueId)
      entities[row.queueId] = row
    }

    return { result, entities }
  }
}

module.exports = Queue
