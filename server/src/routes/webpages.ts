import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/init.js';
import { parseWebArticle } from '../services/webParser.js';

export const webpagesRouter = Router();

/**
 * 0. 浏览器一键剪藏 (Web Clipper / Bookmarklet 接收接口)
 * POST /api/webpages/clip { title, contentHtml, url, byline?, siteName?, coverImage? }
 */
webpagesRouter.post('/clip', async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, contentHtml, url, byline, siteName, coverImage } = req.body;
    if (!contentHtml || typeof contentHtml !== 'string') {
      res.status(400).json({ error: 'Content HTML is required.' });
      return;
    }

    const { createCustomWebArticle } = await import('../services/webParser.js');
    const parsed = createCustomWebArticle(title || 'Clipped Article', contentHtml, url, byline);

    const db = getDb();
    const pageId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO web_pages (
        id, url, title, byline, site_name, excerpt, content_html, text_content, cover_image,
        reading_progress, estimated_reading_minutes, last_read_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      pageId,
      url || 'clip://' + pageId,
      parsed.title,
      parsed.byline,
      siteName || parsed.siteName,
      parsed.excerpt,
      parsed.contentHtml,
      parsed.textContent,
      coverImage || parsed.coverImage,
      parsed.estimatedReadingMinutes,
      now
    );

    const created = db.prepare('SELECT * FROM web_pages WHERE id = ?').get(pageId);
    
    // 如果是浏览器 Form 提交（用于绕过 HTTPS 混合内容限制），直接重定向至阅读器页面打开！
    const isFormSubmit = req.headers['content-type']?.includes('application/x-www-form-urlencoded') ||
                         req.headers['sec-fetch-mode'] === 'navigate';
    if (isFormSubmit) {
      res.redirect(`http://localhost:5173/reading/web/read/${pageId}`);
      return;
    }

    res.status(201).json(created);
  } catch (err: any) {
    console.error('Failed to clip webpage:', err);
    res.status(500).json({ error: err.message || 'Failed to save clipped webpage.' });
  }
});

/**
 * 1. 仅解析网页 (用于前端预览或校验)
 * POST /api/webpages/parse { url }
 */
webpagesRouter.post('/parse', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
      res.status(400).json({ error: 'Please provide a valid HTTP/HTTPS webpage URL.' });
      return;
    }

    const parsed = await parseWebArticle(url.trim());
    res.json(parsed);
  } catch (err: any) {
    console.error('Failed to parse webpage:', err);
    res.status(500).json({ error: err.message || 'Failed to parse webpage content.' });
  }
});

/**
 * 2. 导入并保存网页文章
 * POST /api/webpages { url, title?, byline?, ... }
 */
webpagesRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, title, byline, siteName, excerpt, contentHtml, textContent, coverImage, estimatedReadingMinutes } = req.body;
    if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
      res.status(400).json({ error: 'Please provide a valid HTTP/HTTPS webpage URL.' });
      return;
    }

    const db = getDb();
    const cleanUrl = url.trim();

    // 检查是否已经导入过该 URL
    const existing = db.prepare('SELECT * FROM web_pages WHERE url = ?').get(cleanUrl) as any;
    if (existing) {
      // 已经存在，更新阅读时间并直接返回已有记录
      const now = new Date().toISOString();
      db.prepare('UPDATE web_pages SET last_read_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(now, existing.id);
      res.json({ ...existing, last_read_at: now, isExisting: true });
      return;
    }

    // 如果未传已解析内容，则在此处抓取
    let articleData = {
      title: title || '',
      byline: byline || null,
      siteName: siteName || '',
      excerpt: excerpt || null,
      contentHtml: contentHtml || '',
      textContent: textContent || '',
      coverImage: coverImage || null,
      estimatedReadingMinutes: estimatedReadingMinutes || 1,
    };

    if (!articleData.contentHtml) {
      const parsed = await parseWebArticle(cleanUrl);
      articleData = {
        title: parsed.title,
        byline: parsed.byline,
        siteName: parsed.siteName,
        excerpt: parsed.excerpt,
        contentHtml: parsed.contentHtml,
        textContent: parsed.textContent,
        coverImage: parsed.coverImage,
        estimatedReadingMinutes: parsed.estimatedReadingMinutes,
      };
    }

    const pageId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO web_pages (
        id, url, title, byline, site_name, excerpt, content_html, text_content, cover_image,
        reading_progress, estimated_reading_minutes, last_read_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      pageId,
      cleanUrl,
      articleData.title,
      articleData.byline,
      articleData.siteName,
      articleData.excerpt,
      articleData.contentHtml,
      articleData.textContent,
      articleData.coverImage,
      articleData.estimatedReadingMinutes,
      now
    );

    const created = db.prepare('SELECT * FROM web_pages WHERE id = ?').get(pageId);
    res.status(201).json(created);
  } catch (err: any) {
    console.error('Failed to save webpage:', err);
    res.status(500).json({ error: err.message || 'Failed to save webpage article.' });
  }
});

/**
 * 2.1 直接保存用户粘贴的文本/富文本内容
 * POST /api/webpages/custom { title, content, url?, byline? }
 */
