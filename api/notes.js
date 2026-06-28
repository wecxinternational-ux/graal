const { db, parseJSON, authenticateToken } = require('./_auth');

module.exports = (req, res) => {
  if (req.method === 'GET') {
    const notes = db.prepare('SELECT * FROM notes ORDER BY id DESC').all();
    return res.json(notes.map(n => ({
      ...n,
      tags: parseJSON(n.tags, []),
      atts: parseJSON(n.atts, []),
      comments: parseJSON(n.comments, []),
      isPublic: !!n.isPublic
    })));
  }

  if (req.method === 'POST') {
    return authenticateToken(req, res, () => {
      const {title, tags, content, isPublic, author, date, atts, comments} = req.body;
      const stmt = db.prepare(`
        INSERT INTO notes (title, tags, content, isPublic, author, date, atts, comments)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        title, JSON.stringify(tags || []), content, isPublic ? 1 : 0,
        author || req.user?.username || 'Мастер Эрандил', date || new Date().toISOString().split('T')[0],
        JSON.stringify(atts || []), JSON.stringify(comments || [])
      );
      res.json({ id: result.lastInsertRowid, ...req.body });
    });
  }

  if (req.method === 'PUT') {
    return authenticateToken(req, res, () => {
      const { id } = req.query;
      const {title, tags, content, isPublic, author, date, atts, comments} = req.body;
      const stmt = db.prepare(`
        UPDATE notes SET title=?, tags=?, content=?, isPublic=?, author=?, date=?, atts=?, comments=?
        WHERE id=?
      `);
      stmt.run(
        title, JSON.stringify(tags), content, isPublic ? 1 : 0, author, date,
        JSON.stringify(atts), JSON.stringify(comments), id
      );
      res.json({ success: true });
    });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
