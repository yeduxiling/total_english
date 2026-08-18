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
      setError(err.message || 'Failed to fetch webpage. For complex LMS or login-required pages, try "1-Click Clipper" or "Paste Content"!');
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

  // 监听富文本粘贴事件（保留复制的图片和 HTML 标签）
  const handlePasteEvent = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (html && html.trim()) {
      e.preventDefault();
      setPasteContent(html);
    }
  };

  // 生成基于 Form 提交的 Bookmarklet 脚本代码 (彻底避开 HTTPS Mixed Content 限制，支持 iframe 与手风琴全展开)
  const bookmarkletCode = `javascript:(function(){try{function expandDoc(d){d.querySelectorAll('details').forEach(el=>el.setAttribute('open','true'));d.querySelectorAll('[aria-expanded=\"false\"]').forEach(el=>{el.setAttribute('aria-expanded','true');el.removeAttribute('hidden');if(el.classList.contains('collapsed'))el.classList.remove('collapsed');if(el.classList.contains('collapse')&&!el.classList.contains('show'))el.classList.add('show');});d.querySelectorAll('.accordion-body,.panel-collapse,.collapse,[data-accordion-content]').forEach(el=>{el.style.display='block';el.style.height='auto';});}expandDoc(document);document.querySelectorAll('iframe').forEach(ifr=>{try{if(ifr.contentDocument)expandDoc(ifr.contentDocument);}catch(e){}});let contentEl=document.querySelector('main,article,[role=\"main\"],#content,.course-content,.lesson-content,.content');if(!contentEl){const ifr=document.querySelector('#scorm_content_frame,#scorm-content-frame,iframe');try{if(ifr&&ifr.contentDocument){contentEl=ifr.contentDocument.querySelector('main,article,body')||ifr.contentDocument.body;}}catch(e){}}if(!contentEl)contentEl=document.body;const clone=contentEl.cloneNode(true);clone.querySelectorAll('script,style,noscript,nav,header,footer,.sidebar,#sidebar').forEach(el=>el.remove());clone.querySelectorAll('img').forEach(img=>{if(img.src)img.src=img.src;});const form=document.createElement('form');form.method='POST';form.action='http://localhost:3001/api/webpages/clip';form.target='_blank';form.style.display='none';function addField(name,val){const input=document.createElement('textarea');input.name=name;input.value=val||'';form.appendChild(input);}addField('title',document.title||'Clipped Article');addField('url',window.location.href);addField('contentHtml',clone.innerHTML);addField('siteName',window.location.hostname.replace(/^www\\./,''));document.body.appendChild(form);form.submit();setTimeout(()=>form.remove(),1000);}catch(e){alert('Clipper error: '+e.message);}})();`;

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

      {/* 导入卡片 (支持 URL / 1-Click Clipper / 粘贴内容 3 种模式) */}
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
              🚀 1-Click Clipper (LMS & 折叠)
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
              <span className="clipper-step-number">Step 1</span>
              <p className="clipper-step-desc">
                Drag this bookmark button to your browser's <strong>Bookmark Bar (书签栏)</strong> (just once):
              </p>
              <div className="clipper-draggable-wrap">
                <a
                  href={bookmarkletCode}
                  className="clipper-bookmark-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    alert('Please drag and drop this button to your browser bookmark bar (书签栏) to use it on any webpage!');
                  }}
                  title="Drag this button to your bookmark bar"
                >
                  🔖 Save to Total English
                </a>
                <span className="clipper-drag-hint">← Drag this to bookmarks bar</span>
              </div>
            </div>

            <div className="clipper-steps-list">
              <div className="clipper-step-item">
                <span className="clipper-step-number">Step 2</span>
                <p className="clipper-step-desc">
                  Open any complex page (like <strong>Shopify Academy, Coursera, or login-required course</strong>).
                </p>
              </div>
              <div className="clipper-step-item">
                <span className="clipper-step-number">Step 3</span>
                <p className="clipper-step-desc">
                  Click the <strong>"Save to Total English"</strong> bookmark! It will <strong>automatically expand all folded accordions, grab all images, and launch the reader instantly!</strong>
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
                rows={6}
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
            <p className="web-home-empty-hint">Use URL import, 1-Click Clipper, or paste content above to start reading</p>
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
