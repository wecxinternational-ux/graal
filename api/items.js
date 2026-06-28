const { db, parseJSON, authenticateToken } = require('./_auth');

module.exports = (req, res) => {
  if (req.method === 'GET') {
    const items = db.prepare('SELECT * FROM items ORDER BY id DESC').all();
    return res.json(items.map(i => ({...i, awardedTo: parseJSON(i.awardedTo, [])})));
  }

  if (req.method === 'POST') {
    return authenticateToken(req, res, () => {
      const {name, type, rarity, attune, stage, price, qty, desc, author, img} = req.body;
      const stmt = db.prepare(`
        INSERT INTO items (name, type, rarity, attune, stage, price, qty, desc, author, img, awardedTo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        name, type || 'Чудесный предмет', rarity, attune, 
        stage, price || 0, qty || 1, desc, 
        author || req.user?.username || 'Мастер Эрандил', img, '[]'
      );
      res.json({ id: result.lastInsertRowid, ...req.body, awardedTo: [] });
    });
  }

  if (req.method === 'PUT') {
    return authenticateToken(req, res, () => {
      const { id } = req.query;
      const {name, type, rarity, attune, stage, price, qty, desc, author, img, awardedTo} = req.body;
      const stmt = db.prepare(`
        UPDATE items SET name=?, type=?, rarity=?, attune=?, stage=?, price=?, qty=?, desc=?, author=?, img=?, awardedTo=?
        WHERE id=?
      `);
      stmt.run(name, type, rarity, attune, stage, price, qty, desc, author, img, JSON.stringify(awardedTo), id);
      res.json({ success: true });
    });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
