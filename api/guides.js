const { db, parseJSON, requireGm, ensureInitSafe } = require('./_auth');

module.exports = async (req, res) => {
  if (!await ensureInitSafe(res)) return;

  if (req.method === 'GET') {
    const guides = (await db.execute('SELECT * FROM guides ORDER BY id DESC')).rows;
    return res.json(guides.map(g => ({
      ...g,
      tags: parseJSON(g.tags, []),
      atts: parseJSON(g.atts, []),
      comments: parseJSON(g.comments, [])
    })));
  }

  if (req.method === 'POST') {
    if (!await requireGm(req, res)) return;
    const {title, tags, content, author, date, atts, comments} = req.body;
    const result = await db.execute({
      sql: `INSERT INTO guides (title, tags, content, author, date, atts, comments)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        title, JSON.stringify(tags || []), content,
        author || req.user?.username || 'Мастер Эрандил',
        date || new Date().toISOString().split('T')[0],
        JSON.stringify(atts || []), JSON.stringify(comments || [])
      ]
    });
    return res.json({ id: Number(result.lastInsertRowid), ...req.body });
  }

  if (req.method === 'PUT') {
    if (!await requireGm(req, res)) return;
    const { id } = req.query;
    const {title, tags, content, author, date, atts, comments} = req.body;
    await db.execute({
      sql: `UPDATE guides SET title=?, tags=?, content=?, author=?, date=?, atts=?, comments=?
            WHERE id=?`,
      args: [
        title, JSON.stringify(tags), content, author, date,
        JSON.stringify(atts), JSON.stringify(comments), id
      ]
    });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
