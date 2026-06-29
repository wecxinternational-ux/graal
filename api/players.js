const { db, parseJSON, requireGm, authenticateToken, ensureInitSafe } = require('./_auth');

module.exports = async (req, res) => {
  if (!await ensureInitSafe(res)) return;

  if (req.method === 'GET') {
    const players = (await db.execute('SELECT * FROM players ORDER BY id DESC')).rows;
    return res.json(players.map(p => ({...p, chars: parseJSON(p.chars, [])})));
  }

  if (req.method === 'POST') {
    if (!await requireGm(req, res)) return;
    const {name, discord, points, slots, chars} = req.body;
    const result = await db.execute({
      sql: `INSERT INTO players (name, discord, points, slots, chars, userId)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [name, discord, points || 0, slots || 1, JSON.stringify(chars || []), req.user?.id]
    });
    return res.json({ id: Number(result.lastInsertRowid), ...req.body });
  }

  if (req.method === 'PUT') {
    // ГМ может обновлять любого игрока.
    // Игрок может обновлять только свой профиль (по userId).
    if (!await authenticateToken(req, res)) return;
    const { id } = req.query;
    if (req.user?.role !== 'gm') {
      // Проверяем, что профиль принадлежит текущему пользователю
      const target = (await db.execute({
        sql: 'SELECT userId FROM players WHERE id=?',
        args: [id]
      })).rows[0];
      if (!target || Number(target.userId) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Можно редактировать только свой профиль' });
      }
    }
    const {name, discord, points, slots, chars} = req.body;
    await db.execute({
      sql: `UPDATE players SET name=?, discord=?, points=?, slots=?, chars=?
            WHERE id=?`,
      args: [name, discord, points, slots, JSON.stringify(chars), id]
    });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
