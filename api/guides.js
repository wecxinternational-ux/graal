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
    const {title, tags, content, author, date, atts, comments, parentId} = req.body;
    const result = await db.execute({
      sql: `INSERT INTO guides (title, tags, content, author, date, atts, comments, parentId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        title, JSON.stringify(tags || []), content,
        author || req.user?.username || 'Мастер Эрандил',
        date || new Date().toISOString().split('T')[0],
        JSON.stringify(atts || []), JSON.stringify(comments || []),
        parentId ?? null
      ]
    });
    return res.json({ id: Number(result.lastInsertRowid), ...req.body, parentId: parentId ?? null });
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (req.user?.role !== 'gm') {
      const existing = (await db.execute({ sql: 'SELECT author FROM guides WHERE id=?', args: [id] })).rows[0];
      if (!existing || existing.author !== req.user?.username) {
        return res.status(403).json({ error: 'Нет прав на редактирование' });
      }
    }
    const {title, tags, content, author, date, atts, comments, parentId} = req.body;
    await db.execute({
      sql: `UPDATE guides SET title=?, tags=?, content=?, author=?, date=?, atts=?, comments=?, parentId=?
            WHERE id=?`,
      args: [
        title, JSON.stringify(tags), content, author, date,
        JSON.stringify(atts), JSON.stringify(comments), parentId ?? null, id
      ]
    });
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (req.user?.role !== 'gm') {
      const existing = (await db.execute({ sql: 'SELECT author FROM guides WHERE id=?', args: [id] })).rows[0];
      if (!existing || existing.author !== req.user?.username) {
        return res.status(403).json({ error: 'Нет прав на удаление' });
      }
    }
    await db.execute({ sql: 'DELETE FROM guides WHERE id=?', args: [id] });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
