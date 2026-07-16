const { createClient } = require('@libsql/client');

BigInt.prototype.toJSON = function () { return Number(this); };

const dbUrl = process.env.TURSO_DATABASE_URL || 'file:./server/graal.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient(
  authToken
    ? { url: dbUrl, authToken }
    : { url: dbUrl }
);

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
    comments TEXT DEFAULT '[]',
    parentId INTEGER,
    sortOrder INTEGER DEFAULT 0
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
    status TEXT DEFAULT 'pending',
    type TEXT DEFAULT 'transaction'
  )`,
  `CREATE TABLE IF NOT EXISTS gm_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    createdById INTEGER,
    createdByName TEXT,
    usedById INTEGER,
    usedByName TEXT,
    usedAt TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )`
];

async function seedData() {
  const itemsCount = (await db.execute('SELECT COUNT(*) as count FROM items')).rows[0].count;
  const notesCount = (await db.execute('SELECT COUNT(*) as count FROM notes')).rows[0].count;

  if (itemsCount === 0 && notesCount === 0) {
    await db.execute({
      sql: `INSERT INTO items (name, type, rarity, attune, stage, price, "desc", author, awardedTo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'Пылающий клинок',
        'Оружие (длинный меч)',
        'rare',
        'yes',
        2,
        80,
        'Этот длинный меч окутан вечным магическим пламенем. При попадании наносит дополнительно 2к6 урона огнём.',
        'Мастер Эрандил',
        '[]'
      ]
    });

    await db.execute({
      sql: `INSERT INTO notes (title, tags, content, author, date, atts, comments) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'Хоумрул: Смерть персонажа',
        JSON.stringify(['Хоумрул', 'Правила']),
        '<h2>Правило гибели персонажа</h2><p>На нашем открытом столе персонаж, получивший 3 провала спасброска от смерти, не погибает автоматически — вместо этого он получает <strong>Постоянное увечье</strong> из специальной таблицы.</p>',
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
        JSON.stringify([{name:'Аэрис Тень',class:'Плут',subclass:'Аркановый трикстер',level:7,kt:[4,8],os:[15,20,15,10],verified:true,rep:[]}])
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

let initPromise = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      for (let i = 0; i < SCHEMA_STATEMENTS.length; i++) {
        try {
          await db.execute(SCHEMA_STATEMENTS[i]);
        } catch (e) {
          console.error('Schema stmt ' + i + ' failed: ' + e.message);
        }
      }
      // Миграция: добавляем колонку type в существующие БД (безопасно, если уже есть)
      try {
        const cols = (await db.execute('PRAGMA table_info(transactions)')).rows;
        if (cols.length && !cols.some(c => c.name === 'type')) {
          await db.execute("ALTER TABLE transactions ADD COLUMN type TEXT DEFAULT 'transaction'");
        }
      } catch (e) {
        console.error('transactions migration failed (ignored): ' + e.message);
      }
      // Миграция: добавляем колонку parentId в guides (для подруководств)
      try {
        const cols = (await db.execute('PRAGMA table_info(guides)')).rows;
        if (cols.length && !cols.some(c => c.name === 'parentId')) {
          await db.execute('ALTER TABLE guides ADD COLUMN parentId INTEGER');
        }
      } catch (e) {
        console.error('guides migration failed (ignored): ' + e.message);
      }
      try {
        const cols = (await db.execute('PRAGMA table_info(guides)')).rows;
        if (cols.length && !cols.some(c => c.name === 'sortOrder')) {
          await db.execute('ALTER TABLE guides ADD COLUMN sortOrder INTEGER DEFAULT 0');
        }
      } catch (e) {
        console.error('guides sortOrder migration failed (ignored): ' + e.message);
      }
      try {
        await seedData();
      } catch (e) {
        console.error('seedData failed (ignored): ' + e.message);
      }
    })().catch(err => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

module.exports = { db, ensureInit };
