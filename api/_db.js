const { createClient } = require('@libsql/client');

// libSQL возвращает INTEGER-колонки как BigInt.
// Конвертируем в Number для корректной JSON-сериализации.
BigInt.prototype.toJSON = function () { return Number(this); };

// Для Vercel (production): используем Turso (libSQL).
// Для локальной разработки: используем локальный файл SQLite.
const dbUrl = process.env.TURSO_DATABASE_URL || 'file:./server/graal.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient(
  authToken
    ? { url: dbUrl, authToken }
    : { url: dbUrl }
);

// Схема БД — каждый CREATE выполняется отдельно, чтобы Turso вернул
// точную ошибку, если какой-то statement некорректен.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'player',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT,
    rarity TEXT,
    attune TEXT,
    stage INTEGER,
    price INTEGER DEFAULT 0,
    qty INTEGER DEFAULT 1,
    "desc" TEXT,
    author TEXT,
    img TEXT,
    awardedTo TEXT DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    content TEXT,
    isPublic INTEGER DEFAULT 0,
    author TEXT,
    date TEXT,
    atts TEXT DEFAULT '[]',
    comments TEXT DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS guides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    content TEXT,
    author TEXT,
    date TEXT,
    atts TEXT DEFAULT '[]',
    comments TEXT DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    discord TEXT,
    points INTEGER DEFAULT 0,
    slots INTEGER DEFAULT 1,
    chars TEXT DEFAULT '[]',
    userId INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    icon TEXT,
    text TEXT,
    meta TEXT DEFAULT '{}',
    time TEXT,
    ts INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS factions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player TEXT,
    "desc" TEXT,
    cost INTEGER,
    status TEXT DEFAULT 'pending'
  )`
];

// Начальные данные
async function seedData() {
  const itemsCount = (await db.execute('SELECT COUNT(*) as count FROM items')).rows[0].count;
  const notesCount = (await db.execute('SELECT COUNT(*) as count FROM notes')).rows[0].count;

  if (itemsCount === 0 && notesCount === 0) {
    await db.execute({
      sql: `INSERT INTO items (name, type, rarity, attune, stage, price, qty, "desc", author, awardedTo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
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
      ]
    });

    await db.execute({
      sql: `INSERT INTO notes (title, tags, content, isPublic, author, date, atts, comments) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'Хоумрул: Смерть персонажа',
        JSON.stringify(['Хоумрул', 'Правила']),
        '<h2>Правило гибели персонажа</h2><p>На нашем открытом столе персонаж, получивший 3 провала спасброска от смерти, не погибает автоматически — вместо этого он получает <strong>Постоянное увечье</strong> из специальной таблицы.</p>',
        1,
        'Мастер Эрандил',
        new Date().toISOString().split('T')[0],
        '[]',
        '[]'
      ]
    });

    await db.execute({
      sql: `INSERT INTO guides (title, tags, content, author, date, atts, comments) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'Правила открытого стола',
        JSON.stringify(['Правила', 'Объявление']),
        '<h2>Добро пожаловать!</h2><p>Это открытый стол в системе D&D 5e. Здесь вы найдёте все необходимые правила для участия в игре.</p><h3>Создание персонажа</h3><p>Персонаж создаётся по стандартным правилам PHB с учётом хоумрулов сервера.</p>',
        'Мастер Эрандил',
        new Date().toISOString().split('T')[0],
        '[]',
        '[]'
      ]
    });

    await db.execute({
      sql: `INSERT INTO players (name, discord, points, slots, chars) VALUES (?, ?, ?, ?, ?)`,
      args: [
        'Артемис Мирослав',
        'artemis#0042',
        240,
        2,
        JSON.stringify([{name:'Аэрис Тень',class:'Плут',subclass:'Аркановый трикстер',level:7,kt:[4,8],os:60,verified:true,rep:[]}])
      ]
    });

    await db.execute({
      sql: `INSERT INTO transactions (player, "desc", cost, status) VALUES (?, ?, ?, ?)`,
      args: ['Артемис Мирослав', 'Новый слот персонажа', 150, 'pending']
    });

    const factions = [
      {name:'Орден Рассветного Щита',color:'#FBBF24'},
      {name:'Культ Разлома',color:'#F87171'},
      {name:'Гильдия Странников',color:'#60A5FA'},
      {name:'Серебряный Ковен',color:'#C084FC'},
      {name:'Нейтральные',color:'#9CA3AF'},
    ];
    for (const f of factions) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO factions (name, color) VALUES (?, ?)',
        args: [f.name, f.color]
      });
    }

    await db.execute({
      sql: `INSERT INTO logs (type, icon, text, meta, time, ts) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        'item',
        '⚔',
        'Предмет <span class="li-it">«Пылающий клинок»</span> добавлен. Добавил: <span class="li-pl">Мастер Эрандил</span>. Кол-во: 3.',
        '{}',
        new Date().toLocaleString('ru-RU'),
        Date.now()
      ]
    });
  }
}

// Ленивая инициализация (вызывается перед первым запросом)
let initPromise = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      for (let i = 0; i < SCHEMA_STATEMENTS.length; i++) {
        try {
          await db.execute(SCHEMA_STATEMENTS[i]);
        } catch (e) {
          console.error('Schema stmt ' + i + ' failed: ' + e.message);
          // Не пробрасываем — таблица уже может существовать.
        }
      }
      // Seed обёрнут в try/catch на верхнем уровне: если данные уже есть
      // (UNIQUE constraint) или произошла гонка — игнорируем. Лучше
      // показать пустой список, чем 500.
      try {
        await seedData();
      } catch (e) {
        console.error('seedData failed (ignored): ' + e.message);
      }
    })().catch(err => {
      initPromise = null; // сбрасываем, чтобы можно было повторить
      throw err;
    });
  }
  return initPromise;
}

module.exports = { db, ensureInit };
