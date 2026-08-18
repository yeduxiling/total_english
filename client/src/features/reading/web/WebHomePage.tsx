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
  const [urlInput, setUrlInput] = useState('');
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

  // 提交 URL 导入并直接进入阅读
  const handleImportAndRead = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
      setError(err.message || 'Failed to fetch and parse webpage. Please check the URL.');
    } finally {
      setLoading(false);
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

      {/* URL 粘贴导入卡片 */}
      <div className="web-import-card card">
        <div className="web-import-header">
          <span className="web-import-icon">🌐</span>
          <div>
            <h2 className="web-import-title">Import Web Article</h2>
            <p className="web-import-subtitle">Paste any article link (Medium, BBC, Substack, Tech blogs, etc.)</p>
          </div>
        </div>

        <form className="web-import-form" onSubmit={handleImportAndRead}>
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
        </form>

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
            <p className="web-home-empty-hint">Paste an English article URL above to start reading</p>
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
