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

module.exports = { authenticateToken, parseJSON, JWT_SECRET, db, ensureInit };
