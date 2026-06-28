const { db, parseJSON, authenticateToken, ensureInitSafe } = require('./_auth');

module.exports = async (req, res) => {
  if (!await ensureInitSafe(res)) return;

  if (req.method === 'GET') {
    const logs = (await db.execute('SELECT * FROM logs ORDER BY id DESC')).rows;
    return res.json(logs.map(l => ({...l, meta: parseJSON(l.meta, {})})));
  }

  if (req.method === 'POST') {
    if (!await authenticateToken(req, res)) return;
    const {type, icon, text, meta, time, ts} = req.body;
    const result = await db.execute({
      sql: `INSERT INTO logs (type, icon, text, meta, time, ts)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        type, icon, text, JSON.stringify(meta || {}),
        time || new Date().toLocaleString('ru-RU'), ts || Date.now()
      ]
    });
    return res.json({ id: Number(result.lastInsertRowid), ...req.body });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
