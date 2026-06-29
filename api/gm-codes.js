const { requireGm, db, ensureInitSafe } = require('./_auth');

// Генерация одноразового кода формата GM-XXXXXX (6 символов: A-Z, 0-9)
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих символов (I,O,0,1)
  let code = 'GM-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

module.exports = async (req, res) => {
  if (!await ensureInitSafe(res)) return;

  // GET — список всех кодов (только ГМ)
  if (req.method === 'GET') {
    if (!await requireGm(req, res)) return;
    try {
      const result = await db.execute({
        sql: 'SELECT * FROM gm_codes ORDER BY id DESC'
      });
      const codes = result.rows.map(r => ({
        id: r.id,
        code: r.code,
        createdByName: r.createdByName,
        usedByName: r.usedByName,
        usedAt: r.usedAt,
        createdAt: r.createdAt,
        used: !!r.usedById
      }));
      return res.json({ codes });
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка получения кодов', details: err.message });
    }
  }

  // POST — создать новый одноразовый код (только ГМ)
  if (req.method === 'POST') {
    if (!await requireGm(req, res)) return;
    try {
      // Пытаемся сгенерировать уникальный код (с повторными попытками на случай коллизии)
      let code = generateCode();
      let attempts = 0;
      while (attempts < 5) {
        const exists = await db.execute({
          sql: 'SELECT id FROM gm_codes WHERE code = ?',
          args: [code]
        });
        if (exists.rows.length === 0) break;
        code = generateCode();
        attempts++;
      }

      await db.execute({
        sql: 'INSERT INTO gm_codes (code, createdById, createdByName) VALUES (?, ?, ?)',
        args: [code, req.user.id, req.user.username]
      });

      return res.json({
        code,
        createdByName: req.user.username,
        createdAt: new Date().toISOString(),
        used: false
      });
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка создания кода', details: err.message });
    }
  }

  // DELETE — удалить неиспользованный код (только ГМ)
  if (req.method === 'DELETE') {
    if (!await requireGm(req, res)) return;
    try {
      const id = req.query?.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Не указан id кода' });
      // Нельзя удалить уже использованный код
      const existing = await db.execute({
        sql: 'SELECT usedById FROM gm_codes WHERE id = ?',
        args: [id]
      });
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Код не найден' });
      }
      if (existing.rows[0].usedById) {
        return res.status(400).json({ error: 'Нельзя удалить использованный код' });
      }
      await db.execute({
        sql: 'DELETE FROM gm_codes WHERE id = ?',
        args: [id]
      });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Ошибка удаления кода', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
