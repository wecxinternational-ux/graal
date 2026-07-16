const { db, parseJSON, requireGm, ensureInitSafe } = require('./_auth');

module.exports = async (req, res) => {
  if (!await ensureInitSafe(res)) return;

  if (req.method === 'GET') {
    const items = (await db.execute('SELECT * FROM items ORDER BY id DESC')).rows;
    return res.json(items.map(i => ({...i, awardedTo: parseJSON(i.awardedTo, [])})));
  }

  if (req.method === 'POST') {
    if (!await requireGm(req, res)) return;
    const {name, type, rarity, attune, stage, price, desc, author, img} = req.body;
    const result = await db.execute({
      sql: `INSERT INTO items (name, type, rarity, attune, stage, price, "desc", author, img, awardedTo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        name, type || 'Чудесный предмет', rarity, attune,
        stage, price || 0, desc,
        author || req.user?.username || 'Мастер Эрандил', img, '[]'
      ]
    });
    return res.json({ id: Number(result.lastInsertRowid), ...req.body, awardedTo: [] });
  }

  if (req.method === 'PUT') {
    if (!await requireGm(req, res)) return;
    const { id } = req.query;
    const {name, type, rarity, attune, stage, price, desc, author, img, awardedTo} = req.body;
    await db.execute({
      sql: `UPDATE items SET name=?, type=?, rarity=?, attune=?, stage=?, price=?, "desc"=?, author=?, img=?, awardedTo=?
            WHERE id=?`,
      args: [name, type, rarity, attune, stage, price, desc, author, img, JSON.stringify(awardedTo), id]
    });
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    if (!await requireGm(req, res)) return;
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Не указан id' });
    await db.execute({ sql: 'DELETE FROM items WHERE id=?', args: [id] });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Метод не поддерживается' });
};
