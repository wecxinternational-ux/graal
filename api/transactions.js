const { db, authenticateToken, ensureInit } = require('./_auth');

module.exports = async (req, res) => {
  await ensureInit();

  if (req.method === 'GET') {
    const transactions = (await db.execute('SELECT * FROM transactions ORDER BY id DESC')).rows;
    return res.json(transactions);
  }

  if (req.method === 'POST') {
    if (!await authenticateToken(req, res)) return;
    const {player, desc, cost, status} = req.body;
    const result = await db.execute({
      sql: 'INSERT INTO transactions (player, "desc", cost, status) VALUES (?, ?, ?, ?)',
      args: [player, desc, cost, status || 'pending']
    });
    return res.json({ id: Number(result.lastInsertRowid), ...req.body });
  }

  if (req.method === 'PUT') {
    if (!await authenticateToken(req, res)) return;
    const { id } = req.query;
    const {player, desc, cost, status} = req.body;
    await db.execute({
      sql: 'UPDATE transactions SET player=?, "desc"=?, cost=?, status=? WHERE id=?',
      args: [player, desc, cost, status, id]
    });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
