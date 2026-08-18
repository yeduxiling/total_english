import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { safeFetchJson } from '../../utils/api.js';
import { getMainTitle } from '../../utils/bookTitle.js';
import './BookShelfPage.css';

interface Book {
  id: string;
  title: string;
  author: string;
  cover_path: string | null;
  file_size: number;
  last_read_at: string | null;
  created_at: string;
}

export default function BookShelfPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchBooks = () => {
    setLoading(true);
    safeFetchJson<Book[]>('/api/books')
      .then(setBooks)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBooks(); }, []);

  const handleDelete = async (e: React.MouseEvent, bookId: string, bookTitle: string) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${bookTitle}"? This will remove the book and all its highlights, bookmarks, and notes.`)) {
      return;
    }
    setDeletingId(bookId);
    try {
      await safeFetchJson(`/api/books/${bookId}`, { method: 'DELETE' });
      setBooks(prev => prev.filter(b => b.id !== bookId));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="book-shelf-page animate-in">
      {/* Header */}
      <div className="page-header">
        <div className="book-shelf-header">
          <div>
            <h1 className="page-title">
              <span className="page-title-icon">📚</span>
              My Shelf
            </h1>
            <p className="page-subtitle">{books.length} {books.length === 1 ? 'book' : 'books'} in your library</p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/book/upload')}>
            Upload Book
          </button>
        </div>
      </div>

      {/* Book grid */}
      {loading ? (
        <div className="book-shelf-loading">
          <span className="spinner" />
          <span>Loading shelf...</span>
        </div>
      ) : books.length === 0 ? (
        <div className="book-shelf-empty card">
          <div className="book-shelf-empty-icon">📖</div>
          <p className="book-shelf-empty-text">Your shelf is empty</p>
          <p className="book-shelf-empty-hint">Upload an EPUB book to get started</p>
          <button className="btn btn-primary" onClick={() => navigate('/book/upload')}>
            Upload Your First Book
          </button>
        </div>
      ) : (
        <div className="book-shelf-grid">
          {books.map(book => (
            <div
              key={book.id}
              className="shelf-book-card card"
              onClick={() => navigate(`/book/read/${book.id}`)}
            >
              <div className="shelf-book-cover">
                {book.cover_path ? (
                  <img src={`/api/books/${book.id}/cover`} alt={book.title} />
                ) : (
                  <div className="shelf-book-cover-placeholder">
                    <span>📖</span>
                  </div>
                )}
              </div>
              <div className="shelf-book-info">
                <h3 className="shelf-book-title" title={book.title}>{getMainTitle(book.title)}</h3>
                <p className="shelf-book-author" title={book.author}>{book.author}</p>
                <div className="shelf-book-meta">
                  <span className="shelf-book-size">{formatSize(book.file_size)}</span>
                  <button
                    className="shelf-book-delete"
                    onClick={(e) => handleDelete(e, book.id, book.title)}
                    disabled={deletingId === book.id}
                    title="Delete book"
                  >
                    {deletingId === book.id ? '...' : '×'}
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
