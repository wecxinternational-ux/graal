const { db, requireGm, authenticateToken, ensureInitSafe } = require('./_auth');

module.exports = async (req, res) => {
  if (!await ensureInitSafe(res)) return;

  if (req.method === 'GET') {
    // Любой аутентифицированный пользователь видит транзакции
    // (ГМ — все, игрок — свои)
    if (!await authenticateToken(req, res)) return;
    const transactions = (await db.execute('SELECT * FROM transactions ORDER BY id DESC')).rows;
    if (req.user?.role === 'gm') return res.json(transactions);
    return res.json(transactions.filter(t => t.player === req.user.username));
  }

  if (req.method === 'POST') {
    if (!await authenticateToken(req, res)) return;
    const {player, desc, cost, status, type} = req.body;

    // Игроки могут создавать только текстовые запросы (type='request').
    // Полноценные транзакции (с очками) создаёт только ГМ.
    const txType = type === 'request' ? 'request' : 'transaction';
    if (txType === 'transaction' && req.user?.role !== 'gm') {
      return res.status(403).json({ error: 'Только ГМ может создавать транзакции с очками' });
    }
    if (txType === 'request') {
      if (!desc || !desc.trim()) {
        return res.status(400).json({ error: 'Введите текст запроса' });
      }
      // Запрос создаётся от имени текущего пользователя
      const playerName = req.user?.role === 'gm' ? (player || req.user.username) : req.user.username;
      const result = await db.execute({
        sql: 'INSERT INTO transactions (player, "desc", cost, status, type) VALUES (?, ?, ?, ?, ?)',
        args: [playerName, desc.trim(), cost || 0, 'pending', 'request']
      });
      return res.json({ id: Number(result.lastInsertRowid), player: playerName, desc: desc.trim(), cost: cost || 0, status: 'pending', type: 'request' });
    }

    // Обычная транзакция от ГМ
    const result = await db.execute({
      sql: 'INSERT INTO transactions (player, "desc", cost, status, type) VALUES (?, ?, ?, ?, ?)',
      args: [player, desc, cost, status || 'pending', 'transaction']
    });
    return res.json({ id: Number(result.lastInsertRowid), player, desc, cost, status: status || 'pending', type: 'transaction' });
  }

  if (req.method === 'PUT') {
    if (!await requireGm(req, res)) return;
    const { id } = req.query;
    const {player, desc, cost, status, type} = req.body;
    await db.execute({
      sql: 'UPDATE transactions SET player=?, "desc"=?, cost=?, status=?, type=? WHERE id=?',
      args: [player, desc, cost, status, type || 'transaction', id]
    });
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    if (!await requireGm(req, res)) return;
    const { id } = req.query;
    await db.execute({ sql: 'DELETE FROM transactions WHERE id=?', args: [id] });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
