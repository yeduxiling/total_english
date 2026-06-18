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
