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
  const [importMode, setImportMode] = useState<'url' | 'extension' | 'paste'>('url');
  
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
      setError(err.message || 'Failed to fetch webpage. For protected LMS or login-required pages, use the Browser Extension or Paste Content!');
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

    // 智能提取第一行作为标题
    if (!pasteTitle.trim()) {
      const firstLine = (plainText || '').trim().split('\n')[0];
      if (firstLine && firstLine.length < 100) {
        setPasteTitle(firstLine.replace(/^[#\s]+/, ''));
      }
    }
  };

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

      {/* 导入卡片 (支持 By URL / Browser Extension / Paste Content 3 种模式) */}
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
              className={`mode-switch-btn ${importMode === 'extension' ? 'active' : ''}`}
              onClick={() => { setImportMode('extension'); setError(''); }}
            >
              ⚡ Browser Extension
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
              💡 Works great for public blogs, Medium, Substack, News, Wikipedia, Tech articles, etc.
            </p>
          </form>
        )}

        {importMode === 'extension' && (
          <div className="clipper-guide-panel">
            <div className="clipper-badge-box">
              <div className="clipper-badge-top-row">
                <span className="clipper-step-badge">🚀 1-Click Web Clipper Extension</span>
                <a
                  href="/api/webpages/extension/download"
                  download="total-english-clipper.zip"
                  className="clipper-download-btn"
                >
                  ⬇️ Download Extension (.zip)
                </a>
              </div>
              <p className="clipper-step-desc">
                Ideal for interactive course platforms (like <strong>Shopify Academy, Coursera, Skilljar</strong>) and login-required pages. The extension automatically penetrates iframes, expands all folded accordions, and clips full articles with pictures in one click.
              </p>
            </div>

            <div className="clipper-steps-list">
              <div className="clipper-step-item">
                <span className="clipper-step-number">Step 1</span>
                <p className="clipper-step-desc">
                  Click the button above to <strong>download and unzip</strong> <code>total-english-clipper.zip</code> on your computer.
                </p>
              </div>
              <div className="clipper-step-item">
                <span className="clipper-step-number">Step 2</span>
                <p className="clipper-step-desc">
                  Open Chrome or Edge, go to <code>chrome://extensions</code>, and turn on <strong>Developer mode</strong> in the top-right corner.
                </p>
              </div>
              <div className="clipper-step-item">
                <span className="clipper-step-number">Step 3</span>
                <p className="clipper-step-desc">
                  Click <strong>Load unpacked</strong> in the top-left corner, and select the unzipped folder.
                </p>
              </div>
              <div className="clipper-step-item">
                <span className="clipper-step-number">Step 4</span>
                <p className="clipper-step-desc">
                  Open any course or article page, click the <strong>Total English Web Clipper</strong> icon in your browser toolbar, and it will immediately open in the reader!
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
            <p className="web-home-empty-hint">Use URL import, Browser Extension, or paste content above to start reading</p>
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
