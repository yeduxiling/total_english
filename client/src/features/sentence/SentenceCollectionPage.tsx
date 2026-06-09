import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import SpeakButton from '../../components/SpeakButton/SpeakButton.js';
import './SentenceCollectionPage.css';



interface SentenceItem {
  id: number;
  sentence: string;
  source: string; // 'analysis' | 'manual'
  analysis_result: unknown;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export default function SentenceCollectionPage() {
  const [sentences, setSentences] = useState<SentenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 新建句子表单状态
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSentence, setNewSentence] = useState('');
  const [adding, setAdding] = useState(false);



  const fetchSentences = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sentences');
      if (!res.ok) {
        throw new Error('获取句子列表失败');
      }
      const data = await res.json();
      setSentences(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      await Promise.resolve();
      if (!ignore) {
        fetchSentences();
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, []);

  const handleAddSentence = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSentence.trim()) return;

    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/sentences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentence: newSentence.trim(),
          source: 'manual'
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to add sentence');
      }

      setNewSentence('');
      setShowAddForm(false);
      fetchSentences();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to remove this sentence from your collection?')) return;

    try {
      const res = await fetch(`/api/sentences/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to delete');
      }
      setSentences(sentences.filter(s => s.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };



  return (
    <div className="sentence-collection-page">
      <div className="collection-header">
        <div>
          <h1 className="page-title">Sentence Collection</h1>
          <p className="page-subtitle">Manage all your saved sentences.</p>
        </div>
        <button 
          className={`toggle-add-btn ${showAddForm ? 'active' : ''}`}
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? '✕ Cancel' : '＋ Add Sentence Manually'}
        </button>
      </div>

      {showAddForm && (
        <form className="add-sentence-card fade-in" onSubmit={handleAddSentence}>
          <h2 className="card-section-title">Add New Sentence</h2>
          <div className="form-group">
            <label htmlFor="new-sentence-input" className="field-label">English Sentence *</label>
            <textarea
              id="new-sentence-input"
              className="sentence-textarea"
              placeholder="Enter the sentence you want to save..."
              value={newSentence}
              onChange={(e) => setNewSentence(e.target.value)}
              required
              disabled={adding}
            />
          </div>
          <button className="submit-btn" type="submit" disabled={adding || !newSentence.trim()}>
            {adding ? 'Saving...' : 'Save Sentence'}
          </button>
        </form>
      )}

      {error && <div className="error-alert">⚠️ {error}</div>}

      {loading ? (
        <div className="loading-spinner-container">
          <div className="global-spinner" />
          <p>Loading collection...</p>
        </div>
      ) : sentences.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📂</div>
          <p className="empty-title">No Saved Sentences</p>
          <p className="empty-desc">You can analyze sentences on the "Analysis" page and save them, or add new ones here manually.</p>
        </div>
      ) : (
        <div className="sentence-list">
          {sentences.map((item) => (
            <div key={item.id} className="sentence-card">
              <div className="card-top-row">
                <div className="source-badges">
                  <span className={`source-badge ${item.source}`}>
                    {item.source === 'analysis' ? '⚡ AI Analysis' : '✍️ Manual'}
                  </span>
                </div>
                <div className="card-actions">
                  <SpeakButton text={item.sentence} size="sm" />
                  <button 
                    className="delete-card-btn"
                    onClick={() => handleDelete(item.id)}
                    title="Remove from collection"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className="card-sentence-body">
                <p className="main-sentence-text">{item.sentence}</p>
              </div>


            </div>
          ))}
        </div>
      )}
    </div>
  );
}
