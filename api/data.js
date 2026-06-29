const { db, parseJSON, ensureInitSafe } = require('./_auth');

module.exports = async (req, res) => {
  if (!await ensureInitSafe(res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  // Поддержка частичной загрузки: ?sections=items,guides,players
  // Если не указан — возвращаем всё (обратная совместимость)
  const requested = (req.query.sections || '').split(',').map(s => s.trim()).filter(Boolean);
  const wantAll = !requested.length;
  const want = (name) => wantAll || requested.includes(name);

  const result = {};

  if (want('items')) {
    result.items = (await db.execute('SELECT * FROM items ORDER BY id DESC')).rows
      .map(i => ({...i, awardedTo: parseJSON(i.awardedTo, [])}));
  }
  if (want('notes')) {
    result.notes = (await db.execute('SELECT * FROM notes ORDER BY id DESC')).rows
      .map(n => ({
        ...n,
        tags: parseJSON(n.tags, []),
        atts: parseJSON(n.atts, []),
        comments: parseJSON(n.comments, []),
        isPublic: !!n.isPublic
      }));
  }
  if (want('guides')) {
    result.guides = (await db.execute('SELECT * FROM guides ORDER BY id DESC')).rows
      .map(g => ({
        ...g,
        tags: parseJSON(g.tags, []),
        atts: parseJSON(g.atts, []),
        comments: parseJSON(g.comments, [])
      }));
  }
  if (want('players')) {
    result.players = (await db.execute('SELECT * FROM players ORDER BY id DESC')).rows
      .map(p => ({...p, chars: parseJSON(p.chars, [])}));
  }
  if (want('logs')) {
    result.logs = (await db.execute('SELECT * FROM logs ORDER BY id DESC')).rows
      .map(l => ({...l, meta: parseJSON(l.meta, {})}));
  }
  if (want('factions')) {
    result.factions = (await db.execute('SELECT * FROM factions')).rows;
  }
  if (want('transactions')) {
    result.transactions = (await db.execute('SELECT * FROM transactions ORDER BY id DESC')).rows;
  }

  res.json(result);
};
