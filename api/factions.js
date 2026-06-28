const { db, authenticateToken, ensureInit } = require('./_auth');

module.exports = async (req, res) => {
  await ensureInit();

  if (req.method === 'GET') {
    const factions = (await db.execute('SELECT * FROM factions')).rows;
    return res.json(factions);
  }

  if (req.method === 'POST') {
    if (!await authenticateToken(req, res)) return;
    const {name, color} = req.body;
    try {
      const result = await db.execute({
        sql: 'INSERT INTO factions (name, color) VALUES (?, ?)',
        args: [name, color || '#A78BFA']
      });
      return res.json({ id: Number(result.lastInsertRowid), ...req.body });
    } catch (e) {
      return res.status(400).json({ error: 'Фракция уже существует' });
    }
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
