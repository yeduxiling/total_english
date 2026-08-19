import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { safeFetchJson } from '../../../../utils/api.js';
import { extractSentenceContext } from '../../../../utils/sentenceExtractor.js';
import SelectionToolbar, { type HighlightColor, type SelectionPosition } from '../../../book/reader/SelectionToolbar.js';
import LookupPanel from '../../../book/reader/LookupPanel.js';
import SentenceAnalysisPanel from '../../../book/reader/SentenceAnalysisPanel.js';
import WriteNoteModal from '../../../book/reader/WriteNoteModal.js';
import './WebReaderPage.css';

interface WebPageDetail {
  id: string;
  url: string;
  title: string;
  byline: string | null;
  site_name: string | null;
  excerpt: string | null;
  content_html: string;
  cover_image: string | null;
  reading_progress: number;
  estimated_reading_minutes: number;
  last_read_at: string | null;
  created_at: string;
}

interface WebHighlight {
  id: string;
  page_id: string;
  text: string;
  color: HighlightColor;
  range_info: string;
  created_at: string;
}

interface WebNote {
  id: string;
  page_id: string;
  highlight_id: string | null;
  referenced_text: string;
  content: string;
  created_at: string;
  updated_at: string;
}

/**
 * 动态安全高亮注入器：将已保存的划线高亮无损编译进文章 HTML 文本节点中
 */
function applyHighlightsToHtml(rawHtml: string, highlights: WebHighlight[]): string {
  if (!rawHtml || !highlights || highlights.length === 0) return rawHtml;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // 按文字从长到短排序，防止子字符串误优先匹配
    const sortedHls = [...highlights].sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0));

    // 收集所有有效文本节点
    const textNodes: Text[] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parentTag = (node.parentElement?.tagName || '').toLowerCase();
      if (parentTag !== 'script' && parentTag !== 'style') {
        textNodes.push(node as Text);
      }
    }

    // 在文本节点中精准高亮匹配文字
    for (const hl of sortedHls) {
      if (!hl.text || hl.text.trim().length === 0) continue;
      const targetText = hl.text.trim();

      for (let i = 0; i < textNodes.length; i++) {
        const textNode = textNodes[i];
        const val = textNode.nodeValue || '';
        const idx = val.indexOf(targetText);

        if (idx !== -1) {
          const before = val.substring(0, idx);
          const match = val.substring(idx, idx + targetText.length);
          const after = val.substring(idx + targetText.length);

          const mark = doc.createElement('mark');
          mark.className = `web-reader-hl hl-${hl.color || 'yellow'}`;
          mark.setAttribute('data-hl-id', hl.id);
          mark.setAttribute('data-hl-color', hl.color || 'yellow');
          mark.textContent = match;

          const parent = textNode.parentNode;
          if (parent) {
            if (before) parent.insertBefore(doc.createTextNode(before), textNode);
            parent.insertBefore(mark, textNode);
            if (after) {
              const afterNode = doc.createTextNode(after);
              parent.insertBefore(afterNode, textNode);
              textNodes.push(afterNode);
            }
            parent.removeChild(textNode);
          }
          break;
        }
      }
    }

    return doc.body.innerHTML;
  } catch (err) {
    console.warn('Failed to apply highlights to HTML:', err);
    return rawHtml;
  }
}

