const { db, parseJSON, authenticateToken, ensureInitSafe } = require('./_auth');

module.exports = async (req, res) => {
  if (!await ensureInitSafe(res)) return;

  if (req.method === 'GET') {
    const notes = (await db.execute('SELECT * FROM notes ORDER BY id DESC')).rows;
    return res.json(notes.map(n => ({
      ...n,
      tags: parseJSON(n.tags, []),
      atts: parseJSON(n.atts, []),
      comments: parseJSON(n.comments, []),
      isPublic: !!n.isPublic
    })));
  }

  if (req.method === 'POST') {
    if (!await authenticateToken(req, res)) return;
    const {title, tags, content, isPublic, author, date, atts, comments} = req.body;
    const result = await db.execute({
      sql: `INSERT INTO notes (title, tags, content, isPublic, author, date, atts, comments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        title, JSON.stringify(tags || []), content, isPublic ? 1 : 0,
        author || req.user?.username || 'Мастер Эрандил', date || new Date().toISOString().split('T')[0],
        JSON.stringify(atts || []), JSON.stringify(comments || [])
      ]
    });
    return res.json({ id: Number(result.lastInsertRowid), ...req.body });
  }

  if (req.method === 'PUT') {
    if (!await authenticateToken(req, res)) return;
    const { id } = req.query;
    const {title, tags, content, isPublic, author, date, atts, comments} = req.body;
    await db.execute({
      sql: `UPDATE notes SET title=?, tags=?, content=?, isPublic=?, author=?, date=?, atts=?, comments=?
            WHERE id=?`,
      args: [
        title, JSON.stringify(tags), content, isPublic ? 1 : 0, author, date,
        JSON.stringify(atts), JSON.stringify(comments), id
      ]
    });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
