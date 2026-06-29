const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { db, init } = require('./db');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'graal_secret_key_2024';

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

// Middleware: только для ГМ
const requireGm = (req, res, next) => {
  if (req.user?.role !== 'gm') {
    return res.status(403).json({ error: 'Требуется роль ГМ' });
  }
  next();
};

// Генерация одноразового кода формата GM-XXXXXX
function generateGmCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GM-';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Helper функции
const parseJSON = (str, def) => {
  try { return JSON.parse(str); } catch { return def; }
};

// Auth endpoints
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, role, gmCode } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  const userRole = role === 'gm' ? 'gm' : 'player';

  // Для регистрации ГМ требуется одноразовый код.
  // Bootstrap: если ГМов ещё нет — первый может зарегистрироваться без кода.
  if (userRole === 'gm') {
    let needsCode = true;
    if (!gmCode) {
      const gmCount = await db.execute({ sql: "SELECT COUNT(*) as count FROM users WHERE role = 'gm'" });
      if (gmCount.rows[0].count === 0) {
        needsCode = false;
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
      if (codeResult.rows[0].usedById) {
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

    // Создаём игрока автоматически
    await db.execute({
      sql: 'INSERT INTO players (name, discord, userId) VALUES (?, ?, ?)',
      args: [username, '', userId]
    });

    // Помечаем код как использованный (если был код, не bootstrap)
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Повышение игрока до ГМ по одноразовому коду
app.post('/api/auth/promote', authenticateToken, async (req, res) => {
  if (req.user?.role === 'gm') {
    return res.status(400).json({ error: 'Вы уже являетесь ГМ' });
  }
  const { gmCode } = req.body || {};
  if (!gmCode) {
    return res.status(400).json({ error: 'Введите код приглашения' });
  }
  const normalizedCode = String(gmCode).trim().toUpperCase();
  try {
    const codeResult = await db.execute({
      sql: 'SELECT * FROM gm_codes WHERE code = ?',
      args: [normalizedCode]
    });
    if (codeResult.rows.length === 0) {
      return res.status(400).json({ error: 'Неверный код приглашения' });
    }
    if (codeResult.rows[0].usedById) {
      return res.status(400).json({ error: 'Этот код уже использован' });
    }

    await db.execute({
      sql: 'UPDATE users SET role = ? WHERE id = ?',
      args: ['gm', req.user.id]
    });
    await db.execute({
      sql: 'UPDATE gm_codes SET usedById = ?, usedByName = ?, usedAt = CURRENT_TIMESTAMP WHERE code = ?',
      args: [req.user.id, req.user.username, normalizedCode]
    });

    const token = jwt.sign(
      { id: req.user.id, username: req.user.username, role: 'gm' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token, user: { id: req.user.id, username: req.user.username, role: 'gm' } });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера', details: err.message });
  }
});

// GM invite codes: список, создание, удаление
app.get('/api/gm-codes', authenticateToken, requireGm, async (req, res) => {
  try {
    const result = await db.execute({ sql: 'SELECT * FROM gm_codes ORDER BY id DESC' });
    const codes = result.rows.map(r => ({
      id: r.id,
      code: r.code,
      createdByName: r.createdByName,
      usedByName: r.usedByName,
      usedAt: r.usedAt,
      createdAt: r.createdAt,
      used: !!r.usedById
    }));
    res.json({ codes });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения кодов', details: err.message });
  }
});

app.post('/api/gm-codes', authenticateToken, requireGm, async (req, res) => {
  try {
    let code = generateGmCode();
    let attempts = 0;
    while (attempts < 5) {
      const exists = await db.execute({ sql: 'SELECT id FROM gm_codes WHERE code = ?', args: [code] });
      if (exists.rows.length === 0) break;
      code = generateGmCode();
      attempts++;
    }
    await db.execute({
      sql: 'INSERT INTO gm_codes (code, createdById, createdByName) VALUES (?, ?, ?)',
      args: [code, req.user.id, req.user.username]
    });
    res.json({ code, createdByName: req.user.username, createdAt: new Date().toISOString(), used: false });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка создания кода', details: err.message });
  }
});

app.delete('/api/gm-codes', authenticateToken, requireGm, async (req, res) => {
  try {
    const id = req.query?.id || req.body?.id;
    if (!id) return res.status(400).json({ error: 'Не указан id кода' });
    const existing = await db.execute({ sql: 'SELECT usedById FROM gm_codes WHERE id = ?', args: [id] });
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Код не найден' });
    if (existing.rows[0].usedById) return res.status(400).json({ error: 'Нельзя удалить использованный код' });
    await db.execute({ sql: 'DELETE FROM gm_codes WHERE id = ?', args: [id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления кода', details: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
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
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT id, username, email, role FROM users WHERE id = ?',
    args: [req.user.id]
  });
  res.json(result.rows[0]);
});

// ITEMS
app.get('/api/items', async (req, res) => {
  const result = await db.execute('SELECT * FROM items ORDER BY id DESC');
  res.json(result.rows.map(i => ({...i, awardedTo: parseJSON(i.awardedTo, [])})));
});

app.post('/api/items', authenticateToken, async (req, res) => {
  const {name, type, rarity, attune, stage, price, qty, desc, author, img} = req.body;
  const result = await db.execute({
    sql: `INSERT INTO items (name, type, rarity, attune, stage, price, qty, "desc", author, img, awardedTo)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [name, type || 'Чудесный предмет', rarity, attune, stage, price || 0, qty || 1, desc, author || req.user.username, img, '[]']
  });
  res.json({ id: Number(result.lastInsertRowid), ...req.body, awardedTo: [] });
});

app.put('/api/items/:id', authenticateToken, async (req, res) => {
  const {id} = req.params;
  const {name, type, rarity, attune, stage, price, qty, desc, author, img, awardedTo} = req.body;
  await db.execute({
    sql: `UPDATE items SET name=?, type=?, rarity=?, attune=?, stage=?, price=?, qty=?, "desc"=?, author=?, img=?, awardedTo=?
          WHERE id=?`,
    args: [name, type, rarity, attune, stage, price, qty, desc, author, img, JSON.stringify(awardedTo), id]
  });
  res.json({ success: true });
});

// NOTES
app.get('/api/notes', async (req, res) => {
  const result = await db.execute('SELECT * FROM notes ORDER BY id DESC');
  res.json(result.rows.map(n => ({
    ...n,
    tags: parseJSON(n.tags, []),
    atts: parseJSON(n.atts, []),
    comments: parseJSON(n.comments, []),
    isPublic: !!n.isPublic
  })));
});

app.post('/api/notes', authenticateToken, async (req, res) => {
  const {title, tags, content, isPublic, author, date, atts, comments} = req.body;
  const result = await db.execute({
    sql: `INSERT INTO notes (title, tags, content, isPublic, author, date, atts, comments)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      title, JSON.stringify(tags || []), content, isPublic ? 1 : 0,
      author || req.user.username, date || new Date().toISOString().split('T')[0],
      JSON.stringify(atts || []), JSON.stringify(comments || [])
    ]
  });
  res.json({ id: Number(result.lastInsertRowid), ...req.body });
});

app.put('/api/notes/:id', authenticateToken, async (req, res) => {
  const {id} = req.params;
  const {title, tags, content, isPublic, author, date, atts, comments} = req.body;
  await db.execute({
    sql: `UPDATE notes SET title=?, tags=?, content=?, isPublic=?, author=?, date=?, atts=?, comments=?
          WHERE id=?`,
    args: [
      title, JSON.stringify(tags), content, isPublic ? 1 : 0, author, date,
      JSON.stringify(atts), JSON.stringify(comments), id
    ]
  });
  res.json({ success: true });
});

// GUIDES
app.get('/api/guides', async (req, res) => {
  const result = await db.execute('SELECT * FROM guides ORDER BY id DESC');
  res.json(result.rows.map(g => ({
    ...g,
    tags: parseJSON(g.tags, []),
    atts: parseJSON(g.atts, []),
    comments: parseJSON(g.comments, [])
  })));
});

app.post('/api/guides', authenticateToken, async (req, res) => {
  const {title, tags, content, author, date, atts, comments, parentId} = req.body;
  const result = await db.execute({
    sql: `INSERT INTO guides (title, tags, content, author, date, atts, comments, parentId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      title, JSON.stringify(tags || []), content, author || req.user.username,
      date || new Date().toISOString().split('T')[0],
      JSON.stringify(atts || []), JSON.stringify(comments || []),
      parentId ?? null
    ]
  });
  res.json({ id: Number(result.lastInsertRowid), ...req.body, parentId: parentId ?? null });
});

app.put('/api/guides/:id', authenticateToken, async (req, res) => {
  const {id} = req.params;
  const {title, tags, content, author, date, atts, comments, parentId} = req.body;
  await db.execute({
    sql: `UPDATE guides SET title=?, tags=?, content=?, author=?, date=?, atts=?, comments=?, parentId=?
          WHERE id=?`,
    args: [
      title, JSON.stringify(tags), content, author, date,
      JSON.stringify(atts), JSON.stringify(comments), parentId ?? null, id
    ]
  });
  res.json({ success: true });
});

// PLAYERS
app.get('/api/players', async (req, res) => {
  const result = await db.execute('SELECT * FROM players ORDER BY id DESC');
  res.json(result.rows.map(p => ({...p, chars: parseJSON(p.chars, [])})));
});

app.post('/api/players', authenticateToken, async (req, res) => {
  const {name, discord, points, slots, chars} = req.body;
  const result = await db.execute({
    sql: `INSERT INTO players (name, discord, points, slots, chars, userId)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [name, discord, points || 0, slots || 1, JSON.stringify(chars || []), req.user.id]
  });
  res.json({ id: Number(result.lastInsertRowid), ...req.body });
});

app.put('/api/players/:id', authenticateToken, async (req, res) => {
  const {id} = req.params;
  const {name, discord, points, slots, chars} = req.body;
  await db.execute({
    sql: `UPDATE players SET name=?, discord=?, points=?, slots=?, chars=?
          WHERE id=?`,
    args: [name, discord, points, slots, JSON.stringify(chars), id]
  });
  res.json({ success: true });
});

app.delete('/api/players/:id', authenticateToken, requireGm, async (req, res) => {
  const {id} = req.params;
  await db.execute({ sql: 'DELETE FROM players WHERE id=?', args: [id] });
  res.json({ success: true });
});

// LOGS
app.get('/api/logs', async (req, res) => {
  const result = await db.execute('SELECT * FROM logs ORDER BY id DESC');
  res.json(result.rows.map(l => ({...l, meta: parseJSON(l.meta, {})})));
});

app.post('/api/logs', authenticateToken, async (req, res) => {
  const {type, icon, text, meta, time, ts} = req.body;
  const result = await db.execute({
    sql: `INSERT INTO logs (type, icon, text, meta, time, ts)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      type, icon, text, JSON.stringify(meta || {}),
      time || new Date().toLocaleString('ru-RU'),
      ts || Date.now()
    ]
  });
  res.json({ id: Number(result.lastInsertRowid), ...req.body });
});

// FACTIONS
app.get('/api/factions', async (req, res) => {
  const result = await db.execute('SELECT * FROM factions');
  res.json(result.rows);
});

app.post('/api/factions', authenticateToken, async (req, res) => {
  const {name, color} = req.body;
  try {
    const result = await db.execute({
      sql: 'INSERT INTO factions (name, color) VALUES (?, ?)',
      args: [name, color || '#A78BFA']
    });
    res.json({ id: Number(result.lastInsertRowid), ...req.body });
  } catch (e) {
    res.status(400).json({ error: 'Фракция уже существует' });
  }
});

// TRANSACTIONS
app.get('/api/transactions', authenticateToken, async (req, res) => {
  const result = await db.execute('SELECT * FROM transactions ORDER BY id DESC');
  if (req.user?.role === 'gm') return res.json(result.rows);
  res.json(result.rows.filter(t => t.player === req.user.username));
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
  const {player, desc, cost, status, type} = req.body;
  const txType = type === 'request' ? 'request' : 'transaction';
  // Игроки могут создавать только текстовые запросы
  if (txType === 'transaction' && req.user?.role !== 'gm') {
    return res.status(403).json({ error: 'Только ГМ может создавать транзакции с очками' });
  }
  if (txType === 'request') {
    if (!desc || !desc.trim()) {
      return res.status(400).json({ error: 'Введите текст запроса' });
    }
    const playerName = req.user?.role === 'gm' ? (player || req.user.username) : req.user.username;
    const result = await db.execute({
      sql: 'INSERT INTO transactions (player, "desc", cost, status, type) VALUES (?, ?, ?, ?, ?)',
      args: [playerName, desc.trim(), cost || 0, 'pending', 'request']
    });
    return res.json({ id: Number(result.lastInsertRowid), player: playerName, desc: desc.trim(), cost: cost || 0, status: 'pending', type: 'request' });
  }
  const result = await db.execute({
    sql: 'INSERT INTO transactions (player, "desc", cost, status, type) VALUES (?, ?, ?, ?, ?)',
    args: [player, desc, cost, status || 'pending', 'transaction']
  });
  res.json({ id: Number(result.lastInsertRowid), player, desc, cost, status: status || 'pending', type: 'transaction' });
});

app.put('/api/transactions/:id', authenticateToken, requireGm, async (req, res) => {
  const {id} = req.params;
  const {player, desc, cost, status, type} = req.body;
  await db.execute({
    sql: 'UPDATE transactions SET player=?, "desc"=?, cost=?, status=?, type=? WHERE id=?',
    args: [player, desc, cost, status, type || 'transaction', id]
  });
  res.json({ success: true });
});

// Получить все данные сразу
app.get('/api/data', async (req, res) => {
  // Частичная загрузка: ?sections=items,guides
  const requested = (req.query.sections || '').split(',').map(s => s.trim()).filter(Boolean);
  const wantAll = !requested.length;
  const want = (name) => wantAll || requested.includes(name);
  const result = {};

  if (want('items')) {
    result.items = (await db.execute('SELECT * FROM items ORDER BY id DESC')).rows
      .map(i => ({...i, awardedTo: parseJSON(i.awardedTo, [])}));
  }
  if (want('notes')) {
    result.notes = (await db.execute('SELECT * FROM notes ORDER BY id DESC')).rows
      .map(n => ({...n, tags: parseJSON(n.tags, []), atts: parseJSON(n.atts, []), comments: parseJSON(n.comments, []), isPublic: !!n.isPublic}));
  }
  if (want('guides')) {
    result.guides = (await db.execute('SELECT * FROM guides ORDER BY id DESC')).rows
      .map(g => ({...g, tags: parseJSON(g.tags, []), atts: parseJSON(g.atts, []), comments: parseJSON(g.comments, [])}));
  }
  if (want('players')) {
    result.players = (await db.execute('SELECT * FROM players ORDER BY id DESC')).rows
      .map(p => ({...p, chars: parseJSON(p.chars, [])}));
  }
  if (want('logs')) {
    result.logs = (await db.execute('SELECT * FROM logs ORDER BY id DESC')).rows
      .map(l => ({...l, meta: parseJSON(l.meta, {})}));
  }
  if (want('factions')) {
    result.factions = (await db.execute('SELECT * FROM factions')).rows;
  }
  if (want('transactions')) {
    result.transactions = (await db.execute('SELECT * FROM transactions ORDER BY id DESC')).rows;
  }

  res.json(result);
});

// Запуск с инициализацией БД
init().then(() => {
  app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
    console.log(`Откройте браузер и перейдите по ссылке выше`);
  });
}).catch(err => {
  console.error('Ошибка инициализации БД:', err);
  process.exit(1);
});
