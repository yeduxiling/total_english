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
