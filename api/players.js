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
        createdAt: c.createdAt,
        // Картинка входит в список: без неё аватар персонажа пропадал
        // после перезагрузки страницы и возвращался только при открытии
        // профиля, который догружает данные отдельным запросом.
        img: c.img || null
      }));
      players.push({ ...p, chars });
    }
    return res.json(players);
  }

  if (req.method === 'POST') {
    // ГМ заводит профиль кому угодно. Игрок — только себе:
    // иначе, потеряв свой профиль, он не мог бы создать персонажа.
    if (!await authenticateToken(req, res)) return;
    const isGm = req.user?.role === 'gm';
    const {name, discord, points, slots, chars} = req.body;

    if (!isGm) {
      const mine = (await db.execute({
        sql: 'SELECT id FROM players WHERE userId = ? OR name = ?',
        args: [req.user.id, req.user.username]
      })).rows[0];
      if (mine) {
        return res.status(400).json({ error: 'Профиль игрока уже существует' });
      }
    }

    const ownerId = isGm ? (req.body.userId ?? null) : req.user.id;
    const playerName = isGm ? name : req.user.username;
    // Очки и слоты выдаёт ГМ — игрок себе их назначить не может.
    const result = await db.execute({
      sql: `INSERT INTO players (name, discord, points, slots, chars, userId)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        playerName, discord || '',
        isGm ? (points || 0) : 0,
        isGm ? (slots || 1) : 1,
        JSON.stringify(chars || []), ownerId
      ]
    });
    return res.json({
      id: Number(result.lastInsertRowid),
      name: playerName, discord: discord || '',
      points: isGm ? (points || 0) : 0,
      slots: isGm ? (slots || 1) : 1,
      chars: chars || [], userId: ownerId
    });
  }

  if (req.method === 'PUT') {
    // ГМ может обновлять любого игрока.
    // Игрок может обновлять только свой профиль (по userId).
    if (!await authenticateToken(req, res)) return;
    const { id } = req.query;
    if (req.user?.role !== 'gm') {
      const target = (await db.execute({
        sql: 'SELECT userId, name FROM players WHERE id=?',
        args: [id]
      })).rows[0];
      if (!target) {
        return res.status(404).json({ error: 'Профиль игрока не найден' });
      }
      // Профиль свой, если он привязан к учётной записи по userId либо
      // ещё не привязан ни к кому и совпадает по имени. Второй случай —
      // это профили из начальных данных и заведённые ГМом вручную:
      // без него игрок не мог создать персонажа в собственном профиле.
      const byId   = target.userId != null && Number(target.userId) === Number(req.user.id);
      const byName = target.userId == null && target.name === req.user.username;
      if (!byId && !byName) {
        return res.status(403).json({ error: 'Можно редактировать только свой профиль' });
      }
      // Закрепляем профиль за учётной записью, чтобы дальше работала
      // однозначная проверка по userId.
      if (byName) {
        await db.execute({ sql: 'UPDATE players SET userId=? WHERE id=?', args: [req.user.id, id] });
      }
    }
    const {name, discord, points, slots, chars, img, board} = req.body;
    // Драйвер БД не принимает undefined. Клиент присылает не все поля
    // (например, при создании персонажа не было board), и запрос падал
    // с 500 — персонаж оставался только на экране и исчезал после
    // перезагрузки. Приводим пропущенные значения к null явно.
    const nn = (v) => (v === undefined ? null : v);
    try {
      await db.execute({
        sql: `UPDATE players SET name=?, discord=?, points=?, slots=?, chars=?, img=?, board=?
              WHERE id=?`,
        args: [
          nn(name), nn(discord), nn(points), nn(slots),
          JSON.stringify(chars ?? []), nn(img), nn(board), id
        ]
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
