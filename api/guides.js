const { db, parseJSON, authenticateToken } = require('./_auth');

module.exports = (req, res) => {
  if (req.method === 'GET') {
    const guides = db.prepare('SELECT * FROM guides ORDER BY id DESC').all();
    return res.json(guides.map(g => ({
      ...g,
      tags: parseJSON(g.tags, []),
      atts: parseJSON(g.atts, []),
      comments: parseJSON(g.comments, [])
    })));
  }

  if (req.method === 'POST') {
    return authenticateToken(req, res, () => {
      const {title, tags, content, author, date, atts, comments} = req.body;
      const stmt = db.prepare(`
        INSERT INTO guides (title, tags, content, author, date, atts, comments)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        title, JSON.stringify(tags || []), content,
        author || req.user?.username || 'Мастер Эрандил',
        date || new Date().toISOString().split('T')[0],
        JSON.stringify(atts || []), JSON.stringify(comments || [])
      );
      res.json({ id: result.lastInsertRowid, ...req.body });
    });
  }

  if (req.method === 'PUT') {
    return authenticateToken(req, res, () => {
      const { id } = req.query;
      const {title, tags, content, author, date, atts, comments} = req.body;
      const stmt = db.prepare(`
        UPDATE guides SET title=?, tags=?, content=?, author=?, date=?, atts=?, comments=?
        WHERE id=?
      `);
      stmt.run(
        title, JSON.stringify(tags), content, author, date,
        JSON.stringify(atts), JSON.stringify(comments), id
      );
      res.json({ success: true });
    });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
