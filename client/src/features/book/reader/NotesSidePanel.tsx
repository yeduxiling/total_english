import { useState } from 'react';
import type { HighlightColor } from './SelectionToolbar.js';
import './NotesSidePanel.css';

export interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

export interface HighlightItem {
  id: string;
  cfi_range: string;
  text: string;
  color: HighlightColor;
  chapter?: string | null;
  percentage?: number | null;
  created_at: string;
}

export interface BookmarkItem {
  id: string;
  cfi: string;
  label: string;
  percentage?: number | null;
  created_at: string;
}

export interface NoteItem {
  id: string;
  cfi: string;
  referenced_text: string;
  content: string;
  chapter?: string | null;
  percentage?: number | null;
  created_at: string;
}

export type PanelType = 'toc' | 'bookmarks' | 'notes';

interface NotesSidePanelProps {
  isOpen: boolean;
  activePanel: PanelType;
  onClose: () => void;
  // 数据
  toc: TocItem[];
  highlights: HighlightItem[];
  bookmarks: BookmarkItem[];
  notes: NoteItem[];
  // 事件
  onNavigateCfi: (cfi: string) => void;
  onNavigateHref: (href: string) => void;
  onDeleteHighlight: (id: string) => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteNote: (id: string) => void;
}

export default function NotesSidePanel({
  isOpen,
  activePanel,
  onClose,
  toc,
  highlights,
  bookmarks,
  notes,
  onNavigateCfi,
  onNavigateHref,
  onDeleteHighlight,
  onDeleteBookmark,
  onDeleteNote,
}: NotesSidePanelProps) {
  // 划线与记录在 Notes 面板下的内部切换
  const [noteTab, setNoteTab] = useState<'highlights' | 'thoughts'>('highlights');
  // 划线颜色筛选
  const [colorFilter, setColorFilter] = useState<'all' | HighlightColor>('all');

  if (!isOpen) return null;

  const filteredHighlights = colorFilter === 'all'
    ? highlights
    : highlights.filter(h => h.color === colorFilter);

  return (
    <div className="reader-side-panel-overlay">
      <div className="reader-side-panel">
        {/* Panel Header */}
        <div className="panel-header">
          <h3 className="panel-title">
            {activePanel === 'toc' && '📑 Table of Contents'}
            {activePanel === 'bookmarks' && '🔖 Bookmarks'}
            {activePanel === 'notes' && '📝 Notes & Highlights'}
          </h3>
          <button className="panel-close-btn" onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </div>

        {/* Panel Content */}
        <div className="panel-body">
          {/* ================= 1. 目录 (TOC) ================= */}
          {activePanel === 'toc' && (
            <div className="toc-list">
              {toc.length === 0 ? (
                <div className="panel-empty">No table of contents available</div>
              ) : (
                toc.map((item, idx) => (
                  <div
                    key={idx}
                    className="toc-item"
                    onClick={() => {
                      onNavigateHref(item.href);
                      onClose();
                    }}
                  >
                    <span className="toc-label">{item.label.trim() || `Chapter ${idx + 1}`}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ================= 2. 书签 (Bookmarks) ================= */}
          {activePanel === 'bookmarks' && (
            <div className="bookmarks-list">
              {bookmarks.length === 0 ? (
                <div className="panel-empty">
                  No bookmarks yet. Hover over the top-right corner to add a bookmark.
                </div>
              ) : (
                bookmarks.map((bm) => (
                  <div
                    key={bm.id}
                    className="bookmark-card"
                    onClick={() => {
                      onNavigateCfi(bm.cfi);
                      onClose();
                    }}
                  >
                    <div className="bookmark-info">
                      <div className="bookmark-title-row">
                        <span className="bookmark-label">{bm.label}</span>
                        {bm.percentage !== null && bm.percentage !== undefined && (
                          <span className="bookmark-percentage">
                            {Math.round(bm.percentage * 100)}%
                          </span>
                        )}
                      </div>
                      <span className="bookmark-date">
                        {new Date(bm.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      className="panel-item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBookmark(bm.id);
                      }}
                      title="Delete bookmark"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ================= 3. 笔记与划线 (Notes) ================= */}
          {activePanel === 'notes' && (
            <div className="notes-panel-content">
              {/* 子 Tab 切换：划线 / 记录 */}
              <div className="notes-subtabs">
                <button
                  className={`subtab-btn ${noteTab === 'highlights' ? 'active' : ''}`}
                  onClick={() => setNoteTab('highlights')}
                >
                  Highlights ({highlights.length})
                </button>
                <button
                  className={`subtab-btn ${noteTab === 'thoughts' ? 'active' : ''}`}
                  onClick={() => setNoteTab('thoughts')}
                >
                  Thoughts ({notes.length})
                </button>
              </div>

              {/* --- 划线部分 --- */}
              {noteTab === 'highlights' && (
                <div className="highlights-section">
                  {/* 颜色筛选条 */}
                  <div className="color-filter-bar">
                    <button
                      className={`filter-chip ${colorFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setColorFilter('all')}
                    >
                      All ({highlights.length})
                    </button>
                    <button
                      className={`filter-dot-btn ${colorFilter === 'yellow' ? 'active' : ''}`}
                      onClick={() => setColorFilter('yellow')}
                      title="Yellow"
                    >
                      <span className="color-dot color-yellow" />
                    </button>
                    <button
                      className={`filter-dot-btn ${colorFilter === 'green' ? 'active' : ''}`}
                      onClick={() => setColorFilter('green')}
                      title="Green"
                    >
                      <span className="color-dot color-green" />
                    </button>
                    <button
                      className={`filter-dot-btn ${colorFilter === 'blue' ? 'active' : ''}`}
                      onClick={() => setColorFilter('blue')}
                      title="Blue"
                    >
                      <span className="color-dot color-blue" />
                    </button>
                    <button
                      className={`filter-dot-btn ${colorFilter === 'pink' ? 'active' : ''}`}
                      onClick={() => setColorFilter('pink')}
                      title="Pink"
                    >
                      <span className="color-dot color-pink" />
                    </button>
                  </div>

                  {/* 划线列表 */}
                  <div className="highlights-list">
                    {filteredHighlights.length === 0 ? (
                      <div className="panel-empty">No highlights found</div>
                    ) : (
                      filteredHighlights.map((hl) => (
                        <div
                          key={hl.id}
                          className={`highlight-card hl-border-${hl.color}`}
                          onClick={() => {
                            onNavigateCfi(hl.cfi_range);
                            onClose();
                          }}
                        >
                          <div className="highlight-text-wrap">
                            <p className="highlight-text font-english">“{hl.text}”</p>
                            {hl.chapter && (
                              <span className="highlight-chapter">{hl.chapter}</span>
                            )}
                          </div>
                          <button
                            className="panel-item-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteHighlight(hl.id);
                            }}
                            title="Delete highlight"
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* --- 记录/想法部分 --- */}
              {noteTab === 'thoughts' && (
                <div className="thoughts-section">
                  <div className="thoughts-list">
                    {notes.length === 0 ? (
                      <div className="panel-empty">No thoughts written yet</div>
                    ) : (
                      notes.map((note) => (
                        <div
                          key={note.id}
                          className="thought-card"
                          onClick={() => {
                            onNavigateCfi(note.cfi);
                            onClose();
                          }}
                        >
                          {/* 评论对象/原文引用 */}
                          <div className="thought-quote">
                            <p className="thought-quote-text font-english">
                              {note.referenced_text}
                            </p>
                          </div>

                          {/* 记录内容 */}
                          <div className="thought-content">
                            <p className="thought-body">{note.content}</p>
                            <span className="thought-date">
                              {new Date(note.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          <button
                            className="panel-item-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteNote(note.id);
                            }}
                            title="Delete note"
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