webpagesRouter.post('/custom', async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, content, url, byline } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'Article content cannot be empty.' });
      return;
    }

    const { createCustomWebArticle } = await import('../services/webParser.js');
    const parsed = createCustomWebArticle(title || 'Custom Article', content, url, byline);

    const db = getDb();
    const pageId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO web_pages (
        id, url, title, byline, site_name, excerpt, content_html, text_content, cover_image,
        reading_progress, estimated_reading_minutes, last_read_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      pageId,
      parsed.url || 'custom://' + pageId,
      parsed.title,
      parsed.byline,
      parsed.siteName,
      parsed.excerpt,
      parsed.contentHtml,
      parsed.textContent,
      parsed.coverImage,
      parsed.estimatedReadingMinutes,
      now
    );

    const created = db.prepare('SELECT * FROM web_pages WHERE id = ?').get(pageId);
    res.status(201).json(created);
  } catch (err: any) {
    console.error('Failed to save custom article:', err);
    res.status(500).json({ error: err.message || 'Failed to save custom article.' });
  }
});

/**
 * 3. 获取所有网页文章列表 (Collection)
 * GET /api/webpages
 */
webpagesRouter.get('/', (_req: Request, res: Response): void => {
  try {
    const db = getDb();
    const pages = db.prepare(`
      SELECT id, url, title, byline, site_name, excerpt, cover_image, reading_progress,
             estimated_reading_minutes, last_read_at, created_at
      FROM web_pages
      ORDER BY created_at DESC
    `).all();
    res.json(pages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. 获取最近阅读的网页文章
 * GET /api/webpages/recent
 */
webpagesRouter.get('/recent', (_req: Request, res: Response): void => {
  try {
    const db = getDb();
    const pages = db.prepare(`
      SELECT id, url, title, byline, site_name, excerpt, cover_image, reading_progress,
             estimated_reading_minutes, last_read_at, created_at
      FROM web_pages
      ORDER BY COALESCE(last_read_at, created_at) DESC
      LIMIT 6
    `).all();
    res.json(pages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. 获取单篇网页文章完整详情（含划线与想法）
 * GET /api/webpages/:id
 */
webpagesRouter.get('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const db = getDb();
    const page = db.prepare('SELECT * FROM web_pages WHERE id = ?').get(id) as any;
    if (!page) {
      res.status(404).json({ error: 'Article not found.' });
      return;
    }

    const highlights = db.prepare('SELECT * FROM web_page_highlights WHERE page_id = ? ORDER BY created_at ASC').all(id);
    const notes = db.prepare('SELECT * FROM web_page_notes WHERE page_id = ? ORDER BY created_at ASC').all(id);

    // 自动更新阅读时间
    const now = new Date().toISOString();
    db.prepare('UPDATE web_pages SET last_read_at = ? WHERE id = ?').run(now, id);

    res.json({
      page: { ...page, last_read_at: now },
      highlights,
      notes,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6. 更新阅读进度
 * PUT /api/webpages/:id/progress { progress }
 */
webpagesRouter.put('/:id/progress', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { progress } = req.body;
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE web_pages SET reading_progress = ?, last_read_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(typeof progress === 'number' ? progress : 0, now, id);
    res.json({ success: true, last_read_at: now });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. 删除网页文章
 * DELETE /api/webpages/:id
 */
webpagesRouter.delete('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const db = getDb();
    db.prepare('DELETE FROM web_pages WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 8. 划线高亮 CRUD
 */
webpagesRouter.post('/:id/highlights', (req: Request, res: Response): void => {
  try {
    const { id: pageId } = req.params;
    const { text, color, rangeInfo } = req.body;
    if (!text || !rangeInfo) {
      res.status(400).json({ error: 'Text and rangeInfo are required.' });
      return;
    }
    const highlightId = uuidv4();
    const db = getDb();
    db.prepare(`
      INSERT INTO web_page_highlights (id, page_id, text, color, range_info, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(highlightId, pageId, text.trim(), color || 'yellow', typeof rangeInfo === 'string' ? rangeInfo : JSON.stringify(rangeInfo));

    const created = db.prepare('SELECT * FROM web_page_highlights WHERE id = ?').get(highlightId);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

webpagesRouter.delete('/highlights/:highlightId', (req: Request, res: Response): void => {
  try {
    const { highlightId } = req.params;
    const db = getDb();
    db.prepare('DELETE FROM web_page_highlights WHERE id = ?').run(highlightId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 9. 想法笔记 CRUD
 */
webpagesRouter.post('/:id/notes', (req: Request, res: Response): void => {
  try {
    const { id: pageId } = req.params;
    const { highlightId, referencedText, content } = req.body;
    if (!content || !referencedText) {
      res.status(400).json({ error: 'Content and referencedText are required.' });
      return;
    }
    const noteId = uuidv4();
    const db = getDb();
    db.prepare(`
      INSERT INTO web_page_notes (id, page_id, highlight_id, referenced_text, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(noteId, pageId, highlightId || null, referencedText.trim(), content.trim());

    const created = db.prepare('SELECT * FROM web_page_notes WHERE id = ?').get(noteId);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

webpagesRouter.put('/notes/:noteId', (req: Request, res: Response): void => {
  try {
    const { noteId } = req.params;
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ error: 'Content is required.' });
      return;
    }
    const db = getDb();
    db.prepare('UPDATE web_page_notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(content.trim(), noteId);
    const updated = db.prepare('SELECT * FROM web_page_notes WHERE id = ?').get(noteId);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

webpagesRouter.delete('/notes/:noteId', (req: Request, res: Response): void => {
  try {
    const { noteId } = req.params;
    const db = getDb();
    db.prepare('DELETE FROM web_page_notes WHERE id = ?').run(noteId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
