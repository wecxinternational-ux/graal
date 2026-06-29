const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticateToken, db, JWT_SECRET, ensureInitSafe } = require('../_auth');

// POST /api/auth/promote
// Принимает { gmCode }. Если код валиден и не использован — повышает
// текущего авторизованного игрока до роли 'gm' и помечает код как использованный.
// Возвращает новый JWT с ролью gm.
module.exports = async (req, res) => {
  if (!await ensureInitSafe(res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  // Проверяем авторизацию
  if (!await authenticateToken(req, res)) return;

  // Уже ГМ — повышать не нужно
  if (req.user?.role === 'gm') {
    return res.status(400).json({ error: 'Вы уже являетесь ГМ' });
  }

  const { gmCode } = req.body || {};
  if (!gmCode) {
    return res.status(400).json({ error: 'Введите код приглашения' });
  }

  const normalizedCode = String(gmCode).trim().toUpperCase();

  try {
    // Проверяем код
    const codeResult = await db.execute({
      sql: 'SELECT * FROM gm_codes WHERE code = ?',
      args: [normalizedCode]
    });
    if (codeResult.rows.length === 0) {
      return res.status(400).json({ error: 'Неверный код приглашения' });
    }
    const codeRow = codeResult.rows[0];
    if (codeRow.usedById) {
      return res.status(400).json({ error: 'Этот код уже использован' });
    }

    // Повышаем роль пользователя
    await db.execute({
      sql: 'UPDATE users SET role = ? WHERE id = ?',
      args: ['gm', req.user.id]
    });

    // Помечаем код как использованный
    await db.execute({
      sql: 'UPDATE gm_codes SET usedById = ?, usedByName = ?, usedAt = CURRENT_TIMESTAMP WHERE code = ?',
      args: [req.user.id, req.user.username, normalizedCode]
    });

    // Выдаём новый токен с ролью gm
    const token = jwt.sign(
      { id: req.user.id, username: req.user.username, role: 'gm' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.json({
      token,
      user: { id: req.user.id, username: req.user.username, role: 'gm' }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Ошибка сервера', details: err.message });
  }
};
