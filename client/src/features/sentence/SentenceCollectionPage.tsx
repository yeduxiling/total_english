import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import SpeakButton from '../../components/SpeakButton/SpeakButton.js';
import './SentenceCollectionPage.css';

interface Chunk {
  label: string;
  text: string;
  explanation: string;
  level: number;
}

interface AnalysisData {
  chunks: Chunk[];
  overallMeaning: string;
}

interface SentenceItem {
  id: number;
  sentence: string;
  source: string; // 'analysis' | 'manual'
  analysis_result: AnalysisData | null;
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

  // 单条句子原位 AI 分析 loading 状态 (以 id 为 key)
  const [analyzingIds, setAnalyzingIds] = useState<{ [key: number]: boolean }>({});

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

  const handleInlineAnalyze = async (id: number, text: string) => {
    setAnalyzingIds(prev => ({ ...prev, [id]: true }));
    try {
      const analyzeRes = await fetch('/api/sentences/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: text }),
      });

      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json();
        throw new Error(errData.error || 'AI analysis failed');
      }

      const analyzeData = await analyzeRes.json();
      const analysisResult = analyzeData.analysis;

      const saveRes = await fetch(`/api/sentences/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisResult }),
      });

      if (!saveRes.ok) {
        throw new Error('Failed to update analysis in database');
      }

      setSentences(sentences.map(s => {
        if (s.id === id) {
          return { ...s, analysis_result: analysisResult };
        }
        return s;
      }));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  const getBadgeColorClass = (label: string): string => {
    const l = label.toLowerCase();
    if (l.includes('prohibition') || l.includes('negation') || l.includes('avoid')) return 'badge-danger';
    if (l.includes('core') || l.includes('action') || l.includes('subject')) return 'badge-primary';
    if (l.includes('condition') || l.includes('if') || l.includes('unless')) return 'badge-warning';
    if (l.includes('purpose') || l.includes('consequence') || l.includes('result')) return 'badge-info';
    if (l.includes('context') || l.includes('location') || l.includes('time')) return 'badge-success';
    return 'badge-secondary';
  };

  return (
    <div className="sentence-collection-page">
      <div className="collection-header">
        <div>
          <h1 className="page-title">Sentence Collection</h1>
          <p className="page-subtitle">Manage all your saved sentences and their AI analyses.</p>
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

              {item.analysis_result ? (
                <div className="card-analysis-result">
                  <div className="inline-chunk-list">
                    {item.analysis_result.chunks.map((chunk, idx) => (
                      <div key={idx} className={`inline-chunk-item ${chunk.level > 0 ? 'inline-sub' : ''}`}>
                        <div className="inline-chunk-details">
                          <div className="inline-chunk-top">
                            <span className={`chunk-badge ${getBadgeColorClass(chunk.label)}`}>
                              {chunk.label}
                            </span>
                            <span className="inline-chunk-text">{chunk.text}</span>
                          </div>
                          <span className="inline-chunk-explanation">{chunk.explanation}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="inline-overall-meaning">
                    <strong>Meaning: </strong>
                    <span>{item.analysis_result.overallMeaning}</span>
                  </div>
                </div>
              ) : (
                <div className="no-analysis-placeholder">
                  <span className="placeholder-text">This sentence has not been analyzed yet.</span>
                  <button
                    className={`inline-analyze-btn ${analyzingIds[item.id] ? 'loading' : ''}`}
                    onClick={() => handleInlineAnalyze(item.id, item.sentence)}
                    disabled={analyzingIds[item.id]}
                  >
                    {analyzingIds[item.id] ? 'Analyzing...' : '⚡ AI Analyze'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
