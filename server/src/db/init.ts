import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedDefaultPrompts } from './seeds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/total-english.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initDatabase(): void {
  const db = getDb();

  // 创建所有表
  db.exec(`
    -- 词汇主表
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      phonetic TEXT,
      part_of_speech TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);

    -- 含义表（一词多义）
    CREATE TABLE IF NOT EXISTS meanings (
      id TEXT PRIMARY KEY,
      word_id INTEGER NOT NULL,
      contextual_meaning TEXT NOT NULL,
      synonyms TEXT,
      collocations TEXT,
      frequency_rating INTEGER,
      frequency_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
    );

    -- 例句表
    CREATE TABLE IF NOT EXISTS examples (
      id TEXT PRIMARY KEY,
      meaning_id TEXT NOT NULL,
      sentence TEXT NOT NULL,
      source TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meaning_id) REFERENCES meanings(id) ON DELETE CASCADE
    );

    DROP TABLE IF EXISTS word_tags;
    DROP TABLE IF EXISTS meaning_tags;
    DROP TABLE IF EXISTS tags;

    -- 模型配置表
    CREATE TABLE IF NOT EXISTS model_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      model_id TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 提示词模板表
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      user_prompt TEXT NOT NULL,
      output_schema TEXT,
      version INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 提示词版本历史
    CREATE TABLE IF NOT EXISTS prompt_history (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      user_prompt TEXT NOT NULL,
      version INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES prompt_templates(id) ON DELETE CASCADE
    );

    -- 查询历史
    CREATE TABLE IF NOT EXISTS query_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL,
      sentence TEXT,
      result_json TEXT,
      queried_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 释义版本表（Reroll 历史）
    CREATE TABLE IF NOT EXISTS meaning_variants (
      id TEXT PRIMARY KEY,
      meaning_id TEXT,
      word TEXT NOT NULL,
      sentence TEXT NOT NULL,
      contextual_meaning TEXT NOT NULL,
      is_selected INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meaning_id) REFERENCES meanings(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_variants_meaning ON meaning_variants(meaning_id);

    CREATE TABLE IF NOT EXISTS review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meaning_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('understand', 'confused')),
      reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meaning_id) REFERENCES meanings(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_review_logs_meaning ON review_logs(meaning_id);

    -- 句子收藏与分析表
    CREATE TABLE IF NOT EXISTS sentences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sentence TEXT NOT NULL,
      source TEXT,
      analysis_result TEXT,
      note TEXT,
      is_favorite INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sentences_text ON sentences(sentence);

    -- 书籍主表
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      cover_path TEXT,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      total_locations INTEGER,
      last_location TEXT,
      last_read_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 书签表
    CREATE TABLE IF NOT EXISTS book_bookmarks (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      cfi TEXT NOT NULL,
      label TEXT,
      percentage REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_book_bookmarks_book ON book_bookmarks(book_id);

    -- 划线高亮表
    CREATE TABLE IF NOT EXISTS book_highlights (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      cfi_range TEXT NOT NULL,
      text TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'yellow',
      chapter TEXT,
      percentage REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_book_highlights_book ON book_highlights(book_id);

    -- 笔记/想法表
    CREATE TABLE IF NOT EXISTS book_notes (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      highlight_id TEXT,
      cfi TEXT NOT NULL,
      referenced_text TEXT NOT NULL,
      content TEXT NOT NULL,
      chapter TEXT,
      percentage REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (highlight_id) REFERENCES book_highlights(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_book_notes_book ON book_notes(book_id);

    -- 网页文章主表 (Web Articles / Internet Pages)
    CREATE TABLE IF NOT EXISTS web_pages (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      byline TEXT,
      site_name TEXT,
      excerpt TEXT,
      content_html TEXT NOT NULL,
      text_content TEXT,
      cover_image TEXT,
      reading_progress REAL DEFAULT 0,
      estimated_reading_minutes INTEGER DEFAULT 1,
      last_read_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_web_pages_url ON web_pages(url);
    CREATE INDEX IF NOT EXISTS idx_web_pages_last_read ON web_pages(last_read_at);

    -- 网页文章划线高亮表
    CREATE TABLE IF NOT EXISTS web_page_highlights (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      text TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'yellow',
      range_info TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (page_id) REFERENCES web_pages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_web_highlights_page ON web_page_highlights(page_id);

    -- 网页文章笔记/想法表
    CREATE TABLE IF NOT EXISTS web_page_notes (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      highlight_id TEXT,
      referenced_text TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (page_id) REFERENCES web_pages(id) ON DELETE CASCADE,
      FOREIGN KEY (highlight_id) REFERENCES web_page_highlights(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_web_notes_page ON web_page_notes(page_id);
  `);

  // 动态升级 sentences 表，添加 source_tag 字段
  try {
    db.exec('ALTER TABLE sentences ADD COLUMN source_tag TEXT;');
  } catch (e: any) {
    if (!e.message.includes('duplicate column name')) {
      throw e;
    }
  }

  // 插入种子数据
  seedDefaultPrompts(db);

  console.log('✅ 数据库初始化完成');
}
