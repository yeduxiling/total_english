import { Router } from 'express';
import { getDb } from '../db/init.js';

const router = Router();

// GET /api/tags — 聚合所有 source tag，统计每个 tag 下的 chunk 数和 sentence 数
router.get('/', (_req, res) => {
  const db = getDb();
  try {
    // 从 examples 表统计 chunk 数（按 source 分组）
    const exampleCounts = db.prepare(`
      SELECT source AS name, COUNT(DISTINCT meaning_id) AS chunk_count
      FROM examples
      WHERE source IS NOT NULL AND TRIM(source) != ''
      GROUP BY source
    `).all() as { name: string; chunk_count: number }[];

    // 从 sentences 表统计 sentence 数（按 source_tag 分组）
    const sentenceCounts = db.prepare(`
      SELECT source_tag AS name, COUNT(*) AS sentence_count
      FROM sentences
      WHERE source_tag IS NOT NULL AND TRIM(source_tag) != ''
      GROUP BY source_tag
    `).all() as { name: string; sentence_count: number }[];

    // 合并两张表的 tag，按名称聚合
    const tagMap = new Map<string, { chunk_count: number; sentence_count: number }>();

    for (const row of exampleCounts) {
      const entry = tagMap.get(row.name) ?? { chunk_count: 0, sentence_count: 0 };
      entry.chunk_count = row.chunk_count;
      tagMap.set(row.name, entry);
    }

    for (const row of sentenceCounts) {
      const entry = tagMap.get(row.name) ?? { chunk_count: 0, sentence_count: 0 };
      entry.sentence_count = row.sentence_count;
      tagMap.set(row.name, entry);
    }

    // 按 chunk_count 降序返回
    const result = Array.from(tagMap.entries())
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.chunk_count - a.chunk_count || a.name.localeCompare(b.name));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tags/rename — 将 oldName 重命名为 newName，同时更新 examples 和 sentences
router.put('/rename', (req, res) => {
  const { oldName, newName } = req.body as { oldName?: string; newName?: string };

  if (!oldName || !newName || !oldName.trim() || !newName.trim()) {
    return res.status(400).json({ error: 'Both oldName and newName are required' });
  }

  const trimmedOld = oldName.trim();
  const trimmedNew = newName.trim();

  if (trimmedOld === trimmedNew) {
    return res.status(400).json({ error: 'New name is the same as old name' });
  }

  const db = getDb();
  try {
    const transaction = db.transaction(() => {
      const updatedExamples = db.prepare(
        'UPDATE examples SET source = ? WHERE source = ?'
      ).run(trimmedNew, trimmedOld);

      const updatedSentences = db.prepare(
        'UPDATE sentences SET source_tag = ? WHERE source_tag = ?'
      ).run(trimmedNew, trimmedOld);

      return {
        examples: updatedExamples.changes,
        sentences: updatedSentences.changes,
      };
    });

    const counts = transaction();
    res.json({
      message: `Renamed "${trimmedOld}" → "${trimmedNew}"`,
      updated: counts,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