export default function WebReaderPage() {
  const { id: pageId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [page, setPage] = useState<WebPageDetail | null>(null);
  const [highlights, setHighlights] = useState<WebHighlight[]>([]);
  const [notes, setNotes] = useState<WebNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 选区与语境
  const [selectedText, setSelectedText] = useState('');
  const [sentenceContext, setSentenceContext] = useState('');
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [selectionPosition, setSelectionPosition] = useState<SelectionPosition | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<'notes' | null>(null);

  // 弹窗状态
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  const contentContainerRef = useRef<HTMLDivElement>(null);
  const isMouseDownRef = useRef(false);

  // 1. 获取文章详情与标注
  const fetchArticle = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    setError('');
    try {
      const data = await safeFetchJson<{
        page: WebPageDetail;
        highlights: WebHighlight[];
        notes: WebNote[];
      }>(`/api/webpages/${pageId}`);

      setPage(data.page);
      setHighlights(data.highlights || []);
      setNotes(data.notes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load article.');
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  // 动态编译带高亮标签的正文 HTML
  const compiledContentHtml = useMemo(() => {
    if (!page?.content_html) return '';
    return applyHighlightsToHtml(page.content_html, highlights);
  }, [page?.content_html, highlights]);

  // 2. 选区检测与浮窗定位（智能提取单词所在的完整句子语境）
  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (!text) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      const posX = rect.left + rect.width / 2;
      const isTopEdge = rect.top < 130;
      const placement: 'top' | 'bottom' = isTopEdge ? 'bottom' : 'top';
      const posY = isTopEdge ? rect.bottom : rect.top;

      // 核心：智能提取包含选区单词的完整英文句子
      const fullSentence = extractSentenceContext(selection, text);

      setSelectedText(text);
      setSentenceContext(fullSentence);
      setActiveHighlightId(null);
      setSelectionPosition({ x: posX, y: posY, placement });
    }, 30);
  };

  const handleMouseDown = () => {
    isMouseDownRef.current = true;
    setSelectionPosition(null);
  };

  // 3. 点击已有划线唤起工具栏
  const handleContentClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const markEl = target.closest('mark.web-reader-hl, .web-reader-hl') as HTMLElement | null;

    if (markEl) {
      e.stopPropagation();
      const hlId = markEl.getAttribute('data-hl-id');
      const hlText = markEl.textContent || '';
      const matchedHl = highlights.find(h => h.id === hlId);

      const rect = markEl.getBoundingClientRect();
      const posX = rect.left + rect.width / 2;
      const isTopEdge = rect.top < 130;
      const placement: 'top' | 'bottom' = isTopEdge ? 'bottom' : 'top';
      const posY = isTopEdge ? rect.bottom : rect.top;

      // 从段落中提取句子语境
      const blockEl = markEl.closest('p, li, blockquote, div, h1, h2, h3, h4, h5, h6') as HTMLElement | null;
      const blockText = (blockEl?.textContent || '').replace(/\s+/g, ' ').trim();

      setSelectedText(hlText || matchedHl?.text || '');
      setSentenceContext(blockText || hlText);
      setActiveHighlightId(hlId || null);
      setSelectionPosition({ x: posX, y: posY, placement });
    }
  };

  // 4. 创建或更新划线高亮
  const handleCreateHighlight = async (color: HighlightColor) => {
    if (!pageId || !selectedText) return;

    try {
      if (activeHighlightId) {
        // 更新已有划线的颜色
        const updated = await safeFetchJson<WebHighlight>(`/api/webpages/highlights/${activeHighlightId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ color }),
        });
        setHighlights(prev => prev.map(h => h.id === activeHighlightId ? { ...h, color: updated.color || color } : h));
      } else {
        // 创建新划线
        const created = await safeFetchJson<WebHighlight>(`/api/webpages/${pageId}/highlights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: selectedText,
            color,
            rangeInfo: JSON.stringify({ timestamp: Date.now() }),
          }),
        });
        setHighlights(prev => [created, ...prev]);
      }

      setSelectionPosition(null);
      window.getSelection()?.removeAllRanges();
    } catch (err: any) {
      console.error('Failed to create/update highlight:', err);
    }
  };

  // 5. 删除划线
  const handleDeleteHighlight = async (hlId: string) => {
    try {
      await safeFetchJson(`/api/webpages/highlights/${hlId}`, { method: 'DELETE' });
      setHighlights(prev => prev.filter(h => h.id !== hlId));
      setSelectionPosition(null);
    } catch (err: any) {
      console.error('Failed to delete highlight:', err);
    }
  };

  // 6. 保存笔记
  const handleSaveNote = async (content: string) => {
    if (!pageId || !selectedText) return;
    try {
      const created = await safeFetchJson<WebNote>(`/api/webpages/${pageId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          highlightId: activeHighlightId || null,
          referencedText: selectedText,
          content,
        }),
      });

      setNotes(prev => [created, ...prev]);
      setShowNoteModal(false);
      setSelectionPosition(null);
    } catch (err: any) {
      console.error('Failed to save note:', err);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await safeFetchJson(`/api/webpages/notes/${noteId}`, { method: 'DELETE' });
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err: any) {
      console.error('Failed to delete note:', err);
    }
  };

  // 7. 从抽屉中点击高亮
  const handleDrawerHighlightClick = (hl: WebHighlight) => {
    // 页面滚动定位到该高亮文字
    if (contentContainerRef.current) {
      const markEl = contentContainerRef.current.querySelector(`mark[data-hl-id="${hl.id}"]`) as HTMLElement | null;
      if (markEl) {
        markEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const rect = markEl.getBoundingClientRect();
        const posX = rect.left + rect.width / 2;
        const isTopEdge = rect.top < 130;
        const placement: 'top' | 'bottom' = isTopEdge ? 'bottom' : 'top';
        const posY = isTopEdge ? rect.bottom : rect.top;

        const blockEl = markEl.closest('p, li, blockquote, div, h1, h2, h3, h4, h5, h6') as HTMLElement | null;
        setSelectedText(hl.text);
        setSentenceContext(blockEl?.textContent || hl.text);
        setActiveHighlightId(hl.id);
        setSelectionPosition({ x: posX, y: posY, placement });
      }
    }
  };

  return (
    <div className="web-reader-dark">
      {/* 顶部 Header */}
      <header className="reader-top-header">
        <div className="reader-header-left">
          <span className="reader-book-icon">🌐</span>
          <h1 className="reader-book-title" title={page?.title || 'Loading...'}>
            {page?.title || 'Loading...'}
          </h1>
        </div>

        <div className="reader-header-right">
          <span className="reader-nav-link" onClick={() => navigate('/reading/web')}>Home</span>
          <span className="reader-nav-divider">|</span>
          <span className="reader-nav-link" onClick={() => navigate('/reading/web/shelf')}>Collection</span>
        </div>
      </header>

      {/* 中央主阅读区 */}
      <div className="reader-main-stage">
        {loading && (
          <div className="reader-loading-cover">
            <span className="spinner" />
            <p>Loading article content...</p>
          </div>
        )}

        {error && (
          <div className="reader-error-cover">
            <span>⚠️</span>
            <p>{error}</p>
            <button className="btn btn-secondary" onClick={() => navigate('/reading/web')}>
              Back to Articles
            </button>
          </div>
        )}

        {page && !loading && (
          <div className="web-reader-card-container">
            {/* 文章元信息区 */}
            <div className="web-article-header">
              <span className="web-article-site-tag">{page.site_name || 'Web Article'}</span>
              <h1 className="web-article-title">{page.title}</h1>

              <div className="web-article-meta-row">
                {page.byline && <span className="web-article-byline">By {page.byline}</span>}
                <span className="web-article-readtime">⏱️ {page.estimated_reading_minutes || 1} min read</span>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="web-article-original-link"
                >
                  Original Source ↗
                </a>
              </div>
            </div>

            {/* 正文 HTML 渲染与选区捕获区 */}
            <div
              ref={contentContainerRef}
              className="web-article-content"
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onClick={handleContentClick}
              dangerouslySetInnerHTML={{ __html: compiledContentHtml }}
            />
          </div>
        )}

        {/* 右侧悬浮工具栏 (Notes & Highlights) */}
        <div className="reader-floating-sidebar">
          <button
            className={`floating-tool-btn ${activeDrawer === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveDrawer(activeDrawer === 'notes' ? null : 'notes')}
            title="Notes & Highlights"
          >
            <span className="tool-btn-icon">📝</span>
            <span className="tool-btn-text">Notes</span>
          </button>
        </div>
      </div>

      {/* 选中文字 / 点击已有划线浮动工具栏 */}
      {selectionPosition && (
        <SelectionToolbar
          selectedText={selectedText}
          cfiRange=""
          position={selectionPosition}
          highlightId={activeHighlightId}
          onClose={() => setSelectionPosition(null)}
          onHighlight={handleCreateHighlight}
          onDeleteHighlight={handleDeleteHighlight}
          onOpenNote={() => setShowNoteModal(true)}
          onLookupChunk={() => setShowLookupModal(true)}
          onAnalyzeSentence={() => setShowAnalysisModal(true)}
        />
      )}

      {/* 侧边划线与想法抽屉 */}
      {activeDrawer === 'notes' && (
        <div className="web-notes-drawer animate-in">
          <div className="drawer-header">
            <h3>Notes & Highlights ({highlights.length + notes.length})</h3>
            <button className="drawer-close-btn" onClick={() => setActiveDrawer(null)}>×</button>
          </div>

          <div className="drawer-body">
            {highlights.length === 0 && notes.length === 0 ? (
              <p className="drawer-empty-hint">No notes or highlights yet. Select text in the article to add!</p>
            ) : (
              <div className="drawer-notes-list">
                {highlights.map(hl => (
                  <div
                    key={hl.id}
                    className={`drawer-hl-item hl-${hl.color}`}
                    onClick={() => handleDrawerHighlightClick(hl)}
                  >
                    <div className="drawer-hl-top">
                      <span className="drawer-hl-badge">Highlight</span>
                      <button
                        className="drawer-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteHighlight(hl.id);
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                    <p className="drawer-hl-text">"{hl.text}"</p>
                  </div>
                ))}

                {notes.map(note => (
                  <div key={note.id} className="drawer-note-item">
                    <div className="drawer-note-top">
                      <span className="drawer-note-badge">Thought</span>
                      <button
                        className="drawer-delete-btn"
                        onClick={() => handleDeleteNote(note.id)}
                      >
                        🗑️
                      </button>
                    </div>
                    <p className="drawer-ref-text">Ref: "{note.referenced_text}"</p>
                    <p className="drawer-note-content">{note.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 写想法弹窗 */}
      <WriteNoteModal
        isOpen={showNoteModal}
        referencedText={selectedText}
        onClose={() => setShowNoteModal(false)}
        onSave={handleSaveNote}
      />

      {/* 语境查词 Lookup 弹窗 (传入真实完整的句子语境与单词) */}
      <LookupPanel
        isOpen={showLookupModal}
        selectedText={selectedText}
        sentenceContext={sentenceContext || selectedText}
        bookTitle={page?.title || 'Web Article'}
        onClose={() => setShowLookupModal(false)}
      />

      {/* 句子深度意群语法分析弹窗 (传入整句) */}
      <SentenceAnalysisPanel
        isOpen={showAnalysisModal}
        sentenceText={sentenceContext || selectedText}
        bookTitle={page?.title || 'Web Article'}
        onClose={() => setShowAnalysisModal(false)}
      />
    </div>
  );
}
