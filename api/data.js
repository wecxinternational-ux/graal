const { db, parseJSON } = require('./_auth');

module.exports = (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  const items = db.prepare('SELECT * FROM items ORDER BY id DESC').all().map(i => ({...i, awardedTo: parseJSON(i.awardedTo, [])}));
  const notes = db.prepare('SELECT * FROM notes ORDER BY id DESC').all().map(n => ({
    ...n,
    tags: parseJSON(n.tags, []),
    atts: parseJSON(n.atts, []),
    comments: parseJSON(n.comments, []),
    isPublic: !!n.isPublic
  }));
  const guides = db.prepare('SELECT * FROM guides ORDER BY id DESC').all().map(g => ({
    ...g,
    tags: parseJSON(g.tags, []),
    atts: parseJSON(g.atts, []),
    comments: parseJSON(g.comments, [])
  }));
  const players = db.prepare('SELECT * FROM players ORDER BY id DESC').all().map(p => ({...p, chars: parseJSON(p.chars, [])}));
  const logs = db.prepare('SELECT * FROM logs ORDER BY id DESC').all().map(l => ({...l, meta: parseJSON(l.meta, {})}));
  const factions = db.prepare('SELECT * FROM factions').all();
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY id DESC').all();

  res.json({ items, notes, guides, players, logs, factions, transactions });
};
