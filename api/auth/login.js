const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, JWT_SECRET, ensureInit } = require('../_auth');

module.exports = async (req, res) => {
  await ensureInit();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE username = ?',
    args: [username]
  });
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Неверные учётные данные' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Неверные учётные данные' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
};
