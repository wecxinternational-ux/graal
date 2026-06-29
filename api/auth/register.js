const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, JWT_SECRET, ensureInitSafe } = require('../_auth');

module.exports = async (req, res) => {
  if (!await ensureInitSafe(res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  // Логируем входящие данные для диагностики.
  console.log('register req.body:', JSON.stringify(req.body));
  console.log('register content-type:', req.headers['content-type']);

  const { username, email, password, role, gmCode } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  // Роль: 'gm' или 'player'. По умолчанию 'player'.
  const userRole = role === 'gm' ? 'gm' : 'player';

  // Для регистрации ГМ требуется одноразовый код, созданный действующим ГМ.
  // Исключение: bootstrap — если в системе ещё нет ни одного ГМ, первый ГМ
  // может зарегистрироваться без кода (чтобы решить проблему «курицы и яйца»).
  if (userRole === 'gm') {
    let needsCode = true;
    if (!gmCode) {
      const gmCount = await db.execute({ sql: "SELECT COUNT(*) as count FROM users WHERE role = 'gm'" });
      if (gmCount.rows[0].count === 0) {
        needsCode = false; // bootstrap: первый ГМ
      }
    }
    if (needsCode) {
      if (!gmCode) {
        return res.status(400).json({ error: 'Для регистрации ГМ требуется код приглашения' });
      }
      const codeResult = await db.execute({
        sql: 'SELECT * FROM gm_codes WHERE code = ?',
        args: [gmCode.trim().toUpperCase()]
      });
      if (codeResult.rows.length === 0) {
        return res.status(400).json({ error: 'Неверный код приглашения' });
      }
      const codeRow = codeResult.rows[0];
      if (codeRow.usedById) {
        return res.status(400).json({ error: 'Этот код уже использован' });
      }
    }
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.execute({
      sql: 'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      args: [username, email, hashedPassword, userRole]
    });
    const userId = Number(result.lastInsertRowid);

    // Создаём игрока автоматически (для обеих ролей — ГМ тоже может иметь персонажей)
    await db.execute({
      sql: 'INSERT INTO players (name, discord, userId) VALUES (?, ?, ?)',
      args: [username, '', userId]
    });

    // Помечаем код как использованный (если регистрация ГМ по коду, не bootstrap)
    if (userRole === 'gm' && gmCode) {
      await db.execute({
        sql: 'UPDATE gm_codes SET usedById = ?, usedByName = ?, usedAt = CURRENT_TIMESTAMP WHERE code = ?',
        args: [userId, username, gmCode.trim().toUpperCase()]
      });
    }

    const token = jwt.sign({ id: userId, username, role: userRole }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: userId, username, email, role: userRole } });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Имя пользователя или почта уже заняты' });
    }
    // Расширенное логирование для диагностики Turso HTTP 400.
    // libsql может прятать детали в err.cause.
    console.error('register error:', JSON.stringify({
      message: err.message,
      code: err.code,
      name: err.name,
      cause: err.cause ? {
        message: err.cause.message,
        code: err.cause.code,
        body: err.cause.body,
        stack: err.cause.stack
      } : null,
      stack: err.stack
    }));
    res.status(500).json({
      error: 'Ошибка сервера',
      details: err.message,
      code: err.code,
      name: err.name,
      cause: err.cause ? (err.cause.message || err.cause.body || String(err.cause)) : null
    });
  }
};
