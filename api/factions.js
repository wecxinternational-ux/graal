const { db, authenticateToken } = require('./_auth');

module.exports = (req, res) => {
  if (req.method === 'GET') {
    const factions = db.prepare('SELECT * FROM factions').all();
    return res.json(factions);
  }

  if (req.method === 'POST') {
    return authenticateToken(req, res, () => {
      const {name, color} = req.body;
      try {
        const stmt = db.prepare('INSERT INTO factions (name, color) VALUES (?, ?)');
        const result = stmt.run(name, color || '#A78BFA');
        res.json({ id: result.lastInsertRowid, ...req.body });
      } catch (e) {
        res.status(400).json({ error: 'Фракция уже существует' });
      }
    });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
