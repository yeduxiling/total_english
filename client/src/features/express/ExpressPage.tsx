import React, { useState } from 'react';
import SpeakButton from '../../components/SpeakButton/SpeakButton.js';
import './ExpressPage.css';

interface AssumptionEvaluation {
  hasAssumption: boolean;
  rating: string | null;
  explanation: string | null;
}

interface BestExpression {
  english: string;
  chinese: string;
  style: string;
  explanation: string;
  exampleSentence: string;
  exampleTranslation: string;
}

interface AlternativeExpression {
  english: string;
  chinese: string;
  style: string;
  context: string;
}

interface ExpressResult {
  assumptionEvaluation: AssumptionEvaluation;
  bestExpressions: BestExpression[];
  alternativeExpressions: AlternativeExpression[];
  linguisticTip: string;
}

export default function ExpressPage() {
  const [expression, setExpression] = useState('');
  const [assumption, setAssumption] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExpressResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expression.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/express', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expression: expression.trim(),
          assumption: assumption.trim() || undefined
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status} Error`);
      }

      const data = await res.json() as ExpressResult;
      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '表达查询出错，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 根据 rating 返回不同的图标和样式类
  const getRatingMeta = (rating: string | null) => {
    if (!rating) return { icon: '💡', className: 'info' };
    const r = rating.toLowerCase();
    if (r.includes('correct & natural') || r.includes('natural')) {
      return { icon: '✅', className: 'success' };
    }
    if (r.includes('unnatural') || r.includes('grammatically correct')) {
      return { icon: '⚠️', className: 'warning' };
    }
    return { icon: '❌', className: 'danger' };
  };

  return (
    <div className="express-page animate-in">
      <div className="express-header">
        <div>
          <h1 className="page-title">Smart Express</h1>
          <p className="page-subtitle">Describe what you want to say, and get authentic English expressions.</p>
        </div>
      </div>

      <div className="express-content-container">
        {/* 左侧：输入表单 */}
        <form className="express-form-card card" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="field-label" htmlFor="express-input">
              I want to express * <span className="label-lang-note">(中文或英文)</span>
            </label>
            <textarea
              id="express-input"
              className="express-textarea"
              placeholder="e.g. 描述产品开发初期发现的问题越少，后期需要付出的代价就越小；或者用英语简单写: find bugs early, pay less later..."
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              required
              disabled={loading}
              rows={4}
            />
          </div>

          <div className="form-group">
            <label className="field-label" htmlFor="assumption-input">
              My assumption <span className="label-lang-note">(选填, 英文)</span>
            </label>
            <input
              id="assumption-input"
              type="text"
              className="express-input"
              placeholder="e.g. The early we find bugs, the cheap it is."
              value={assumption}
              onChange={(e) => setAssumption(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="express-submit-btn"
            disabled={loading || !expression.trim()}
          >
            {loading ? 'Analyzing...' : 'Express Geeks'}
          </button>
        </form>

        {/* 右侧：结果展示 */}
        <div className="express-result-area">
          {error && <div className="error-alert">⚠️ {error}</div>}

          {/* 骨架屏加载状态 */}
          {loading && (
            <div className="express-skeleton">
              <div className="skeleton-line skeleton-title animate-pulse" />
              <div className="skeleton-line skeleton-body-1 animate-pulse" />
              <div className="skeleton-line skeleton-body-2 animate-pulse" />
              <div className="skeleton-card animate-pulse">
                <div className="skeleton-line skeleton-card-title" />
                <div className="skeleton-line skeleton-card-text" />
              </div>
            </div>
          )}

          {/* 真实数据展示 */}
          {result && (
            <div className="express-results fade-in">
              
              {/* 1. 猜想评估 (仅当用户提供了猜想且 LLM 返回有评估时展示) */}
              {result.assumptionEvaluation && result.assumptionEvaluation.hasAssumption && (
                <div className={`assumption-card evaluation-${getRatingMeta(result.assumptionEvaluation.rating).className}`}>
                  <div className="evaluation-header">
                    <span className="evaluation-icon">
                      {getRatingMeta(result.assumptionEvaluation.rating).icon}
                    </span>
                    <span className="evaluation-title">
                      {result.assumptionEvaluation.rating}
                    </span>
                  </div>
                  <p className="evaluation-explanation">
                    {result.assumptionEvaluation.explanation}
                  </p>
                </div>
              )}

              {/* 2. 核心表达推荐 */}
              <div className="results-section">
                <h3 className="section-title">Best Expressions</h3>
                <div className="best-expressions-list">
                  {result.bestExpressions && result.bestExpressions.map((item, index) => (
                    <div key={index} className="best-expression-card card">
                      <div className="best-card-header">
                        <div className="best-phrase-row">
                          <span className="best-phrase font-english">{item.english}</span>
                          <SpeakButton text={item.english} size="md" />
                        </div>
                        <span className="best-style-badge">{item.style}</span>
                      </div>
                      
                      <div className="best-meaning-row">
                        <span className="best-meaning-cn">{item.chinese}</span>
                      </div>

                      <p className="best-explanation">
                        {item.explanation}
                      </p>

                      <div className="best-example-container">
                        <div className="example-text-row">
                          <span className="example-text font-english">{item.exampleSentence}</span>
                          <SpeakButton text={item.exampleSentence} size="sm" />
                        </div>
                        <div className="example-translation">{item.exampleTranslation}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. 其它替代说法 */}
              {result.alternativeExpressions && result.alternativeExpressions.length > 0 && (
                <div className="results-section">
                  <h3 className="section-title">Alternative Ways</h3>
                  <div className="alternatives-grid">
                    {result.alternativeExpressions.map((item, index) => (
                      <div key={index} className="alternative-card card">
                        <div className="alt-header">
                          <div className="alt-phrase-row">
                            <span className="alt-phrase font-english">{item.english}</span>
                            <SpeakButton text={item.english} size="sm" />
                          </div>
                          <span className="alt-style-badge">{item.style}</span>
                        </div>
                        <div className="alt-meaning">{item.chinese}</div>
                        <div className="alt-context">
                          <span className="context-label">When to use:</span> {item.context}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. 语言小贴士 */}
              {result.linguisticTip && (
                <div className="express-tip-banner">
                  <span className="tip-icon">💡</span>
                  <p className="tip-content">{result.linguisticTip}</p>
                </div>
              )}

            </div>
          )}

          {!loading && !result && !error && (
            <div className="express-empty-state">
              <div className="empty-icon">✍️</div>
              <p className="empty-title">Ready to Express?</p>
              <p className="empty-desc">
                Fill in what you want to express in the left form. You will get authentic, natural English phrases suggested by AI.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
