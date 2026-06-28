const { db, parseJSON, ensureInit } = require('./_auth');

module.exports = async (req, res) => {
  await ensureInit();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  const items = (await db.execute('SELECT * FROM items ORDER BY id DESC')).rows
    .map(i => ({...i, awardedTo: parseJSON(i.awardedTo, [])}));
  const notes = (await db.execute('SELECT * FROM notes ORDER BY id DESC')).rows
    .map(n => ({
      ...n,
      tags: parseJSON(n.tags, []),
      atts: parseJSON(n.atts, []),
      comments: parseJSON(n.comments, []),
      isPublic: !!n.isPublic
    }));
  const guides = (await db.execute('SELECT * FROM guides ORDER BY id DESC')).rows
    .map(g => ({
      ...g,
      tags: parseJSON(g.tags, []),
      atts: parseJSON(g.atts, []),
      comments: parseJSON(g.comments, [])
    }));
  const players = (await db.execute('SELECT * FROM players ORDER BY id DESC')).rows
    .map(p => ({...p, chars: parseJSON(p.chars, [])}));
  const logs = (await db.execute('SELECT * FROM logs ORDER BY id DESC')).rows
    .map(l => ({...l, meta: parseJSON(l.meta, {})}));
  const factions = (await db.execute('SELECT * FROM factions')).rows;
  const transactions = (await db.execute('SELECT * FROM transactions ORDER BY id DESC')).rows;

  res.json({ items, notes, guides, players, logs, factions, transactions });
};
