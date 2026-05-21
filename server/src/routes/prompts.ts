import { Router } from 'express';
import { getDb } from '../db/init.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// GET /api/prompts - 获取所有提示词模板
router.get('/', (_req, res) => {
  const db = getDb();
  const prompts = db.prepare('SELECT * FROM prompt_templates ORDER BY updated_at DESC').all();
  res.json(prompts);
});

// GET /api/prompts/:id - 获取单个提示词模板
router.get('/:id', (req, res) => {
  const db = getDb();
  const prompt = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(req.params.id);
  if (!prompt) {
    return res.status(404).json({ error: '提示词模板不存在' });
  }
  res.json(prompt);
});

// PUT /api/prompts/:id - 更新提示词模板
router.put('/:id', (req, res) => {
  const { systemPrompt, userPrompt, name } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM prompt_templates WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    return res.status(404).json({ error: '提示词模板不存在' });
  }

  const newVersion = existing.version + 1;

  const transaction = db.transaction(() => {
    // 保存旧版本到历史
    db.prepare(`
      INSERT INTO prompt_history (id, template_id, system_prompt, user_prompt, version)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), existing.id, existing.system_prompt, existing.user_prompt, existing.version);

    // 更新当前模板
    db.prepare(`
      UPDATE prompt_templates
      SET system_prompt = ?, user_prompt = ?, name = ?, version = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      systemPrompt || existing.system_prompt,
      userPrompt || existing.user_prompt,
      name || existing.name,
      newVersion,
      req.params.id
    );
  });

  try {
    transaction();
    res.json({ message: '提示词已更新', version: newVersion });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prompts/:id/history - 获取提示词版本历史
router.get('/:id/history', (req, res) => {
  const db = getDb();
  const history = db.prepare(
    'SELECT * FROM prompt_history WHERE template_id = ? ORDER BY version DESC'
  ).all(req.params.id);
  res.json(history);
});

export default router;
