const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, JWT_SECRET } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
    const result = stmt.run(username, email, hashedPassword);
    
    // Создаём игрока автоматически
    const playerStmt = db.prepare('INSERT INTO players (name, discord, userId) VALUES (?, ?, ?)');
    playerStmt.run(username, '', result.lastInsertRowid);

    const token = jwt.sign({ id: result.lastInsertRowid, username, role: 'player' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: result.lastInsertRowid, username, email, role: 'player' } });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Имя пользователя или почта уже заняты' });
    }
    res.status(500).json({ error: 'Ошибка сервера', details: err.message });
  }
};
