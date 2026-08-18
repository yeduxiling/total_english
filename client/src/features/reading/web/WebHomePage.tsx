import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { safeFetchJson } from '../../../utils/api.js';
import ReadingNavTabs from '../ReadingNavTabs.js';
import './WebHomePage.css';

interface WebPageItem {
  id: string;
  url: string;
  title: string;
  byline: string | null;
  site_name: string | null;
  excerpt: string | null;
  cover_image: string | null;
  reading_progress: number;
  estimated_reading_minutes: number;
  last_read_at: string | null;
  created_at: string;
}

export default function WebHomePage() {
  const navigate = useNavigate();
  const [importMode, setImportMode] = useState<'url' | 'paste' | 'clipper'>('url');
  
  // URL 模式状态
  const [urlInput, setUrlInput] = useState('');
  
  // 粘贴模式状态
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');
  const [pasteSourceUrl, setPasteSourceUrl] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentPages, setRecentPages] = useState<WebPageItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // 加载最近阅读网页
  const fetchRecentPages = () => {
    setLoadingList(true);
    safeFetchJson<WebPageItem[]>('/api/webpages/recent')
      .then(setRecentPages)
      .catch(() => {})
      .finally(() => setLoadingList(false));
  };

  useEffect(() => {
    fetchRecentPages();
  }, []);

  // 1. URL 导入
  const handleImportByUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setLoading(true);
    setError('');

    try {
      const created = await safeFetchJson<WebPageItem>('/api/webpages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      setUrlInput('');
      navigate(`/reading/web/read/${created.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch webpage. For complex LMS or login-required pages, try "1-Click Expand & Copy"!');
    } finally {
      setLoading(false);
    }
  };

  // 2. 粘贴内容导入
  const handleImportByPaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteContent.trim()) return;

    setLoading(true);
    setError('');

    try {
      const created = await safeFetchJson<WebPageItem>('/api/webpages/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: pasteTitle.trim() || 'Custom Article',
          content: pasteContent.trim(),
          url: pasteSourceUrl.trim() || undefined,
        }),
      });

      setPasteTitle('');
      setPasteContent('');
      setPasteSourceUrl('');
      navigate(`/reading/web/read/${created.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create article from pasted content.');
    } finally {
      setLoading(false);
    }
  };

  // 监听富文本粘贴事件（自动保留复制的 HTML、图片以及自动提取标题）
  const handlePasteEvent = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html');
    const plainText = e.clipboardData.getData('text/plain');

    if (html && html.trim()) {
      e.preventDefault();
      setPasteContent(html);
    }

    // 智能提取第一行或 h1 作为标题
    if (!pasteTitle.trim()) {
      const firstLine = (plainText || '').trim().split('\n')[0];
      if (firstLine && firstLine.length < 100) {
        setPasteTitle(firstLine.replace(/^[#\s]+/, ''));
      }
    }
  };

  // 100% 绝对生效的“一键展开所有折叠手风琴并全自动复制”小工具脚本
  const expandAndCopyBookmarkletCode = `javascript:(function(){try{var count=0;document.querySelectorAll('details').forEach(function(d){d.setAttribute('open','true');count++;});document.querySelectorAll('[aria-expanded=\"false\"]').forEach(function(el){el.setAttribute('aria-expanded','true');el.removeAttribute('hidden');if(el.classList.contains('collapsed'))el.classList.remove('collapsed');if(el.classList.contains('collapse')&&!el.classList.contains('show'))el.classList.add('show');count++;});document.querySelectorAll('.accordion-body,.panel-collapse,.collapse,[data-accordion-content]').forEach(function(el){el.style.display='block';el.style.height='auto';count++;});var iframes=document.querySelectorAll('iframe');for(var i=0;i<iframes.length;i++){try{var doc=iframes[i].contentDocument||iframes[i].contentWindow.document;if(doc){doc.querySelectorAll('details').forEach(function(d){d.setAttribute('open','true');count++;});doc.querySelectorAll('[aria-expanded=\"false\"]').forEach(function(el){el.setAttribute('aria-expanded','true');count++;});doc.querySelectorAll('.accordion-body,.collapse').forEach(function(el){el.style.display='block';count++;});}}catch(e){}}var contentEl=document.querySelector('main,article,[role=\"main\"],#content,.course-content,.lesson-content,.content');if(!contentEl){for(var j=0;j<iframes.length;j++){try{var idoc=iframes[j].contentDocument||iframes[j].contentWindow.document;if(idoc){contentEl=idoc.querySelector('main,article,body')||idoc.body;break;}}catch(e){}}}if(!contentEl)contentEl=document.body;var sel=window.getSelection();var range=document.createRange();range.selectNodeContents(contentEl);sel.removeAllRanges();sel.addRange(range);var success=false;try{success=document.execCommand('copy');}catch(e){}sel.removeAllRanges();if(success){alert('🎉 成功！\\n已自动展开 '+count+' 处折叠手风琴，并完整复制了所有正文与图文内容！\\n\\n👉 现在请返回 Total English，在 \"Paste Content\" 框中按 Cmd+V (或 Ctrl+V) 粘贴即可！');}else{alert('✅ 页面已自动展开所有折叠手风琴！\\n请在网页上按 Cmd+A 全选并按 Cmd+C 复制，然后返回 Total English 粘贴！');}}catch(err){alert('❌ 操作异常: '+err.message);}})();`;

  return (
    <div className="web-home-page animate-in">
      {/* Header */}
      <div className="page-header">
        <div className="web-home-header">
          <div>
            <h1 className="page-title">
              <span className="page-title-icon">📚</span>
              Reading
            </h1>
            <p className="page-subtitle">Import web articles and read with AI-powered language tools</p>
          </div>
          <div className="web-home-actions">
            <span className="web-home-link" onClick={() => navigate('/reading/web/shelf')}>Article Collection</span>
          </div>
        </div>
      </div>

      {/* 二级页签 */}
      <ReadingNavTabs />

      {/* 导入卡片 (支持 URL / 展开复制工具 / 粘贴内容 3 种模式) */}
      <div className="web-import-card card">
        <div className="web-import-header-row">
          <div className="web-import-header-left">
            <span className="web-import-icon">🌐</span>
            <div>
              <h2 className="web-import-title">Import Web Article</h2>
              <p className="web-import-subtitle">Extract and read English content with full vocabulary lookup & sentence analysis</p>
            </div>
          </div>

          {/* 模式切换 */}
          <div className="web-mode-switch">
            <button
              type="button"
              className={`mode-switch-btn ${importMode === 'url' ? 'active' : ''}`}
              onClick={() => { setImportMode('url'); setError(''); }}
            >
              🔗 By URL
            </button>
            <button
              type="button"
              className={`mode-switch-btn ${importMode === 'clipper' ? 'active' : ''}`}
              onClick={() => { setImportMode('clipper'); setError(''); }}
            >
              ⚡ 1-Click Expand All (Shopify 课件助手)
            </button>
            <button
              type="button"
              className={`mode-switch-btn ${importMode === 'paste' ? 'active' : ''}`}
              onClick={() => { setImportMode('paste'); setError(''); }}
            >
              📋 Paste Content
            </button>
          </div>
        </div>

        {importMode === 'url' && (
          <form className="web-import-form" onSubmit={handleImportByUrl}>
            <div className="web-input-wrapper">
              <input
                type="url"
                className="web-url-input"
                placeholder="https://example.com/article..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="submit"
                className="btn btn-primary web-import-btn"
                disabled={loading || !urlInput.trim()}
              >
                {loading ? (
                  <>
                    <span className="btn-spinner" />
                    Extracting...
                  </>
                ) : (
                  'Import & Read'
                )}
              </button>
            </div>
            <p className="import-hint-text">
              💡 Best for publicly available blogs, Medium, Substack, News, Wikipedia, Tech docs, etc.
            </p>
          </form>
        )}

        {importMode === 'clipper' && (
          <div className="clipper-guide-panel">
            <div className="clipper-badge-box">
              <span className="clipper-step-number">Step 1 (只需拖动一次)</span>
              <p className="clipper-step-desc">
                将下方按钮拖拽至浏览器<strong>书签栏（Bookmarks Bar）</strong>：
              </p>
              <div className="clipper-draggable-wrap">
                <a
                  href={expandAndCopyBookmarkletCode}
                  className="clipper-bookmark-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    alert('请直接按住并拖动这个按钮到浏览器的书签栏 (Bookmarks Bar)！');
                  }}
                  title="Drag this button to your bookmark bar"
                >
                  ⚡ 展开全部手风琴并复制
                </a>
                <span className="clipper-drag-hint">← 按住鼠标左键拖到书签栏</span>
              </div>
            </div>

            <div className="clipper-steps-list">
              <div className="clipper-step-item">
                <span className="clipper-step-number">Step 2</span>
                <p className="clipper-step-desc">
                  打开 <strong>Shopify Academy 课程页面</strong>，点击书签栏上的 <strong>「⚡ 展开全部手风琴并复制」</strong>。
                  <br />
                  <span style={{ color: '#a5b4fc', fontSize: '12px' }}>
                    （它会弹出提示弹窗，并自动将所有折叠的手风琴<strong>全部强制展开</strong>并复制图文）
                  </span>
                </p>
              </div>
              <div className="clipper-step-item">
                <span className="clipper-step-number">Step 3</span>
                <p className="clipper-step-desc">
                  返回本页面，切换至右侧 <strong>「📋 Paste Content」</strong> 框中按 <strong>Cmd + V</strong> 粘贴，点击保存即可瞬间开始阅读！
                </p>
              </div>
            </div>
          </div>
        )}

        {importMode === 'paste' && (
          <form className="web-import-form" onSubmit={handleImportByPaste}>
            <div className="paste-form-fields">
              <input
                type="text"
                className="paste-title-input"
                placeholder="Article Title (e.g., Understanding CRO - Shopify Academy)"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                disabled={loading}
              />
              <textarea
                className="paste-content-textarea"
                placeholder="Paste the article text or webpage content here (supports rich HTML paste with pictures, lists, and tables)..."
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                onPaste={handlePasteEvent}
                rows={7}
                disabled={loading}
                required
              />
              <div className="paste-footer-row">
                <input
                  type="url"
                  className="paste-source-input"
                  placeholder="Optional Original URL (for reference)"
                  value={pasteSourceUrl}
                  onChange={(e) => setPasteSourceUrl(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="btn btn-primary web-import-btn"
                  disabled={loading || !pasteContent.trim()}
                >
                  {loading ? 'Creating...' : 'Save & Start Reading'}
                </button>
              </div>
            </div>
          </form>
        )}

        {error && <div className="web-error-alert">⚠️ {error}</div>}
      </div>

      {/* 最近阅读 Recent Reading */}
      <div className="web-home-section">
        <h2 className="web-home-section-title">Recently Reading</h2>

        {loadingList ? (
          <div className="web-home-loading">
            <span className="spinner" />
            <span>Loading articles...</span>
          </div>
        ) : recentPages.length === 0 ? (
          <div className="web-home-empty card">
            <div className="web-home-empty-icon">📰</div>
            <p className="web-home-empty-text">No web articles yet</p>
            <p className="web-home-empty-hint">Use URL import, Expand Tool, or paste content above to start reading</p>
          </div>
        ) : (
          <div className="web-home-recent-grid">
            {recentPages.map((page) => (
              <div
                key={page.id}
                className="web-card card"
                onClick={() => navigate(`/reading/web/read/${page.id}`)}
              >
                <div className="web-card-cover">
                  {page.cover_image ? (
                    <img src={page.cover_image} alt={page.title} />
                  ) : (
                    <div className="web-card-cover-placeholder">
                      <span>📰</span>
                    </div>
                  )}
                </div>
                <div className="web-card-info">
                  <span className="web-card-site">{page.site_name || 'Web Article'}</span>
                  <h3 className="web-card-title" title={page.title}>{page.title}</h3>
                  {page.byline && (
                    <p className="web-card-author" title={page.byline}>{page.byline}</p>
                  )}
                  <p className="web-card-status">Reading</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
