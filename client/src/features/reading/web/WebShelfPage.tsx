import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { safeFetchJson } from '../../../utils/api.js';
import './WebShelfPage.css';

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
  created_at: string;
}

export default function WebShelfPage() {
  const navigate = useNavigate();
  const [pages, setPages] = useState<WebPageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPages = () => {
    setLoading(true);
    safeFetchJson<WebPageItem[]>('/api/webpages')
      .then(setPages)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPages();
  }, []);

  const handleDelete = async (e: React.MouseEvent, pageId: string, pageTitle: string) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${pageTitle}"? This will remove the article and all associated highlights and notes.`)) {
      return;
    }
    setDeletingId(pageId);
    try {
      await safeFetchJson(`/api/webpages/${pageId}`, { method: 'DELETE' });
      setPages(prev => prev.filter(p => p.id !== pageId));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="web-shelf-page animate-in">
      {/* Header */}
      <div className="page-header">
        <div className="web-shelf-header">
          <div>
            <h1 className="page-title">
              <span className="page-title-icon">📂</span>
              Article Collection
            </h1>
            <p className="page-subtitle">{pages.length} {pages.length === 1 ? 'article' : 'articles'} in your collection</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/reading/web')}>
            + Import Article
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="web-shelf-loading">
          <span className="spinner" />
          <span>Loading collection...</span>
        </div>
      ) : pages.length === 0 ? (
        <div className="web-shelf-empty card">
          <div className="web-shelf-empty-icon">📰</div>
          <p className="web-shelf-empty-text">Your article collection is empty</p>
          <p className="web-shelf-empty-hint">Paste an English article link on the Internet Pages tab to get started</p>
          <button className="btn btn-primary" onClick={() => navigate('/reading/web')}>
            Import Your First Article
          </button>
        </div>
      ) : (
        <div className="web-shelf-grid">
          {pages.map(page => (
            <div
              key={page.id}
              className="shelf-web-card card"
              onClick={() => navigate(`/reading/web/read/${page.id}`)}
            >
              <div className="shelf-web-cover">
                {page.cover_image ? (
                  <img src={page.cover_image} alt={page.title} />
                ) : (
                  <div className="shelf-web-cover-placeholder">
                    <span>📰</span>
                  </div>
                )}
              </div>
              <div className="shelf-web-info">
                <span className="shelf-web-site">{page.site_name || 'Web Article'}</span>
                <h3 className="shelf-web-title" title={page.title}>{page.title}</h3>
                <p className="shelf-web-author" title={page.byline || ''}>{page.byline || 'Unknown author'}</p>
                <div className="shelf-web-meta">
                  <span className="shelf-web-readtime">{page.estimated_reading_minutes || 1} min read</span>
                  <button
                    className="shelf-web-delete"
                    onClick={(e) => handleDelete(e, page.id, page.title)}
                    disabled={deletingId === page.id}
                    title="Delete article"
                  >
                    {deletingId === page.id ? '...' : '×'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
