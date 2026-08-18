import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { safeFetchJson } from '../../utils/api.js';
import { getMainTitle } from '../../utils/bookTitle.js';
import ReadingNavTabs from '../reading/ReadingNavTabs.js';
import './BookHomePage.css';

interface Book {
  id: string;
  title: string;
  author: string;
  cover_path: string | null;
  last_location: string | null;
  last_read_at: string | null;
  total_locations: number | null;
  created_at: string;
}

export default function BookHomePage() {
  const navigate = useNavigate();
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    safeFetchJson<Book[]>('/api/books/recent')
      .then(setRecentBooks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="book-home-page animate-in">
      {/* Header */}
      <div className="page-header">
        <div className="book-home-header">
          <div>
            <h1 className="page-title">
              <span className="page-title-icon">📚</span>
              Reading
            </h1>
            <p className="page-subtitle">Read English books and build your vocabulary naturally</p>
          </div>
          <div className="book-home-actions">
            <span className="book-home-link" onClick={() => navigate('/reading/books/shelf')}>My Shelf</span>
            <span className="book-home-link-divider">·</span>
            <span className="book-home-link" onClick={() => navigate('/reading/books/upload')}>Upload Book</span>
          </div>
        </div>
      </div>

      {/* 二级页签 */}
      <ReadingNavTabs />

      {/* Recent Reading */}
      <div className="book-home-section">
        <h2 className="book-home-section-title">Recently Reading</h2>

        {loading ? (
          <div className="book-home-loading">
            <span className="spinner" />
            <span>Loading...</span>
          </div>
        ) : recentBooks.length === 0 ? (
          <div className="book-home-empty card">
            <div className="book-home-empty-icon">📖</div>
            <p className="book-home-empty-text">No books yet</p>
            <p className="book-home-empty-hint">Upload your first EPUB book to start reading</p>
            <button className="btn btn-primary" onClick={() => navigate('/book/upload')}>
              Upload Book
            </button>
          </div>
        ) : (
          <div className="book-home-recent-grid">
            {recentBooks.map(book => (
              <div
                key={book.id}
                className="book-card card"
                onClick={() => navigate(`/reading/books/read/${book.id}`)}
              >
                <div className="book-card-cover">
                  {book.cover_path ? (
                    <img src={`/api/books/${book.id}/cover`} alt={book.title} />
                  ) : (
                    <div className="book-card-cover-placeholder">
                      <span>📖</span>
                    </div>
                  )}
                </div>
                <div className="book-card-info">
                  <h3 className="book-card-title" title={book.title}>{getMainTitle(book.title)}</h3>
                  <p className="book-card-author" title={book.author}>{book.author}</p>
                  {book.last_read_at && (
                    <p className="book-card-status">Reading</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
