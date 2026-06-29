const { db, parseJSON, requireGm, ensureInitSafe } = require('./_auth');

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
    if (!await requireGm(req, res)) return;
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
    const { id } = req.query;
    // Специальный режим: добавление комментария (доступно любому аутентифицированному)
    if (req.body?.__action === 'addComment') {
      const existing = (await db.execute({ sql: 'SELECT comments FROM notes WHERE id=?', args: [id] })).rows[0];
      if (!existing) return res.status(404).json({ error: 'Запись не найдена' });
      const comments = parseJSON(existing.comments, []);
      comments.push(req.body.comment);
      await db.execute({ sql: 'UPDATE notes SET comments=? WHERE id=?', args: [JSON.stringify(comments), id] });
      return res.json({ success: true, comments });
    }
    // Проверка прав: ГМ или автор поста
    if (req.user?.role !== 'gm') {
      const existing = (await db.execute({ sql: 'SELECT author FROM notes WHERE id=?', args: [id] })).rows[0];
      if (!existing || existing.author !== req.user?.username) {
        return res.status(403).json({ error: 'Нет прав на редактирование' });
      }
    }
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

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (req.user?.role !== 'gm') {
      const existing = (await db.execute({ sql: 'SELECT author FROM notes WHERE id=?', args: [id] })).rows[0];
      if (!existing || existing.author !== req.user?.username) {
        return res.status(403).json({ error: 'Нет прав на удаление' });
      }
    }
    await db.execute({ sql: 'DELETE FROM notes WHERE id=?', args: [id] });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
