const { db, authenticateToken } = require('./_auth');

module.exports = (req, res) => {
  if (req.method === 'GET') {
    const transactions = db.prepare('SELECT * FROM transactions ORDER BY id DESC').all();
    return res.json(transactions);
  }

  if (req.method === 'POST') {
    return authenticateToken(req, res, () => {
      const {player, desc, cost, status} = req.body;
      const stmt = db.prepare('INSERT INTO transactions (player, desc, cost, status) VALUES (?, ?, ?, ?)');
      const result = stmt.run(player, desc, cost, status || 'pending');
      res.json({ id: result.lastInsertRowid, ...req.body });
    });
  }

  if (req.method === 'PUT') {
    return authenticateToken(req, res, () => {
      const { id } = req.query;
      const {player, desc, cost, status} = req.body;
      const stmt = db.prepare('UPDATE transactions SET player=?, desc=?, cost=?, status=? WHERE id=?');
      stmt.run(player, desc, cost, status, id);
      res.json({ success: true });
    });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
