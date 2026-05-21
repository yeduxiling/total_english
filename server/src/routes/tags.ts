import { Router } from 'express';
import { getDb } from '../db/init.js';

const router = Router();

// GET /api/tags - 获取所有标签，附带使用次数 count，按次数降序
router.get('/', (_req, res) => {
  const db = getDb();
  try {
    const tags = db.prepare(`
      SELECT t.id, t.name, COUNT(mt.meaning_id) as count
      FROM tags t
      LEFT JOIN meaning_tags mt ON t.id = mt.tag_id
      GROUP BY t.id
      ORDER BY count DESC, t.name ASC
    `).all();
    res.json(tags);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tags - 创建新标签
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: '无效的标签名' });
  }
  
  const tagName = name.trim();
  if (!tagName) {
    return res.status(400).json({ error: '标签名不能为空' });
  }

  const db = getDb();
  try {
    const result = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tagName);
    if (result.changes === 0) {
      // 标签已存在，找出它的 id
      const existing = db.prepare('SELECT * FROM tags WHERE name = ?').get(tagName) as any;
      return res.status(200).json(existing);
    }
    res.status(201).json({ id: result.lastInsertRowid, name: tagName, count: 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tags/:id - 删除标签
router.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    // 开启级联删除 (DB init 时已设置 foreign_keys = ON 和 ON DELETE CASCADE)
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    res.json({ message: '标签删除成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
