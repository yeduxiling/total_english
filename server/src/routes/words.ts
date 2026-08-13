import { Router } from 'express';
import { getDb } from '../db/init.js';
import { v4 as uuidv4 } from 'uuid';
import { generateAudio } from '../services/tts.js';

const router = Router();

// GET /api/words - 获取所有词汇
router.get('/', (_req, res) => {
  const db = getDb();
  const words = db.prepare(`
    SELECT * FROM words ORDER BY updated_at DESC
  `).all();

  // 为每个词附带含义和例句
  const getWordMeanings = db.prepare(`
    SELECT * FROM meanings WHERE word_id = ? ORDER BY created_at
  `);
  const getMeaningExamples = db.prepare(`
    SELECT * FROM examples WHERE meaning_id = ? ORDER BY added_at
  `);

  const result = words.map((w: any) => {
    const meanings = getWordMeanings.all(w.id).map((m: any) => {
      return {
        ...m,
        tags: [],
        synonyms: m.synonyms ? JSON.parse(m.synonyms) : [],
        collocations: m.collocations ? JSON.parse(m.collocations) : [],
        examples: getMeaningExamples.all(m.id),
      };
    });

    return {
      ...w,
      tags: [],
      meanings,
    };
  });

  res.json(result);
});

// GET /api/words/sources - 获取所有句子和例句的来源标签列表（频次降序）
router.get('/sources', (req, res) => {
  const db = getDb();
  try {
    const exampleSources = db.prepare(`
      SELECT source as name, COUNT(*) as count 
      FROM examples 
      WHERE source IS NOT NULL AND source != '' 
      GROUP BY source
    `).all() as any[];

    const sentenceSources = db.prepare(`
      SELECT source_tag as name, COUNT(*) as count 
      FROM sentences 
      WHERE source_tag IS NOT NULL AND source_tag != '' 
      GROUP BY source_tag
    `).all() as any[];

    const counts: Record<string, number> = {};
    [...exampleSources, ...sentenceSources].forEach(item => {
      counts[item.name] = (counts[item.name] || 0) + item.count;
    });

    const sortedSources = Object.keys(counts)
      .map(name => ({ name, count: counts[name] }))
      .sort((a, b) => b.count - a.count)
      .map(item => item.name);

    res.json(sortedSources);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/words/phonetic?word=xxx - 查询单个单词的音标
router.get('/phonetic', async (req, res) => {
  const { word } = req.query;
  if (!word || typeof word !== 'string' || word.trim() === '') {
    return res.status(400).json({ error: '缺少 word 参数' });
  }

  const cleanWord = word.trim();
  const db = getDb();
  
  // 1. 先从数据库查
  try {
    const wordEntry = db.prepare('SELECT phonetic FROM words WHERE word = ? COLLATE NOCASE LIMIT 1').get(cleanWord) as any;
    if (wordEntry && wordEntry.phonetic) {
      return res.json({ word: cleanWord, phonetic: wordEntry.phonetic });
    }
  } catch (dbErr: any) {
    console.warn('⚠️ SQLite phonetic query failed:', dbErr.message);
  }

  // 2. 如果数据库没有，调用大模型查询
  const modelConfig = db.prepare('SELECT * FROM model_configs WHERE is_active = 1').get() as any;
  if (!modelConfig) {
    return res.json({ word: cleanWord, phonetic: null });
  }

  const systemPrompt = `You are a helpful linguistic assistant. Provide the KK phonetic symbol for the given English word.
You MUST output strictly a JSON object with no markdown formatting and no extra text, matching this structure:
{
  "phonetic": "the KK phonetic symbol only, e.g. [æpl] or [dɪˈlɪʃəs] without external quotes"
}`;

  const userPrompt = `Word: "${cleanWord}"
Please output the KK phonetic symbol.`;

  const apiUrl = `${modelConfig.base_url.replace(/\/$/, '')}/chat/completions`;
  const requestBody = {
    model: modelConfig.model_id,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 1000,
  };

  try {
    const { callLlmWithRetry } = await import('../utils/llm.js');
    const { parseLlmResponse } = await import('../utils/json.js');
    
    const rawContent = await callLlmWithRetry({
      apiUrl,
      apiKey: modelConfig.api_key,
      requestBody,
    });

    const parsed = parseLlmResponse(rawContent) as any;
    const phonetic = parsed && parsed.phonetic ? parsed.phonetic : null;

    res.json({ word: cleanWord, phonetic });
  } catch (err: any) {
    console.error('⚠️ Get phonetic from LLM failed:', err.message);
    res.json({ word: cleanWord, phonetic: null });
  }
});

// GET /api/words/search?word=xxx - 按单词搜索
router.get('/search', (req, res) => {
  const { word } = req.query;
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: '缺少 word 参数' });
  }

  const db = getDb();
  const wordEntry = db.prepare('SELECT * FROM words WHERE word = ?').get(word);
  
  if (!wordEntry) {
    return res.json(null);
  }

  const meanings = db.prepare('SELECT * FROM meanings WHERE word_id = ?').all((wordEntry as any).id);
  const getMeaningExamples = db.prepare('SELECT * FROM examples WHERE meaning_id = ?');

  const populatedMeanings = meanings.map((m: any) => {
    return {
      ...m,
      tags: [],
      synonyms: m.synonyms ? JSON.parse(m.synonyms) : [],
      collocations: m.collocations ? JSON.parse(m.collocations) : [],
      examples: getMeaningExamples.all(m.id),
    };
  });

  const result = {
    ...(wordEntry as any),
    tags: [],
    meanings: populatedMeanings,
  };

  res.json(result);
});

