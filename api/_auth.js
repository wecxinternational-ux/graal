const jwt = require('jsonwebtoken');
const db = require('./_db');

const JWT_SECRET = process.env.JWT_SECRET || 'graal_secret_key_2024';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Неверный токен' });
  }
};

const parseJSON = (str, def) => {
  try { return JSON.parse(str); } catch { return def; }
};

module.exports = { authenticateToken, parseJSON, JWT_SECRET, db };
