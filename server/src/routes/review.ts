import { Router } from 'express';
import { getDb } from '../db/init.js';

const router = Router();

// ===== 复习调度算法 =====

interface ChunkRow {
  meaning_id: string;
  word_id: number;
  word: string;
  phonetic: string;
  part_of_speech: string;
  contextual_meaning: string;
  synonyms: string;
  collocations: string;
  example_count: number;
  understand_count: number;
  confused_count: number;
  last_reviewed_at: string | null;
}

interface ScoredChunk extends ChunkRow {
  score: number;
}

/**
 * 计算每个 chunk（meaning）的复习权重
 *
 * score = base × decay × density
 *   base    = max(1, K - M)           // M = understand - confused, K = 10
 *   decay   = 1 + ln(1 + D)           // D = 距上次复习天数
 *   density = 1 + 0.3 × (E - 1)       // E = 例句数量
 */
function calculateScore(chunk: ChunkRow): number {
  const K = 10;
  const mastery = chunk.understand_count - chunk.confused_count;

  // base: 掌握度越高，base 越低（最低为 1）
  const base = Math.max(1, K - mastery);

  // decay: 距上次复习的天数（从未复习按 30 天计）
  let daysSinceReview = 30;
  if (chunk.last_reviewed_at) {
    const lastDate = new Date(chunk.last_reviewed_at + 'Z');
    const now = new Date();
    daysSinceReview = Math.max(0, (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    daysSinceReview = Math.min(daysSinceReview, 365); // 封顶 365 天
  }
  const decay = 1 + Math.log(1 + daysSinceReview);

  // density: 例句越多，权重越高
  const density = 1 + 0.3 * Math.max(0, chunk.example_count - 1);

  return base * decay * density;
}

/**
 * 加权随机选择：根据 score 作为权重，随机选一个 chunk
 */
function weightedRandomPick(chunks: ScoredChunk[]): ScoredChunk {
  const totalWeight = chunks.reduce((sum, c) => sum + c.score, 0);
  let random = Math.random() * totalWeight;
  for (const chunk of chunks) {
    random -= chunk.score;
    if (random <= 0) return chunk;
  }
  return chunks[chunks.length - 1]; // fallback
}

// ===== API 端点 =====

// GET /api/review/next — 获取下一个要复习的 chunk
router.get('/next', (_req, res) => {
  const db = getDb();

  // 查询所有有例句的 meaning，附带复习统计
  const chunks = db.prepare(`
    SELECT
      m.id AS meaning_id,
      w.id AS word_id,
      w.word,
      w.phonetic,
      w.part_of_speech,
      m.contextual_meaning,
      m.synonyms,
      m.collocations,
      (SELECT COUNT(*) FROM examples e WHERE e.meaning_id = m.id) AS example_count,
      COALESCE((SELECT COUNT(*) FROM review_logs r WHERE r.meaning_id = m.id AND r.action = 'understand'), 0) AS understand_count,
      COALESCE((SELECT COUNT(*) FROM review_logs r WHERE r.meaning_id = m.id AND r.action = 'confused'), 0) AS confused_count,
      (SELECT MAX(r.reviewed_at) FROM review_logs r WHERE r.meaning_id = m.id) AS last_reviewed_at
    FROM meanings m
    JOIN words w ON w.id = m.word_id
    WHERE (SELECT COUNT(*) FROM examples e WHERE e.meaning_id = m.id) > 0
  `).all() as ChunkRow[];

  if (chunks.length === 0) {
    return res.json({ empty: true, message: '词典中没有可复习的内容（需要有例句的词条）' });
  }

  // 计算权重并选择
  const scoredChunks: ScoredChunk[] = chunks.map(c => ({
    ...c,
    score: calculateScore(c),
  }));

  const selected = weightedRandomPick(scoredChunks);

  // 随机选一条该 chunk 的例句
  const examples = db.prepare(
    'SELECT id, sentence, source FROM examples WHERE meaning_id = ? ORDER BY RANDOM() LIMIT 1'
  ).all(selected.meaning_id) as { id: string; sentence: string; source: string | null }[];

  const example = examples[0];

  // 今日复习统计
  const todayStats = db.prepare(`
    SELECT COUNT(*) AS count FROM review_logs
    WHERE date(reviewed_at) = date('now')
  `).get() as { count: number };

  res.json({
    meaningId: selected.meaning_id,
    wordId: selected.word_id,
    word: selected.word,
    phonetic: selected.phonetic || '',
    partOfSpeech: selected.part_of_speech || '',
    contextualMeaning: selected.contextual_meaning,
    synonyms: selected.synonyms ? JSON.parse(selected.synonyms) : [],
    collocations: selected.collocations ? JSON.parse(selected.collocations) : [],
    sentence: example.sentence,
    exampleSource: example.source,
    totalChunks: chunks.length,
    reviewedToday: todayStats.count,
    stats: {
      understand: selected.understand_count,
      confused: selected.confused_count,
      lastReviewedAt: selected.last_reviewed_at,
    },
  });
});

// POST /api/review/log — 记录用户操作
router.post('/log', (req, res) => {
  const { meaningId, action } = req.body;

  if (!meaningId || !action) {
    return res.status(400).json({ error: '缺少 meaningId 或 action' });
  }
  if (action !== 'understand' && action !== 'confused') {
    return res.status(400).json({ error: 'action 必须是 understand 或 confused' });
  }

  const db = getDb();

  // 检查 meaning 是否存在
  const meaning = db.prepare('SELECT id FROM meanings WHERE id = ?').get(meaningId);
  if (!meaning) {
    return res.status(404).json({ error: '含义不存在' });
  }

  db.prepare('INSERT INTO review_logs (meaning_id, action) VALUES (?, ?)').run(meaningId, action);

  res.json({ success: true });
});

// GET /api/review/stats — 复习统计总览
router.get('/stats', (_req, res) => {
  const db = getDb();

  const total = db.prepare('SELECT COUNT(*) AS count FROM review_logs').get() as { count: number };
  const today = db.prepare(`
    SELECT COUNT(*) AS count FROM review_logs WHERE date(reviewed_at) = date('now')
  `).get() as { count: number };
  const understoodToday = db.prepare(`
    SELECT COUNT(*) AS count FROM review_logs
    WHERE date(reviewed_at) = date('now') AND action = 'understand'
  `).get() as { count: number };
  const confusedToday = db.prepare(`
    SELECT COUNT(*) AS count FROM review_logs
    WHERE date(reviewed_at) = date('now') AND action = 'confused'
  `).get() as { count: number };

  // 可复习的 chunk 总数
  const totalChunks = db.prepare(`
    SELECT COUNT(*) AS count FROM meanings m
    WHERE (SELECT COUNT(*) FROM examples e WHERE e.meaning_id = m.id) > 0
  `).get() as { count: number };

  res.json({
    totalReviews: total.count,
    reviewedToday: today.count,
    understoodToday: understoodToday.count,
    confusedToday: confusedToday.count,
    totalChunks: totalChunks.count,
  });
});

export default router;
