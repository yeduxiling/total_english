import { useState } from 'react';
import SpeakButton from '../../components/SpeakButton/SpeakButton.js';
import './SentenceAnalysisPage.css';

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

interface AnalysisResponse {
  sentence: string;
  analysis: AnalysisData;
  cached: boolean;
}

const SAMPLE_SENTENCES = [
  'Do not show PII in your screen recordings to avoid GDPR violations, unless instructed otherwise.',
  'Having finished the assignment before the deadline, she was able to enjoy her weekend without any stress.',
  'Although technology has made it easier to stay connected, it has also created a sense of isolation for many individuals.'
];

export default function SentenceAnalysisPage() {
  const [sentence, setSentence] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);

  // 收藏与笔记状态
  const [isSaved, setIsSaved] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const handleAnalyze = async (textToAnalyze?: string) => {
    const targetText = textToAnalyze !== undefined ? textToAnalyze : sentence;
    if (!targetText.trim()) return;

    setLoading(true);
    setError('');
    setAnalysisResult(null);
    setIsSaved(false);
    setNote('');
    setSaveSuccessMsg('');

    try {
      const res = await fetch('/api/sentences/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: targetText.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '分析失败');
      }

      const data: AnalysisResponse = await res.json();
      setAnalysisResult(data);
      setIsSaved(data.cached);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!analysisResult) return;
    setSaving(true);
    setSaveSuccessMsg('');

    try {
      const res = await fetch('/api/sentences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentence: analysisResult.sentence,
          source: 'analysis',
          analysisResult: analysisResult.analysis,
          note: note.trim()
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '收藏失败');
      }

      setIsSaved(true);
      setSaveSuccessMsg('句子已成功加入收藏！');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
    <div className="sentence-analysis-page">
      <div className="page-header">
        <h1 className="page-title">Sentence Analysis</h1>
        <p className="page-subtitle">利用 AI 拆分意群、分析结构、轻松理解复杂句子</p>
      </div>

      <div className="analysis-card">
        <div className="input-group">
          <textarea
            className="sentence-textarea"
            placeholder="输入您想分析的长难句或看不懂的句子..."
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            disabled={loading}
          />
          
          <div className="action-row">
            <div className="sample-sentences">
              <span className="sample-label">💡 试试范例：</span>
              {SAMPLE_SENTENCES.map((s, idx) => (
                <button
                  key={idx}
                  className="sample-btn"
                  onClick={() => {
                    setSentence(s);
                    handleAnalyze(s);
                  }}
                  disabled={loading}
                >
                  范例 {idx + 1}
                </button>
              ))}
            </div>

            <button
              className={`analyze-btn ${loading ? 'loading' : ''}`}
              onClick={() => handleAnalyze()}
              disabled={loading || !sentence.trim()}
            >
              {loading ? (
                <>
                  <span className="btn-spinner" />
                  分析中...
                </>
              ) : (
                'AI 分析'
              )}
            </button>
          </div>
        </div>

        {error && <div className="error-alert">⚠️ {error}</div>}
      </div>

      {analysisResult && (
        <div className="result-container">
          <div className="result-card fade-in">
            <div className="result-card-header">
              <h2 className="result-card-title">1. Logical Chunking (意群拆分与释义)</h2>
              <SpeakButton text={analysisResult.sentence} size="md" />
            </div>

            <div className="chunk-list">
              {analysisResult.analysis.chunks.map((chunk, idx) => (
                <div 
                  key={idx} 
                  className={`chunk-item ${chunk.level > 0 ? 'sub-chunk' : ''}`}
                >
                  {chunk.level > 0 && <span className="sub-arrow">↳</span>}
                  <div className="chunk-content">
                    <div className="chunk-top">
                      <span className={`chunk-badge ${getBadgeColorClass(chunk.label)}`}>
                        {chunk.label}
                      </span>
                      <strong className="chunk-text">{chunk.text}</strong>
                    </div>
                    <p className="chunk-explanation">{chunk.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="result-card fade-in delay-1">
            <h2 className="result-card-title">2. Overall Meaning (句子总体含义)</h2>
            <blockquote className="overall-meaning-quote">
              {analysisResult.analysis.overallMeaning}
            </blockquote>
          </div>

          <div className="result-card fade-in delay-2">
            <h2 className="result-card-title">💾 收藏与笔记</h2>
            <div className="save-section">
              {isSaved ? (
                <div className="saved-badge">
                  <span>✓ 句子已在收藏中</span>
                </div>
              ) : (
                <div className="save-form">
                  <div className="note-input-wrapper">
                    <label htmlFor="note" className="note-label">添加个人笔记 (可选)</label>
                    <textarea
                      id="note"
                      className="note-textarea"
                      placeholder="写下你对这个句子的理解、语法要点或重点词汇..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                  <button
                    className="save-btn"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? '正在收藏...' : '加入收藏 Collection'}
                  </button>
                </div>
              )}
              {saveSuccessMsg && <p className="success-message">{saveSuccessMsg}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
