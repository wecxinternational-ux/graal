const jwt = require('jsonwebtoken');
const { db, ensureInit } = require('./_db');

const JWT_SECRET = process.env.JWT_SECRET || 'graal_secret_key_2024';

// Async-функция проверки токена.
// Возвращает true если авторизован, иначе отправляет ошибку и возвращает false.
async function authenticateToken(req, res) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return false;
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return true;
  } catch (err) {
    res.status(403).json({ error: 'Неверный токен' });
    return false;
  }
}

const parseJSON = (str, def) => {
  try { return JSON.parse(str); } catch { return def; }
};

// Безопасная инициализация БД.
// В случае ошибки отправляет JSON 500 вместо проброса исключения
// (которое на Vercel превращается в HTML-страницу "A server error...").
async function ensureInitSafe(res) {
  try {
    await ensureInit();
    return true;
  } catch (err) {
    const hasUrl = !!process.env.TURSO_DATABASE_URL;
    const hasToken = !!process.env.TURSO_AUTH_TOKEN;
    res.status(500).json({
      error: 'Ошибка инициализации БД',
      details: err.message,
      stack: err.stack,
      env: { TURSO_DATABASE_URL: hasUrl, TURSO_AUTH_TOKEN: hasToken }
    });
    return false;
  }
}

// Проверка авторизации И роли ГМ.
// Используется для всех POST/PUT/DELETE операций мастеру
// (создание/изменение предметов, заметок, руководств, выдача поинтов, заверение и т.п.).
// Игрокам возвращается 403.
async function requireGm(req, res) {
  if (!await authenticateToken(req, res)) return false;
  if (req.user?.role !== 'gm') {
    res.status(403).json({ error: 'Требуется роль ГМ' });
    return false;
  }
  return true;
}

module.exports = { authenticateToken, requireGm, parseJSON, JWT_SECRET, db, ensureInit, ensureInitSafe };
