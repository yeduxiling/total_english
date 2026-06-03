import { Router } from 'express';
import { getDb } from '../db/init.js';
import { generateAudio, hasAudio, getAudioPath, generatePreviewAudio, ensureAudioDir } from '../services/tts.js';

const router = Router();

// 启动时确保音频目录存在
ensureAudioDir();

/**
 * GET /api/tts/preview?text=hello
 * 实时生成音频预览（不缓存，用于 Lookup 页面未保存的单词）
 */
router.get('/preview', async (req, res) => {
  const { text } = req.query;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: '缺少 text 参数' });
  }

  try {
    const audioBuffer = await generatePreviewAudio(text);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'no-cache',
    });
    res.send(audioBuffer);
  } catch (err: any) {
    console.error('⚠️ TTS 预览生成失败:', err.message);
    res.status(500).json({ error: 'TTS 生成失败: ' + err.message });
  }
});

/**
 * GET /api/tts/:wordId
 * 获取单词音频（有缓存直接返回，无缓存实时生成后返回）
 */
router.get('/:wordId', async (req, res) => {
  const wordId = parseInt(req.params.wordId, 10);
  if (isNaN(wordId)) {
    return res.status(400).json({ error: '无效的 wordId' });
  }

  // 1. 检查缓存
  if (hasAudio(wordId)) {
    const filePath = getAudioPath(wordId);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=31536000'); // 缓存一年
    return res.sendFile(filePath);
  }

  // 2. 从数据库查询单词文本
  const db = getDb();
  const word = db.prepare('SELECT word FROM words WHERE id = ?').get(wordId) as any;
  if (!word) {
    return res.status(404).json({ error: '单词不存在' });
  }

  // 3. 实时生成并缓存
  try {
    const filePath = await generateAudio(wordId, word.word);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=31536000');
    res.sendFile(filePath);
  } catch (err: any) {
    console.error(`⚠️ TTS 生成失败 (wordId=${wordId}):`, err.message);
    res.status(500).json({ error: 'TTS 生成失败: ' + err.message });
  }
});

/**
 * POST /api/tts/batch-generate
 * 批量为词典中没有音频的单词生成 TTS 音频
 */
router.post('/batch-generate', async (_req, res) => {
  const db = getDb();
  const words = db.prepare('SELECT id, word FROM words ORDER BY id').all() as any[];

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const w of words) {
    if (hasAudio(w.id)) {
      skipped++;
      continue;
    }

    try {
      await generateAudio(w.id, w.word);
      generated++;
      // 避免请求过快被限流，每个单词间隔 200ms
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err: any) {
      failed++;
      errors.push(`${w.word}: ${err.message}`);
      console.error(`⚠️ 批量生成失败 (${w.word}):`, err.message);
    }
  }

  res.json({
    total: words.length,
    generated,
    skipped,
    failed,
    errors: errors.slice(0, 10), // 最多返回前 10 个错误
  });
});

export default router;
