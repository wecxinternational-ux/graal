const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'graal_secret_key_2024'; // В реальном приложении храните в переменных окружения

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..')));

// Middleware для проверки JWT токена
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Недействительный токен' });
    }
    req.user = user;
    next();
  });
};

// Helper функции
const parseJSON = (str, def) => {
  try { return JSON.parse(str); } catch { return def; }
};

// Auth endpoints
app.post('/api/auth/register', async (req, res) => {
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Неверные учётные данные' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'Неверные учётные данные' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// ITEMS
app.get('/api/items', (req, res) => {
  const items = db.prepare('SELECT * FROM items ORDER BY id DESC').all();
  res.json(items.map(i => ({...i, awardedTo: parseJSON(i.awardedTo, [])})));
});

app.post('/api/items', authenticateToken, (req, res) => {
  const {name, type, rarity, attune, stage, price, qty, desc, author, img} = req.body;
  const stmt = db.prepare(`
    INSERT INTO items (name, type, rarity, attune, stage, price, qty, desc, author, img, awardedTo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, type || 'Чудесный предмет', rarity, attune, stage, price || 0, qty || 1, desc, author || req.user.username, img, '[]');
  res.json({ id: result.lastInsertRowid, ...req.body, awardedTo: [] });
});

app.put('/api/items/:id', authenticateToken, (req, res) => {
  const {id} = req.params;
  const {name, type, rarity, attune, stage, price, qty, desc, author, img, awardedTo} = req.body;
  const stmt = db.prepare(`
    UPDATE items SET name=?, type=?, rarity=?, attune=?, stage=?, price=?, qty=?, desc=?, author=?, img=?, awardedTo=?
    WHERE id=?
  `);
  stmt.run(name, type, rarity, attune, stage, price, qty, desc, author, img, JSON.stringify(awardedTo), id);
  res.json({ success: true });
});

// NOTES
app.get('/api/notes', (req, res) => {
  const notes = db.prepare('SELECT * FROM notes ORDER BY id DESC').all();
  res.json(notes.map(n => ({
    ...n,
    tags: parseJSON(n.tags, []),
    atts: parseJSON(n.atts, []),
    comments: parseJSON(n.comments, []),
    isPublic: !!n.isPublic
  })));
});

app.post('/api/notes', authenticateToken, (req, res) => {
  const {title, tags, content, isPublic, author, date, atts, comments} = req.body;
  const stmt = db.prepare(`
    INSERT INTO notes (title, tags, content, isPublic, author, date, atts, comments)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    title, JSON.stringify(tags || []), content, isPublic ? 1 : 0,
    author || req.user.username, date || new Date().toISOString().split('T')[0],
    JSON.stringify(atts || []), JSON.stringify(comments || [])
  );
  res.json({ id: result.lastInsertRowid, ...req.body });
});

app.put('/api/notes/:id', authenticateToken, (req, res) => {
  const {id} = req.params;
  const {title, tags, content, isPublic, author, date, atts, comments} = req.body;
  const stmt = db.prepare(`
    UPDATE notes SET title=?, tags=?, content=?, isPublic=?, author=?, date=?, atts=?, comments=?
    WHERE id=?
  `);
  stmt.run(
    title, JSON.stringify(tags), content, isPublic ? 1 : 0, author, date,
    JSON.stringify(atts), JSON.stringify(comments), id
  );
  res.json({ success: true });
});

// GUIDES
app.get('/api/guides', (req, res) => {
  const guides = db.prepare('SELECT * FROM guides ORDER BY id DESC').all();
  res.json(guides.map(g => ({
    ...g,
    tags: parseJSON(g.tags, []),
    atts: parseJSON(g.atts, []),
    comments: parseJSON(g.comments, [])
  })));
});

app.post('/api/guides', authenticateToken, (req, res) => {
  const {title, tags, content, author, date, atts, comments} = req.body;
  const stmt = db.prepare(`
    INSERT INTO guides (title, tags, content, author, date, atts, comments)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    title, JSON.stringify(tags || []), content, author || req.user.username,
    date || new Date().toISOString().split('T')[0],
    JSON.stringify(atts || []), JSON.stringify(comments || [])
  );
  res.json({ id: result.lastInsertRowid, ...req.body });
});

app.put('/api/guides/:id', authenticateToken, (req, res) => {
  const {id} = req.params;
  const {title, tags, content, author, date, atts, comments} = req.body;
  const stmt = db.prepare(`
    UPDATE guides SET title=?, tags=?, content=?, author=?, date=?, atts=?, comments=?
    WHERE id=?
  `);
  stmt.run(
    title, JSON.stringify(tags), content, author, date,
    JSON.stringify(atts), JSON.stringify(comments), id
  );
  res.json({ success: true });
});

// PLAYERS
app.get('/api/players', (req, res) => {
  const players = db.prepare('SELECT * FROM players ORDER BY id DESC').all();
  res.json(players.map(p => ({...p, chars: parseJSON(p.chars, [])})));
});

app.post('/api/players', authenticateToken, (req, res) => {
  const {name, discord, points, slots, chars} = req.body;
  const stmt = db.prepare(`
    INSERT INTO players (name, discord, points, slots, chars, userId)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, discord, points || 0, slots || 1, JSON.stringify(chars || []), req.user.id);
  res.json({ id: result.lastInsertRowid, ...req.body });
});

app.put('/api/players/:id', authenticateToken, (req, res) => {
  const {id} = req.params;
  const {name, discord, points, slots, chars} = req.body;
  const stmt = db.prepare(`
    UPDATE players SET name=?, discord=?, points=?, slots=?, chars=?
    WHERE id=?
  `);
  stmt.run(name, discord, points, slots, JSON.stringify(chars), id);
  res.json({ success: true });
});

// LOGS
app.get('/api/logs', (req, res) => {
  const logs = db.prepare('SELECT * FROM logs ORDER BY id DESC').all();
  res.json(logs.map(l => ({...l, meta: parseJSON(l.meta, {})})));
});

app.post('/api/logs', authenticateToken, (req, res) => {
  const {type, icon, text, meta, time, ts} = req.body;
  const stmt = db.prepare(`
    INSERT INTO logs (type, icon, text, meta, time, ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    type, icon, text, JSON.stringify(meta || {}),
    time || new Date().toLocaleString('ru-RU'),
    ts || Date.now()
  );
  res.json({ id: result.lastInsertRowid, ...req.body });
});

// FACTIONS
app.get('/api/factions', (req, res) => {
  const factions = db.prepare('SELECT * FROM factions').all();
  res.json(factions);
});

app.post('/api/factions', authenticateToken, (req, res) => {
  const {name, color} = req.body;
  try {
    const stmt = db.prepare('INSERT INTO factions (name, color) VALUES (?, ?)');
    const result = stmt.run(name, color || '#A78BFA');
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (e) {
    res.status(400).json({ error: 'Фракция уже существует' });
  }
});

// TRANSACTIONS
app.get('/api/transactions', (req, res) => {
  const tx = db.prepare('SELECT * FROM transactions ORDER BY id DESC').all();
  res.json(tx);
});

app.post('/api/transactions', authenticateToken, (req, res) => {
  const {player, desc, cost, status} = req.body;
  const stmt = db.prepare('INSERT INTO transactions (player, desc, cost, status) VALUES (?, ?, ?, ?)');
  const result = stmt.run(player, desc, cost, status || 'pending');
  res.json({ id: result.lastInsertRowid, ...req.body });
});

app.put('/api/transactions/:id', authenticateToken, (req, res) => {
  const {id} = req.params;
  const {player, desc, cost, status} = req.body;
  const stmt = db.prepare('UPDATE transactions SET player=?, desc=?, cost=?, status=? WHERE id=?');
  stmt.run(player, desc, cost, status, id);
  res.json({ success: true });
});

// Получить все данные сразу
app.get('/api/data', async (req, res) => {
  const items = db.prepare('SELECT * FROM items ORDER BY id DESC').all().map(i => ({...i, awardedTo: parseJSON(i.awardedTo, [])}));
  const notes = db.prepare('SELECT * FROM notes ORDER BY id DESC').all().map(n => ({...n, tags: parseJSON(n.tags, []), atts: parseJSON(n.atts, []), comments: parseJSON(n.comments, []), isPublic: !!n.isPublic}));
  const guides = db.prepare('SELECT * FROM guides ORDER BY id DESC').all().map(g => ({...g, tags: parseJSON(g.tags, []), atts: parseJSON(g.atts, []), comments: parseJSON(g.comments, [])}));
  const players = db.prepare('SELECT * FROM players ORDER BY id DESC').all().map(p => ({...p, chars: parseJSON(p.chars, [])}));
  const logs = db.prepare('SELECT * FROM logs ORDER BY id DESC').all().map(l => ({...l, meta: parseJSON(l.meta, {})}));
  const factions = db.prepare('SELECT * FROM factions').all();
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY id DESC').all();

  res.json({ items, notes, guides, players, logs, factions, transactions });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  console.log(`Откройте браузер и перейдите по ссылке выше`);
});