// POST /api/words - 创建新词条
router.post('/', (req, res) => {
  const { word, phonetic, partOfSpeech, meaning, sentence, source } = req.body;
  if (!word || !meaning) {
    return res.status(400).json({ error: '缺少必要字段 word, meaning' });
  }

  const db = getDb();
  const meaningId = uuidv4();
  const exampleId = uuidv4();

  const insertWord = db.prepare(`
    INSERT INTO words (word, phonetic, part_of_speech) VALUES (?, ?, ?)
  `);
  const insertMeaning = db.prepare(`
    INSERT INTO meanings (id, word_id, contextual_meaning, synonyms, collocations, frequency_rating, frequency_note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertExample = db.prepare(`
    INSERT INTO examples (id, meaning_id, sentence, source) VALUES (?, ?, ?, ?)
  `);
  const insertVariant = db.prepare(`
    INSERT INTO meaning_variants (id, meaning_id, word, sentence, contextual_meaning, is_selected)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const transaction = db.transaction(() => {
    const wordResult = insertWord.run(word, phonetic || '', partOfSpeech || '');
    const wordId = wordResult.lastInsertRowid;

    insertMeaning.run(
      meaningId,
      wordId,
      meaning.contextualMeaning,
      JSON.stringify(meaning.synonyms || []),
      JSON.stringify(meaning.collocations || []),
      meaning.frequencyRating || 0,
      meaning.frequencyNote || ''
    );

    if (sentence) {
      insertExample.run(exampleId, meaningId, sentence, source || null);
    }

    // 保存第一个释义版本
    insertVariant.run(
      uuidv4(),
      meaningId,
      word,
      sentence || '',
      meaning.contextualMeaning
    );

    return wordId;
  });

  try {
    const wordId = transaction();
    res.status(201).json({ id: wordId, message: '词条创建成功' });

    // 后台异步生成 TTS 音频（不阻塞响应）
    generateAudio(Number(wordId), word).catch(err => {
      console.warn(`⚠️ TTS 音频生成失败 (word=${word}):`, err.message);
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/words/:id/meanings - 为已有词条追加含义
router.post('/:id/meanings', (req, res) => {
  const { id } = req.params;
  const { meaning, sentence, source } = req.body;

  if (!meaning) {
    return res.status(400).json({ error: '缺少 meaning 字段' });
  }

  const db = getDb();
  const meaningId = uuidv4();
  const exampleId = uuidv4();

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO meanings (id, word_id, contextual_meaning, synonyms, collocations, frequency_rating, frequency_note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      meaningId,
      id,
      meaning.contextualMeaning,
      JSON.stringify(meaning.synonyms || []),
      JSON.stringify(meaning.collocations || []),
      meaning.frequencyRating || 0,
      meaning.frequencyNote || ''
    );

    if (sentence) {
      db.prepare(`INSERT INTO examples (id, meaning_id, sentence, source) VALUES (?, ?, ?, ?)`)
        .run(exampleId, meaningId, sentence, source || null);
    }

    // 获取当前单词文本
    const wordRecord = db.prepare('SELECT word FROM words WHERE id = ?').get(id) as any;

    // 保存第一个释义版本
    db.prepare(`
      INSERT INTO meaning_variants (id, meaning_id, word, sentence, contextual_meaning, is_selected)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(
      uuidv4(),
      meaningId,
      wordRecord ? wordRecord.word : '',
      sentence || '',
      meaning.contextualMeaning
    );

    db.prepare(`UPDATE words SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
  });

  try {
    transaction();
    res.status(201).json({ meaningId, message: '含义追加成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/words/meanings/:meaningId/examples - 为已有含义添加例句
router.post('/meanings/:meaningId/examples', (req, res) => {
  const { meaningId } = req.params;
  const { sentence, source } = req.body;

  if (!sentence) {
    return res.status(400).json({ error: '缺少 sentence 字段' });
  }

  const db = getDb();
  const exampleId = uuidv4();

  const transaction = db.transaction(() => {
    db.prepare(`INSERT INTO examples (id, meaning_id, sentence, source) VALUES (?, ?, ?, ?)`).run(exampleId, meaningId, sentence, source || null);

    // 更新词条的 updated_at
    const meaning = db.prepare('SELECT word_id FROM meanings WHERE id = ?').get(meaningId) as any;
    if (meaning) {
      db.prepare('UPDATE words SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(meaning.word_id);
    }
  });

  try {
    transaction();
    res.status(201).json({ id: exampleId, message: '例句添加成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/words/:id - 删除词条
router.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    db.prepare('DELETE FROM words WHERE id = ?').run(req.params.id);
    res.json({ message: '词条删除成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/words/examples/:exampleId - 更新例句出处
router.put('/examples/:exampleId', (req, res) => {
  const { exampleId } = req.params;
  const { source } = req.body;
  const db = getDb();
  try {
    db.prepare('UPDATE examples SET source = ? WHERE id = ?').run(source || null, exampleId);
    res.json({ message: '例句出处已成功更新' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/words/meanings - 分页获取 meaning chunk 列表（以 meaning 为主单元）
router.get('/meanings', (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page as string)  || 1);
  const limit  = Math.min(50, parseInt(req.query.limit as string) || 20);
  const sort   = (req.query.sort   as string) || 'time-desc';
  const search = ((req.query.search as string) || '').trim();
  const filter = (req.query.filter as string) || 'all';
  const offset = (page - 1) * limit;

  const db = getDb();

  // 动态拼 WHERE
  const conditions: string[] = [];
  const params: any[]        = [];

  if (search) {
    conditions.push('(w.word LIKE ? OR m.contextual_meaning LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (filter === 'word')   conditions.push("w.word NOT LIKE '% %'");
  if (filter === 'phrase') conditions.push("w.word LIKE '% %'");

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const orderMap: Record<string, string> = {
    'time-desc':       'ORDER BY m.created_at DESC',
    'time-asc':        'ORDER BY m.created_at ASC',
    'alpha-asc':       'ORDER BY w.word ASC, m.created_at DESC',
    'alpha-desc':      'ORDER BY w.word DESC, m.created_at DESC',
    'encounters-desc': 'ORDER BY example_count DESC, m.created_at DESC',
  };
  const order = orderMap[sort] || orderMap['time-desc'];

  const coreSql = `
    FROM meanings m
    JOIN words w ON m.word_id = w.id
    LEFT JOIN examples e ON e.meaning_id = m.id
    ${where}
    GROUP BY m.id
  `;

  try {
    const total = (db.prepare(`SELECT COUNT(*) as c FROM (SELECT m.id ${coreSql})`)
      .get(...params) as any).c as number;

    const rows = db.prepare(`
      SELECT
        m.id          AS meaning_id,
        m.word_id,
        m.contextual_meaning,
        m.synonyms,
        m.collocations,
        m.created_at  AS meaning_created_at,
        w.word,
        w.phonetic,
        w.part_of_speech,
        COUNT(e.id)   AS example_count
      ${coreSql}
      ${order}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    const getExamples = db.prepare(
      'SELECT id, sentence, source, added_at FROM examples WHERE meaning_id = ? ORDER BY added_at'
    );

    const data = rows.map(r => ({
      meaning_id:        r.meaning_id,
      word_id:           r.word_id,
      word:              r.word,
      phonetic:          r.phonetic,
      part_of_speech:    r.part_of_speech,
      contextual_meaning: r.contextual_meaning,
      synonyms:          r.synonyms    ? JSON.parse(r.synonyms)    : [],
      collocations:      r.collocations ? JSON.parse(r.collocations) : [],
      example_count:     r.example_count,
      examples:          getExamples.all(r.meaning_id),
    }));

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/words/meanings/:meaningId - 删除单个 meaning（word 若孤立则一并删除）
router.delete('/meanings/:meaningId', (req, res) => {
  const { meaningId } = req.params;
  const db = getDb();
  try {
    const meaning = db.prepare('SELECT word_id FROM meanings WHERE id = ?').get(meaningId) as any;
    if (!meaning) return res.status(404).json({ error: 'Meaning not found' });

    const transaction = db.transaction(() => {
      // foreign_keys = ON + ON DELETE CASCADE 自动删除 examples / variants / review_logs
      db.prepare('DELETE FROM meanings WHERE id = ?').run(meaningId);

      // 若该词已无任何 meaning，则删掉 word
      const remaining = (db.prepare(
        'SELECT COUNT(*) as c FROM meanings WHERE word_id = ?'
      ).get(meaning.word_id) as any).c;
      if (remaining === 0) {
        db.prepare('DELETE FROM words WHERE id = ?').run(meaning.word_id);
      }
    });

    transaction();
    res.json({ message: 'Meaning deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/words/meanings/:meaningId/variants - 获取某含义的所有释义版本
router.get('/meanings/:meaningId/variants', (req, res) => {
  const db = getDb();
  try {
    const variants = db.prepare('SELECT * FROM meaning_variants WHERE meaning_id = ? ORDER BY created_at ASC').all(req.params.meaningId);
    res.json(variants);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/words/meanings/:meaningId/variants - 添加新的释义版本
router.post('/meanings/:meaningId/variants', (req, res) => {
  const { meaningId } = req.params;
  const { word, sentence, contextualMeaning } = req.body;
  
  if (!contextualMeaning) return res.status(400).json({ error: '缺少 contextualMeaning' });

  const db = getDb();
  const variantId = uuidv4();
  
  try {
    db.prepare(`
      INSERT INTO meaning_variants (id, meaning_id, word, sentence, contextual_meaning, is_selected)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(variantId, meaningId, word || '', sentence || '', contextualMeaning);
    
    res.status(201).json({ id: variantId, message: '释义版本添加成功' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/words/meanings/:meaningId/variants/:variantId/select - 选用指定的释义版本
router.put('/meanings/:meaningId/variants/:variantId/select', (req, res) => {
  const { meaningId, variantId } = req.params;
  const db = getDb();

  const transaction = db.transaction(() => {
    // 1. 将该含义下的所有版本设为未选中
    db.prepare('UPDATE meaning_variants SET is_selected = 0 WHERE meaning_id = ?').run(meaningId);
    
    // 2. 将指定版本设为选中
    db.prepare('UPDATE meaning_variants SET is_selected = 1 WHERE id = ?').run(variantId);
    
    // 3. 获取选中的释义文本
    const variant = db.prepare('SELECT contextual_meaning FROM meaning_variants WHERE id = ?').get(variantId) as any;
    if (variant) {
      // 4. 更新 meanings 表
      db.prepare('UPDATE meanings SET contextual_meaning = ? WHERE id = ?').run(variant.contextual_meaning, meaningId);
      
      // 5. 更新 words 表的 updated_at
      const meaning = db.prepare('SELECT word_id FROM meanings WHERE id = ?').get(meaningId) as any;
      if (meaning) {
        db.prepare('UPDATE words SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(meaning.word_id);
      }
    }
  });

  try {
    transaction();
    res.json({ message: '已选用该释义' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
