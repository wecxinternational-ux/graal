const { db, parseJSON, authenticateToken } = require('./_auth');

module.exports = (req, res) => {
  if (req.method === 'GET') {
    const logs = db.prepare('SELECT * FROM logs ORDER BY id DESC').all();
    return res.json(logs.map(l => ({...l, meta: parseJSON(l.meta, {})})));
  }

  if (req.method === 'POST') {
    return authenticateToken(req, res, () => {
      const {type, icon, text, meta, time, ts} = req.body;
      const stmt = db.prepare(`
        INSERT INTO logs (type, icon, text, meta, time, ts)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        type, icon, text, JSON.stringify(meta || {}),
        time || new Date().toLocaleString('ru-RU'), ts || Date.now()
      );
      res.json({ id: result.lastInsertRowid, ...req.body });
    });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
