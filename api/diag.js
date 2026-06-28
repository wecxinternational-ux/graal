// Диагностический endpoint — делает raw HTTP запрос к Turso
// и возвращает полный ответ (включая тело ошибки).
module.exports = async (req, res) => {
  const dbUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!dbUrl || !authToken) {
    return res.json({
      error: 'Env vars not set',
      TURSO_DATABASE_URL: !!dbUrl,
      TURSO_AUTH_TOKEN: !!authToken
    });
  }

  // Преобразуем libsql:// в https://
  const httpUrl = dbUrl.replace('libsql://', 'https://') + '/v2/pipeline';

  // Тестовый INSERT через raw HTTP
  const body = {
    requests: [
      {
        type: 'execute',
        stmt: {
          sql: 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
          args: [{ type: 'text', value: 'diag_test' }, { type: 'text', value: 'diag@test.com' }, { type: 'text', value: 'hash_test' }]
        }
      },
      { type: 'close' }
    ]
  };

  try {
    const r = await fetch(httpUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const text = await r.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }

    // Удалим diag_test пользователя, если вставка прошла
    if (r.ok) {
      try {
        const delBody = {
          requests: [
            {
              type: 'execute',
              stmt: {
                sql: 'DELETE FROM users WHERE username=?',
                args: [{ type: 'text', value: 'diag_test' }]
              }
            },
            { type: 'close' }
          ]
        };
        await fetch(httpUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + authToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(delBody)
        });
      } catch {}
    }

    return res.json({
      status: r.status,
      statusText: r.statusText,
      responseBody: parsed || text,
      url: httpUrl
    });
  } catch (e) {
    return res.json({
      fetchError: e.message,
      stack: e.stack,
      url: httpUrl
    });
  }
};
