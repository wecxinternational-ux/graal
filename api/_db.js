const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Для Vercel: храним БД в /tmp, чтобы она не очищалась на каждый запрос
const dbPath = process.env.NODE_ENV === 'production' 
  ? path.join('/tmp', 'graal.db') 
  : path.join(__dirname, '..', 'server', 'graal.db');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');

// Создание таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'player',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT,
    rarity TEXT,
    attune TEXT,
    stage INTEGER,
    price INTEGER DEFAULT 0,
    qty INTEGER DEFAULT 1,
    desc TEXT,
    author TEXT,
    img TEXT,
    awardedTo TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    content TEXT,
    isPublic INTEGER DEFAULT 0,
    author TEXT,
    date TEXT,
    atts TEXT DEFAULT '[]',
    comments TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS guides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    content TEXT,
    author TEXT,
    date TEXT,
    atts TEXT DEFAULT '[]',
    comments TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    discord TEXT,
    points INTEGER DEFAULT 0,
    slots INTEGER DEFAULT 1,
    chars TEXT DEFAULT '[]',
    userId INTEGER
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    icon TEXT,
    text TEXT,
    meta TEXT DEFAULT '{}',
    time TEXT,
    ts INTEGER
  );

  CREATE TABLE IF NOT EXISTS factions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT,
    desc TEXT,
    cost INTEGER,
    status TEXT DEFAULT 'pending'
  );
`);

// Начальные данные
const initSeed = () => {
  const itemsCount = db.prepare('SELECT COUNT(*) as count FROM items').get().count;
  const notesCount = db.prepare('SELECT COUNT(*) as count FROM notes').get().count;
  const guidesCount = db.prepare('SELECT COUNT(*) as count FROM guides').get().count;
  const playersCount = db.prepare('SELECT COUNT(*) as count FROM players').get().count;
  const factionsCount = db.prepare('SELECT COUNT(*) as count FROM factions').get().count;

  if (itemsCount === 0 && notesCount === 0) {
    const insertItem = db.prepare(`
      INSERT INTO items (name, type, rarity, attune, stage, price, qty, desc, author, awardedTo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertItem.run(
      'Пылающий клинок',
      'Оружие (длинный меч)',
      'rare',
      'yes',
      2,
      80,
      3,
      'Этот длинный меч окутан вечным магическим пламенем. При попадании наносит дополнительно 2к6 урона огнём.',
      'Мастер Эрандил',
      '[]'
    );

    const insertNote = db.prepare(`
      INSERT INTO notes (title, tags, content, isPublic, author, date, atts, comments)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertNote.run(
      'Хоумрул: Смерть персонажа',
      JSON.stringify(['Хоумрул', 'Правила']),
      '<h2>Правило гибели персонажа</h2><p>На нашем открытом столе персонаж, получивший 3 провала спасброска от смерти, не погибает автоматически — вместо этого он получает <strong>Постоянное увечье</strong> из специальной таблицы.</p>',
      1,
      'Мастер Эрандил',
      new Date().toISOString().split('T')[0],
      '[]',
      '[]'
    );

    const insertGuide = db.prepare(`
      INSERT INTO guides (title, tags, content, author, date, atts, comments)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertGuide.run(
      'Правила открытого стола',
      JSON.stringify(['Правила', 'Объявление']),
      '<h2>Добро пожаловать!</h2><p>Это открытый стол в системе D&D 5e. Здесь вы найдёте все необходимые правила для участия в игре.</p><h3>Создание персонажа</h3><p>Персонаж создаётся по стандартным правилам PHB с учётом хоумрулов сервера.</p>',
      'Мастер Эрандил',
      new Date().toISOString().split('T')[0],
      '[]',
      '[]'
    );

    const insertPlayer = db.prepare(`
      INSERT INTO players (name, discord, points, slots, chars)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertPlayer.run(
      'Артемис Мирослав',
      'artemis#0042',
      240,
      2,
      JSON.stringify([{name:'Аэрис Тень',class:'Плут',subclass:'Аркановый трикстер',level:7,kt:[4,8],os:60,verified:true,rep:[]}])
    );

    const insertTx = db.prepare(`
      INSERT INTO transactions (player, desc, cost, status)
      VALUES (?, ?, ?, ?)
    `);
    insertTx.run('Артемис Мирослав', 'Новый слот персонажа', 150, 'pending');

    const factions = [
      {name:'Орден Рассветного Щита',color:'#FBBF24'},
      {name:'Культ Разлома',color:'#F87171'},
      {name:'Гильдия Странников',color:'#60A5FA'},
      {name:'Серебряный Ковен',color:'#C084FC'},
      {name:'Нейтральные',color:'#9CA3AF'},
    ];
    const insertFac = db.prepare('INSERT OR IGNORE INTO factions (name, color) VALUES (?, ?)');
    factions.forEach(f => insertFac.run(f.name, f.color));

    const insertLog = db.prepare(`
      INSERT INTO logs (type, icon, text, meta, time, ts)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertLog.run(
      'item',
      '⚔',
      'Предмет <span class="li-it">«Пылающий клинок»</span> добавлен. Добавил: <span class="li-pl">Мастер Эрандил</span>. Кол-во: 3.',
      '{}',
      new Date().toLocaleString('ru-RU'),
      Date.now()
    );
  }
};

initSeed();

module.exports = db;
