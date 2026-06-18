import { Router } from 'express';
import { getDb } from '../db/init.js';
import { parseLlmResponse } from '../utils/json.js';
import { callLlmWithRetry } from '../utils/llm.js';

interface Chunk {
  label: string;
  text: string;
  explanation: string;
  level: number;
}

interface CollocationOrDifficulty {
  point: string;
  explanation: string;
}

interface AnalysisResult {
  chunks: Chunk[];
  overallMeaning: string;
  collocationsAndDifficulties?: CollocationOrDifficulty[];
}

const router = Router();

// 1. AI 句子分析
router.post('/analyze', async (req, res) => {
  const { sentence } = req.body;

  if (!sentence || sentence.trim() === '') {
    return res.status(400).json({ error: 'Sentence is required.' });
  }

  try {
    const db = getDb();

    // 检查数据库中是否已存在该句子的分析结果
    const existing = db.prepare('SELECT analysis_result FROM sentences WHERE sentence = ? AND analysis_result IS NOT NULL').get(sentence.trim()) as { analysis_result: string } | undefined;
    if (existing && existing.analysis_result) {
      try {
        const parsedResult = JSON.parse(existing.analysis_result);
        return res.json({
          sentence: sentence.trim(),
          analysis: parsedResult,
          cached: true
        });
      } catch (e) {
        // 解析 JSON 失败，则继续调用 LLM
      }
    }

    // 获取“句子意群分析”模板
    const promptTemplate = db.prepare("SELECT * FROM prompt_templates WHERE name = '句子意群分析' AND is_active = 1").get() as any;
    if (!promptTemplate) {
      throw new Error('No active "句子意群分析" prompt template found. Please run migrations/seeds.');
    }

    // 替换 {{sentence}}
    const userPrompt = promptTemplate.user_prompt.replace('{{sentence}}', sentence.trim());

    // 获取激活的模型
    const modelConfig = db.prepare('SELECT * FROM model_configs WHERE is_active = 1').get() as any;
    if (!modelConfig) {
      throw new Error('No active model configured.');
    }

    const apiUrl = `${modelConfig.base_url.replace(/\/$/, '')}/chat/completions`;
    const requestBody = {
      model: modelConfig.model_id,
      messages: [
        { role: 'system', content: promptTemplate.system_prompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    };

    let parsed: AnalysisResult | null = null;
    let attempts = 0;
    const maxParseAttempts = 2;

    while (attempts < maxParseAttempts) {
      attempts++;
      try {
        const rawContent = await callLlmWithRetry({
          apiUrl,
          apiKey: modelConfig.api_key,
          requestBody,
        });

        parsed = parseLlmResponse<AnalysisResult>(rawContent);

        // 校验结构业务完整性
        if (!parsed.overallMeaning || !parsed.chunks || parsed.chunks.length === 0) {
          throw new Error('Parsed result is incomplete (missing overallMeaning or chunks).');
        }

        break;
      } catch (parseErr: any) {
        console.warn(`⚠️ [Sentence Analysis Attempt ${attempts}/${maxParseAttempts} Failed]: ${parseErr.message}`);
        if (attempts >= maxParseAttempts) {
          if (parsed && parsed.chunks && parsed.chunks.length > 0) {
            if (!parsed.overallMeaning) {
              parsed.overallMeaning = "Analysis was partially completed. Please try analyzing again.";
            }
            break;
          }
          throw parseErr;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    res.json({
      sentence: sentence.trim(),
      analysis: parsed,
      cached: false
    });
  } catch (err: any) {
    console.error('Sentence analysis error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. 获取所有收藏的句子
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM sentences WHERE is_favorite = 1 ORDER BY created_at DESC').all();
    
    const result = rows.map((row: any) => ({
      ...row,
      analysis_result: row.analysis_result ? JSON.parse(row.analysis_result) : null
    }));

    res.json(result);
  } catch (err: any) {
    console.error('Get sentences error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. 收藏新句子
router.post('/', (req, res) => {
  const { sentence, source, analysisResult, note, sourceTag } = req.body;

  if (!sentence || sentence.trim() === '') {
    return res.status(400).json({ error: 'Sentence is required.' });
  }

  const cleanSentence = sentence.trim();
  const analysisResultStr = analysisResult ? JSON.stringify(analysisResult) : null;
  const cleanSource = source || 'manual';

  try {
    const db = getDb();

    // 检查是否已存在
    const existing = db.prepare('SELECT * FROM sentences WHERE sentence = ?').get(cleanSentence) as any;

    if (existing) {
      if (existing.is_favorite === 1) {
        db.prepare(`
          UPDATE sentences
          SET source = ?,
              analysis_result = COALESCE(?, analysis_result),
              note = COALESCE(?, note),
              source_tag = COALESCE(?, source_tag),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cleanSource, analysisResultStr, note || null, sourceTag || null, existing.id);
        
        const updated = db.prepare('SELECT * FROM sentences WHERE id = ?').get(existing.id) as any;
        return res.json({
          ...updated,
          analysis_result: updated.analysis_result ? JSON.parse(updated.analysis_result) : null,
          message: 'Sentence already favorited, updated details.'
        });
      } else {
        db.prepare(`
          UPDATE sentences
          SET is_favorite = 1,
              source = ?,
              analysis_result = ?,
              note = ?,
              source_tag = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(cleanSource, analysisResultStr, note || null, sourceTag || null, existing.id);

        const updated = db.prepare('SELECT * FROM sentences WHERE id = ?').get(existing.id) as any;
        return res.status(201).json({
          ...updated,
          analysis_result: updated.analysis_result ? JSON.parse(updated.analysis_result) : null
        });
      }
    }

    // 插入新记录
    const info = db.prepare(`
      INSERT INTO sentences (sentence, source, analysis_result, note, source_tag, is_favorite)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(cleanSentence, cleanSource, analysisResultStr, note || null, sourceTag || null);

    const inserted = db.prepare('SELECT * FROM sentences WHERE id = ?').get(info.lastInsertRowid) as any;
    res.status(201).json({
      ...inserted,
      analysis_result: inserted.analysis_result ? JSON.parse(inserted.analysis_result) : null
    });
  } catch (err: any) {
    console.error('Create sentence error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 4. 更新收藏 the sentence
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { note, analysisResult, sentence, sourceTag } = req.body;

  try {
    const db = getDb();
    
    const existing = db.prepare('SELECT * FROM sentences WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Sentence not found.' });
    }

    const newSentence = sentence !== undefined ? sentence.trim() : existing.sentence;
    
    // 如果句子发生改变，则把原有的 AI 分析结果重置为 null 避免数据不一致
    let analysisResultStr = existing.analysis_result;
    if (sentence !== undefined && sentence.trim() !== existing.sentence) {
      analysisResultStr = null;
    } else if (analysisResult !== undefined) {
      analysisResultStr = analysisResult ? JSON.stringify(analysisResult) : null;
    }

    const newNote = note !== undefined ? note : existing.note;
    const newSourceTag = sourceTag !== undefined ? sourceTag : existing.source_tag;

    db.prepare(`
      UPDATE sentences
      SET sentence = ?,
          note = ?,
          analysis_result = ?,
          source_tag = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newSentence, newNote, analysisResultStr, newSourceTag || null, id);

    const updated = db.prepare('SELECT * FROM sentences WHERE id = ?').get(id) as any;
    res.json({
      ...updated,
      analysis_result: updated.analysis_result ? JSON.parse(updated.analysis_result) : null
    });
  } catch (err: any) {
    console.error('Update sentence error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5. 取消收藏句子
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM sentences WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Sentence not found.' });
    }

    db.prepare('DELETE FROM sentences WHERE id = ?').run(id);
    res.json({ message: 'Sentence deleted successfully.', id: Number(id) });
  } catch (err: any) {
    console.error('Delete sentence error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
