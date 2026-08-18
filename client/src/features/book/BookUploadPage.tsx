import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './BookUploadPage.css';

type UploadStatus = 'idle' | 'uploading' | 'parsing' | 'success' | 'error';

interface UploadedBook {
  id: string;
  title: string;
  author: string;
  cover_path: string | null;
}

export default function BookUploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [uploadedBook, setUploadedBook] = useState<UploadedBook | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');

  const uploadFile = useCallback((file: File) => {
    // 校验文件类型
    if (!file.name.toLowerCase().endsWith('.epub')) {
      setError('Only .epub files are accepted');
      setStatus('error');
      return;
    }

    // 校验文件大小 (50MB)
    if (file.size > 50 * 1024 * 1024) {
      setError('File size exceeds 50MB limit');
      setStatus('error');
      return;
    }

    setSelectedFileName(file.name);
    setStatus('uploading');
    setProgress(0);
    setError('');
    setUploadedBook(null);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setProgress(pct);
        if (pct >= 100) {
          setStatus('parsing');
        }
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const response = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setStatus('success');
          setUploadedBook(response.book);
        } else {
          setStatus('error');
          setError(response.error || `Upload failed (HTTP ${xhr.status})`);
        }
      } catch {
        setStatus('error');
        setError('Failed to parse server response');
      }
    });

    xhr.addEventListener('error', () => {
      setStatus('error');
      setError('Network error — please check your connection');
    });

    xhr.open('POST', '/api/books/upload');
    xhr.send(formData);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // 重置 input 以允许重复上传相同文件
    e.target.value = '';
  }, [uploadFile]);

  const handleReset = () => {
    setStatus('idle');
    setProgress(0);
    setError('');
    setUploadedBook(null);
    setSelectedFileName('');
  };

  return (
    <div className="book-upload-page animate-in">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-title-icon">📤</span>
          Upload Book
        </h1>
        <p className="page-subtitle">Add EPUB books to your library</p>
      </div>

      {/* Upload zone */}
      <div className="book-upload-zone-wrapper card">
        {status === 'idle' && (
          <div
            className={`book-upload-dropzone ${dragOver ? 'drag-over' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="book-upload-dropzone-icon">📁</div>
            <p className="book-upload-dropzone-text">
              Drag and drop your EPUB file here
            </p>
            <p className="book-upload-dropzone-hint">
              or click to browse · Only .epub format · Max 50MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {(status === 'uploading' || status === 'parsing') && (
          <div className="book-upload-progress">
            <div className="book-upload-progress-icon">
              {status === 'uploading' ? '📤' : '🔍'}
            </div>
            <p className="book-upload-progress-filename">{selectedFileName}</p>
            <div className="book-upload-progress-bar">
              <div
                className="book-upload-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="book-upload-progress-text">
              {status === 'uploading'
                ? `Uploading... ${progress}%`
                : 'Parsing book metadata...'}
            </p>
          </div>
        )}

        {status === 'success' && uploadedBook && (
          <div className="book-upload-success">
            <div className="book-upload-success-preview">
              {uploadedBook.cover_path ? (
                <img
                  className="book-upload-success-cover"
                  src={`/api/books/${uploadedBook.id}/cover`}
                  alt={uploadedBook.title}
                />
              ) : (
                <div className="book-upload-success-cover-placeholder">📖</div>
              )}
              <div className="book-upload-success-info">
                <div className="book-upload-success-badge">✅ Upload successful</div>
                <h3 className="book-upload-success-title">{uploadedBook.title}</h3>
                <p className="book-upload-success-author">{uploadedBook.author}</p>
              </div>
            </div>
            <div className="book-upload-success-actions">
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/book/read/${uploadedBook.id}`)}
              >
                Start Reading
              </button>
              <button className="btn btn-secondary" onClick={handleReset}>
                Upload Another
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => navigate('/book/shelf')}
              >
                Go to Shelf
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="book-upload-error">
            <div className="book-upload-error-icon">⚠️</div>
            <p className="book-upload-error-text">{error}</p>
            <button className="btn btn-secondary" onClick={handleReset}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
