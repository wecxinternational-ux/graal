const { db, parseJSON, requireGm, authenticateToken, ensureInitSafe } = require('./_auth');

module.exports = async (req, res) => {
  if (!await ensureInitSafe(res)) return;
  
  if (req.method === 'POST' || req.method === 'PUT') {
    if (typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    } else if (!req.body) {
      return res.status(400).json({ error: 'Missing request body' });
    }
  }

  if (req.method === 'GET') {
    const { id } = req.query;
    if (id) {
      const result = await db.execute({ sql: 'SELECT * FROM players WHERE id=?', args: [id] });
      const p = result.rows[0];
      if (!p) return res.status(404).json({ error: 'Игрок не найден' });
      return res.json({ ...p, chars: parseJSON(p.chars, []) });
    }
    const result = await db.execute('SELECT id, name, discord, points, slots, userId, img, board FROM players ORDER BY id DESC');
    const players = [];
    for (const p of result.rows) {
      const charsRaw = (await db.execute({ sql: 'SELECT chars FROM players WHERE id=?', args: [p.id] })).rows[0]?.chars;
      const chars = parseJSON(charsRaw, []).map(c => ({
        name: c.name, class: c.class, subclass: c.subclass,
        level: c.level, verified: c.verified,
        kt: c.kt, os: c.os, rep: c.rep, desc: c.desc,
        createdAt: c.createdAt
      }));
      players.push({ ...p, chars });
    }
    return res.json(players);
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
    const {name, discord, points, slots, chars, img, board} = req.body;
    try {
      await db.execute({
        sql: `UPDATE players SET name=?, discord=?, points=?, slots=?, chars=?, img=?, board=?
              WHERE id=?`,
        args: [name, discord, points, slots, JSON.stringify(chars), img, board, id]
      });
      return res.json({ success: true });
    } catch (e) {
      console.error('PUT /api/players error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE — только ГМ может удалять профили игроков
  if (req.method === 'DELETE') {
    if (!await requireGm(req, res)) return;
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Не указан id' });
    await db.execute({ sql: 'DELETE FROM players WHERE id=?', args: [id] });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
