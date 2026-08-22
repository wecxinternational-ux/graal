/* ═══════════════════════════════════════════════════════════
   ГРААЛЬ · HTTP-сервер (self-hosted)

   Это тонкий адаптер: вся бизнес-логика живёт в api/*.js —
   тех же обработчиках, что писались под Vercel. Здесь они
   монтируются в Express, поэтому логика и права доступа
   существуют ровно в одном экземпляре.

   Обработчик api/* имеет сигнатуру (req, res) и опирается
   на req.query / req.body / res.status().json() — Express
   предоставляет всё это в совместимом виде.
═══════════════════════════════════════════════════════════ */

const express = require('express');
const cors = require('cors');
const path = require('path');

const { ensureInit } = require('../api/_db');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();

// За nginx — доверяем X-Forwarded-*, чтобы req.ip был реальным.
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(cors());
// Вложения в заметках приходят base64 внутри JSON — отсюда крупный лимит.
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

/* ── Мост Vercel-обработчик → Express ──
   На Vercel исключение внутри обработчика перехватывает платформа.
   В Express 4 отклонённый промис не всплывает в обработчик ошибок:
   запрос просто зависает. Поэтому оборачиваем каждый вызов. */
const mount = (route, handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    console.error(`[api] ${req.method} ${route} — ${err.stack || err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Внутренняя ошибка сервера', details: err.message });
    }
  }
};

const routes = [
  ['/api/auth/register', require('../api/auth/register')],
  ['/api/auth/login',    require('../api/auth/login')],
  ['/api/auth/promote',  require('../api/auth/promote')],
  ['/api/items',         require('../api/items')],
  ['/api/notes',         require('../api/notes')],
  ['/api/guides',        require('../api/guides')],
  ['/api/players',       require('../api/players')],
  ['/api/logs',          require('../api/logs')],
  ['/api/factions',      require('../api/factions')],
  ['/api/transactions',  require('../api/transactions')],
  ['/api/gm-codes',      require('../api/gm-codes')],
  ['/api/data',          require('../api/data')],
];

for (const [route, handler] of routes) {
  app.all(route, mount(route, handler));
}

// Проверка живости — для nginx/мониторинга и после деплоя.
app.get('/healthz', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()) });
});

// Неизвестный /api/* — отвечаем JSON, а не HTML-страницей,
// иначе фронт падает на response.json() в apiRequest().
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Эндпоинт не найден' });
});

/* ── Статика ── */
app.use(express.static(ROOT, {
  index: 'index.html',
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    // index.html не кешируем, чтобы правки фронта долетали сразу.
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Остальное отдаём index.html (одностраничное приложение).
app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

/* ── Старт ── */
ensureInit()
  .then(() => {
    app.listen(PORT, HOST, () => {
      console.log(`ГРААЛЬ: сервер слушает http://${HOST}:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Не удалось инициализировать БД:', err);
    process.exit(1);
  });

// PM2/systemd останавливают процесс сигналом — выходим тихо.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`Получен ${sig}, останавливаюсь`);
    process.exit(0);
  });
}
