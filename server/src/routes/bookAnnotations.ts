import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/init.js';

const router = Router();

// ==================== Highlights ====================

/**
 * GET /api/books/:id/highlights
 * 获取指定书籍的所有划线
 */
router.get('/:id/highlights', (req: Request, res: Response) => {
  const db = getDb();
  const highlights = db.prepare(
    'SELECT * FROM book_highlights WHERE book_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(highlights);
});

/**
 * POST /api/books/:id/highlights
 * 创建划线
 */
router.post('/:id/highlights', (req: Request, res: Response) => {
  const db = getDb();
  const { cfiRange, text, color, chapter, percentage } = req.body;

  if (!cfiRange || !text) {
    return res.status(400).json({ error: 'cfiRange and text are required' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO book_highlights (id, book_id, cfi_range, text, color, chapter, percentage)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, cfiRange, text, color || 'yellow', chapter || null, percentage || null);

  const highlight = db.prepare('SELECT * FROM book_highlights WHERE id = ?').get(id);
  res.json(highlight);
});

/**
 * PATCH /api/books/highlights/:highlightId
 * 修改划线颜色
 */
router.patch('/highlights/:highlightId', (req: Request, res: Response) => {
  const db = getDb();
  const { color } = req.body;
  if (!color) {
    return res.status(400).json({ error: 'color is required' });
  }

  const result = db.prepare('UPDATE book_highlights SET color = ? WHERE id = ?').run(color, req.params.highlightId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Highlight not found' });
  }

  const highlight = db.prepare('SELECT * FROM book_highlights WHERE id = ?').get(req.params.highlightId);
  res.json(highlight);
});

/**
 * DELETE /api/books/highlights/:highlightId
 * 删除划线
 */
router.delete('/highlights/:highlightId', (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM book_highlights WHERE id = ?').run(req.params.highlightId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Highlight not found' });
  }
  res.json({ message: 'Highlight deleted' });
});

// ==================== Bookmarks ====================

/**
 * GET /api/books/:id/bookmarks
 * 获取指定书籍的所有书签
 */
router.get('/:id/bookmarks', (req: Request, res: Response) => {
  const db = getDb();
  const bookmarks = db.prepare(
    'SELECT * FROM book_bookmarks WHERE book_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  res.json(bookmarks);
});

/**
 * POST /api/books/:id/bookmarks
 * 创建书签
 */
router.post('/:id/bookmarks', (req: Request, res: Response) => {
  const db = getDb();
  const { cfi, percentage } = req.body;

  if (!cfi) {
    return res.status(400).json({ error: 'cfi is required' });
  }

  // 自动生成书签编号
  const count = db.prepare(
    'SELECT COUNT(*) as count FROM book_bookmarks WHERE book_id = ?'
  ).get(req.params.id) as any;
  const label = `Bookmark ${(count?.count || 0) + 1}`;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO book_bookmarks (id, book_id, cfi, label, percentage)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.params.id, cfi, label, percentage || null);

  const bookmark = db.prepare('SELECT * FROM book_bookmarks WHERE id = ?').get(id);
  res.json(bookmark);
});

/**
 * DELETE /api/books/bookmarks/:bookmarkId
 * 删除书签
 */
router.delete('/bookmarks/:bookmarkId', (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM book_bookmarks WHERE id = ?').run(req.params.bookmarkId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Bookmark not found' });
  }
  res.json({ message: 'Bookmark deleted' });
});

// ==================== Notes ====================

/**
 * GET /api/books/:id/notes
 * 获取指定书籍的所有笔记
 */
router.get('/:id/notes', (req: Request, res: Response) => {
  const db = getDb();
  const notes = db.prepare(
    'SELECT * FROM book_notes WHERE book_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(notes);
});

/**
 * POST /api/books/:id/notes
 * 创建笔记（可选关联 highlight_id）
 */
router.post('/:id/notes', (req: Request, res: Response) => {
  const db = getDb();
  const { highlightId, cfi, referencedText, content, chapter, percentage } = req.body;

  if (!cfi || !referencedText || !content) {
    return res.status(400).json({ error: 'cfi, referencedText, and content are required' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO book_notes (id, book_id, highlight_id, cfi, referenced_text, content, chapter, percentage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, highlightId || null, cfi, referencedText, content, chapter || null, percentage || null);

  const note = db.prepare('SELECT * FROM book_notes WHERE id = ?').get(id);
  res.json(note);
});

/**
 * PUT /api/books/notes/:noteId
 * 编辑笔记
 */
router.put('/notes/:noteId', (req: Request, res: Response) => {
  const db = getDb();
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  const result = db.prepare(`
    UPDATE book_notes SET content = ?, updated_at = datetime('now') WHERE id = ?
  `).run(content, req.params.noteId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Note not found' });
  }

  const note = db.prepare('SELECT * FROM book_notes WHERE id = ?').get(req.params.noteId);
  res.json(note);
});

/**
 * DELETE /api/books/notes/:noteId
 * 删除笔记
 */
router.delete('/notes/:noteId', (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM book_notes WHERE id = ?').run(req.params.noteId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Note not found' });
  }
  res.json({ message: 'Note deleted' });
});

export default router;
