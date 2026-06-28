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

  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.execute({
      sql: 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      args: [username, email, hashedPassword]
    });
    const userId = Number(result.lastInsertRowid);

    // Создаём игрока автоматически
    await db.execute({
      sql: 'INSERT INTO players (name, discord, userId) VALUES (?, ?, ?)',
      args: [username, '', userId]
    });

    const token = jwt.sign({ id: userId, username, role: 'player' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: userId, username, email, role: 'player' } });
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
