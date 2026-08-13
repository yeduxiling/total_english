import { Router } from 'express';
import { getDb } from '../db/init.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// GET /api/settings/models - 获取所有模型配置
router.get('/models', (_req, res) => {
  const db = getDb();
  const models = db.prepare('SELECT * FROM model_configs ORDER BY created_at DESC').all();
  // 脱敏 API Key
  const result = (models as any[]).map(m => ({
    ...m,
    apiKey: m.api_key ? `${m.api_key.substring(0, 6)}****${m.api_key.slice(-4)}` : '',
  }));
  res.json(result);
});

// GET /api/settings/models/active - 获取当前激活的模型
router.get('/models/active', (_req, res) => {
  const db = getDb();
  const model = db.prepare('SELECT * FROM model_configs WHERE is_active = 1').get();
  if (!model) {
    return res.json(null);
  }
  // 脱敏
  const m = model as any;
  res.json({
    ...m,
    apiKey: m.api_key ? `${m.api_key.substring(0, 6)}****${m.api_key.slice(-4)}` : '',
  });
});

// POST /api/settings/models - 创建模型配置
router.post('/models', (req, res) => {
  const { name, baseUrl, apiKey, modelId } = req.body;
  if (!name || !baseUrl || !apiKey || !modelId) {
    return res.status(400).json({ error: '缺少必要字段' });
  }

  const db = getDb();
  const id = uuidv4();

  const transaction = db.transaction(() => {
    // 检查是否是第一个配置，如果是的话默认激活
    const countRow = db.prepare('SELECT COUNT(*) as c FROM model_configs').get() as { c: number };
    const isFirst = countRow.c === 0;
    
    const isActive = isFirst ? 1 : 0;

    db.prepare(`
      INSERT INTO model_configs (id, name, base_url, api_key, model_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, baseUrl, apiKey, modelId, isActive);
  });

  try {
    transaction();
    res.status(201).json({ id, message: '模型配置已创建' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/models/:id - 更新模型配置
router.put('/models/:id', (req, res) => {
  const { id } = req.params;
  const { name, baseUrl, apiKey, modelId } = req.body;
  if (!name || !baseUrl || !modelId) {
    return res.status(400).json({ error: '缺少必要字段' });
  }

  const db = getDb();

  try {
    const existing = db.prepare('SELECT api_key FROM model_configs WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: '配置不存在' });
    }

    let finalApiKey = existing.api_key;
    // 如果 apiKey 没有包含脱敏符，说明用户输入了新的 key
    if (apiKey && !apiKey.includes('****')) {
      finalApiKey = apiKey;
    }

    db.prepare(`
      UPDATE model_configs 
      SET name = ?, base_url = ?, api_key = ?, model_id = ?
      WHERE id = ?
    `).run(name, baseUrl, finalApiKey, modelId, id);

    res.json({ message: '模型配置已更新' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings/models/:id/activate - 激活指定模型
router.put('/models/:id/activate', (req, res) => {
  const db = getDb();
  const transaction = db.transaction(() => {
    db.prepare('UPDATE model_configs SET is_active = 0').run();
    db.prepare('UPDATE model_configs SET is_active = 1 WHERE id = ?').run(req.params.id);
  });

  try {
    transaction();
    res.json({ message: '模型已激活' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/models/:id/test - 测试模型连通性
router.post('/models/:id/test', async (req, res) => {
  const db = getDb();
  const model = db.prepare('SELECT * FROM model_configs WHERE id = ?').get(req.params.id) as any;
  if (!model) {
    return res.status(404).json({ ok: false, error: 'Configuration not found' });
  }

  const apiUrl = `${model.base_url.replace(/\/$/, '')}/chat/completions`;
  const startTime = Date.now();

  // 15s 超时保护，避免请求无限挂起
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.api_key}`,
      },
      body: JSON.stringify({
        model: model.model_id,
        messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
        max_tokens: 32,   // 适当放大，避免 reasoning 前缀被截断导致 content 为空
        temperature: 0,
      }),
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      let cleanError = errorText;
      // 优先解析 JSON 错误体（OpenAI / DeepSeek 风格）
      try {
        const errJson = JSON.parse(errorText);
        const msg = errJson?.error?.message || errJson?.message;
        if (msg) cleanError = String(msg);
      } catch { /* 非 JSON，继续用文本 */ }
      // 如果是 HTML 错误页，提取 title
      if (cleanError === errorText && /<[a-z][\s\S]*>/i.test(errorText)) {
        const titleMatch = errorText.match(/<title>(.*?)<\/title>/i);
        cleanError = titleMatch?.[1]?.trim() || errorText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 120);
      }
      return res.json({ ok: false, error: `HTTP ${response.status}: ${cleanError}`, latency });
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content;
    // 严格判空：undefined / null / 纯空字符串均视为失败
    if (content === undefined || content === null || String(content).trim() === '') {
      return res.json({ ok: false, error: 'Model returned empty content', latency });
    }

    return res.json({ ok: true, latency, reply: String(content).trim() });
  } catch (err: any) {
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    const isTimeout = err.name === 'AbortError';
    return res.json({
      ok: false,
      error: isTimeout ? 'Request timed out (15s)' : (err.message || 'Network connection failed'),
      latency,
    });
  }
});


// DELETE /api/settings/models/:id - 删除模型配置
router.delete('/models/:id', (req, res) => {
  const db = getDb();
  try {
    db.prepare('DELETE FROM model_configs WHERE id = ?').run(req.params.id);
    res.json({ message: '模型配置已删除' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
