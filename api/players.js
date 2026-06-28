const { db, parseJSON, authenticateToken } = require('./_auth');

module.exports = (req, res) => {
  if (req.method === 'GET') {
    const players = db.prepare('SELECT * FROM players ORDER BY id DESC').all();
    return res.json(players.map(p => ({...p, chars: parseJSON(p.chars, [])})));
  }

  if (req.method === 'POST') {
    return authenticateToken(req, res, () => {
      const {name, discord, points, slots, chars} = req.body;
      const stmt = db.prepare(`
        INSERT INTO players (name, discord, points, slots, chars, userId)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(name, discord, points || 0, slots || 1, JSON.stringify(chars || []), req.user?.id);
      res.json({ id: result.lastInsertRowid, ...req.body });
    });
  }

  if (req.method === 'PUT') {
    return authenticateToken(req, res, () => {
      const { id } = req.query;
      const {name, discord, points, slots, chars} = req.body;
      const stmt = db.prepare(`
        UPDATE players SET name=?, discord=?, points=?, slots=?, chars=?
        WHERE id=?
      `);
      stmt.run(name, discord, points, slots, JSON.stringify(chars), id);
      res.json({ success: true });
    });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
