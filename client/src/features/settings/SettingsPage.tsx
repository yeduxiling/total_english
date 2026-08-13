import { useState, useEffect } from 'react';
import './SettingsPage.css';

// ─── Tag Settings ─────────────────────────────────────────────────────────────

interface TagData {
  name: string;
  chunk_count: number;
  sentence_count: number;
}

function TagSettings() {
  const [tags, setTags]               = useState<TagData[]>([]);
  const [loading, setLoading]         = useState(true);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue]     = useState('');
  const [saving, setSaving]           = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');

  const loadTags = () => {
    setLoading(true);
    fetch('/api/tags')
      .then(r => r.json())
      .then(data => { setTags(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadTags(); }, []);

  const startEdit = (name: string) => {
    setEditingName(name);
    setEditValue(name);
    setErrorMsg('');
  };

  const cancelEdit = () => {
    setEditingName(null);
    setEditValue('');
    setErrorMsg('');
  };

  const handleRename = async () => {
    if (!editingName) return;
    const trimmed = editValue.trim();
    if (!trimmed) { setErrorMsg('Name cannot be empty'); return; }
    if (trimmed === editingName) { cancelEdit(); return; }
    
    // 如果目标标签已存在，提示用户是否合并
    const exists = tags.some(t => t.name === trimmed);
    if (exists) {
      const confirmMerge = window.confirm(
        `The tag "${trimmed}" already exists. Do you want to merge "${editingName}" into "${trimmed}"?\n\nThis will combine all chunks and sentences under "${trimmed}".`
      );
      if (!confirmMerge) return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/tags/rename', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: editingName, newName: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json();
        setErrorMsg(err.error || 'Rename failed');
        return;
      }
      cancelEdit();
      loadTags();
    } catch {
      setErrorMsg('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-section animate-in">
      <h2>Source Tags</h2>
      <p className="settings-desc">
        All source tags across your chunks and sentences. Click ✏️ to rename a tag — changes apply everywhere it's used.
      </p>

      <div className="tags-list">
        {loading ? (
          <div className="spinner-container"><span className="spinner" /></div>
        ) : tags.length === 0 ? (
          <p className="settings-desc">No tags found. Tags are created automatically when you add a source to a chunk or sentence.</p>
        ) : (
          <div className="tags-grid">
            {tags.map(t => {
              const isEditing = editingName === t.name;
              return (
                <div key={t.name} className={`tag-item card ${isEditing ? 'tag-item-editing' : ''}`}>
                  {isEditing ? (
                    <div className="tag-edit-row">
                      <input
                        className="input tag-edit-input"
                        value={editValue}
                        autoFocus
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRename();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        disabled={saving}
                      />
                      <button className="btn btn-primary btn-sm" onClick={handleRename} disabled={saving}>
                        {saving ? '…' : 'Save'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={cancelEdit} disabled={saving}>Cancel</button>
                      {errorMsg && <span className="tag-edit-error">{errorMsg}</span>}
                    </div>
                  ) : (
                    <div className="tag-item-info">
                      <span className="tag-name">🏷 {t.name}</span>
                      <div className="tag-counts">
                        <span className="tag-count" title="Chunk examples using this tag">
                          {t.chunk_count} {t.chunk_count === 1 ? 'chunk' : 'chunks'}
                        </span>
                        {t.sentence_count > 0 && (
                          <span className="tag-count tag-count-sentence" title="Sentences using this tag">
                            · {t.sentence_count} {t.sentence_count === 1 ? 'sentence' : 'sentences'}
                          </span>
                        )}
                      </div>
                      <button
                        className="btn-icon tag-edit-btn"
                        title="Rename this tag everywhere"
                        onClick={() => startEdit(t.name)}
                      >✏️</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface LlmConfig {
  id: string;
  name: string;
  model_id: string;
  is_active: number;
  base_url: string;
  api_key?: string;
}

interface PromptTemplate {
  id: string;
  name: string;
  system_prompt: string;
  user_prompt: string;
  version: number;
  is_active: number;
  updated_at: string;
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'llm' | 'prompts' | 'tags'>('llm');

  // LLM Config State
  const [llmConfigs, setLlmConfigs] = useState<LlmConfig[]>([]);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [name, setName] = useState('My Custom LLM');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');
  
  const [savingLLM, setSavingLLM] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [testingStates, setTestingStates] = useState<Record<string, { status: 'idle' | 'testing' | 'ok' | 'error'; msg?: string; latency?: number }>>({});

  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);

  const loadLLMConfigs = () => {
    fetch('/api/settings/models')
      .then(res => res.json())
      .then(data => setLlmConfigs(data || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadLLMConfigs();
    fetch('/api/prompts')
      .then(res => res.json())
      .then(data => setPrompts(data))
      .catch(() => {});
  }, []);

  const handleSaveLLM = async () => {
    setSavingLLM(true);
    try {
      let res;
      if (editingId) {
        res = await fetch(`/api/settings/models/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, baseUrl, apiKey, modelId }),
        });
      } else {
        res = await fetch('/api/settings/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, baseUrl, apiKey, modelId }),
        });
      }
      if (res.ok) {
        setMessage({ text: 'Configuration saved', type: 'success' });
        setIsEditingConfig(false);
        loadLLMConfigs();
      } else {
        const err = await res.json();
        setMessage({ text: err.error || 'Failed to save', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Failed to save', type: 'error' });
    } finally {
      setSavingLLM(false);
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    }
  };

  const handleActivateLLM = async (id: string) => {
    try {
      await fetch(`/api/settings/models/${id}/activate`, { method: 'PUT' });
      loadLLMConfigs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestLLM = async (id: string) => {
    setTestingStates(prev => ({ ...prev, [id]: { status: 'testing' } }));
    try {
      const res = await fetch(`/api/settings/models/${id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setTestingStates(prev => ({ ...prev, [id]: { status: 'ok', latency: data.latency } }));
      } else {
        setTestingStates(prev => ({ ...prev, [id]: { status: 'error', msg: data.error } }));
      }
    } catch (err: any) {
      setTestingStates(prev => ({ ...prev, [id]: { status: 'error', msg: err.message || 'Request failed' } }));
    }
    setTimeout(() => {
      setTestingStates(prev => ({ ...prev, [id]: { status: 'idle' } }));
    }, 5000);
  };

  const handleDeleteLLM = async (id: string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) return;
    try {
      await fetch(`/api/settings/models/${id}`, { method: 'DELETE' });
      loadLLMConfigs();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditLLM = (config?: LlmConfig) => {
    setMessage({ text: '', type: '' });
    if (config) {
      setEditingId(config.id);
      setName(config.name);
      setBaseUrl(config.base_url);
      setApiKey(config.api_key || '');
      setModelId(config.model_id);
    } else {
      setEditingId(null);
      setName('New LLM Config');
      setBaseUrl('https://api.openai.com/v1');
      setApiKey('');
      setModelId('gpt-4o');
    }
    setIsEditingConfig(true);
  };

  return (
    <div className="settings-page animate-in">
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-title-icon">⚙️</span>
          Settings
        </h1>
        <p className="page-subtitle">Configure your LLM connection, manage prompts, and organize tags</p>
      </div>

      <div className="settings-tabs">
        <button className={`tab-btn ${activeTab === 'llm' ? 'active' : ''}`} onClick={() => setActiveTab('llm')}>LLM Config</button>
        <button className={`tab-btn ${activeTab === 'prompts' ? 'active' : ''}`} onClick={() => setActiveTab('prompts')}>Prompts</button>
        <button className={`tab-btn ${activeTab === 'tags' ? 'active' : ''}`} onClick={() => setActiveTab('tags')}>Tags</button>
      </div>

      <div className="settings-content">
        {activeTab === 'llm' && (
          <div className="settings-section animate-in">
            <h2>LLM Configuration</h2>
            <p className="settings-desc">Set up your AI providers to enable smart lookups and contextual dictionary matching.</p>
            
            {message.text && (
              <div className={`settings-message ${message.type}`}>
                {message.type === 'success' ? '✅' : '⚠️'} {message.text}
              </div>
            )}

            {!isEditingConfig ? (
              <div className="llm-configs-list">
                {llmConfigs.length === 0 ? (
                  <p className="settings-desc">No LLM configurations found. Please add one.</p>
                ) : (
                  <div className="llm-cards">
                    {llmConfigs.map(c => {
                      const ts = testingStates[c.id] || { status: 'idle' };
                      return (
                      <div key={c.id} className={`llm-card ${c.is_active ? 'active' : ''}`}>
                        <div className="llm-card-left">
                          <input 
                            type="radio" 
                            name="activeLLM" 
                            checked={c.is_active === 1} 
                            onChange={() => handleActivateLLM(c.id)} 
                            className="llm-radio"
                          />
                          <div className="llm-card-info">
                            <span className="llm-name">{c.name}</span>
                            <span className="llm-model">{c.model_id}</span>
                          </div>
                        </div>
                        <div className="llm-card-right">
                          {c.is_active === 1 && (
                            <span className="llm-status-badge">
                              <span className="llm-status-dot" />
                              Active
                            </span>
                          )}
                          {ts.status === 'ok' && (
                            <span className="llm-test-result ok">✔ Connected ({ts.latency}ms)</span>
                          )}
                          {ts.status === 'error' && (
                            <span className="llm-test-result error" title={ts.msg}>✖ Failed</span>
                          )}
                          <div className="llm-card-actions">
                            <button
                              className={`btn btn-ghost btn-sm llm-test-btn ${ts.status === 'testing' ? 'testing' : ''}`}
                              onClick={() => handleTestLLM(c.id)}
                              disabled={ts.status === 'testing'}
                              title="Test model connectivity"
                            >
                              {ts.status === 'testing' ? 'Testing...' : 'Test'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEditLLM(c)}>Edit</button>
                            <button className="btn btn-ghost btn-sm text-error" onClick={() => handleDeleteLLM(c.id)}>Delete</button>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
                
                <div style={{ marginTop: 24 }}>
                  <button className="btn btn-primary" onClick={() => openEditLLM()}>+ Add New Configuration</button>
                </div>
              </div>
            ) : (
              <div className="settings-form card animate-in">
                <div className="settings-form-header">
                  <h3>{editingId ? 'Edit Configuration' : 'New Configuration'}</h3>
                  <button className="btn-icon" onClick={() => setIsEditingConfig(false)}>✕</button>
                </div>

                <div className="settings-form-body">
                  <div className="form-group">
                    <label className="form-label">Custom Name</label>
                    <input 
                      className="input"
                      type="text" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      placeholder="e.g. My DeepSeek" 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Base URL</label>
                    <input 
                      className="input"
                      type="text" 
                      value={baseUrl} 
                      onChange={e => setBaseUrl(e.target.value)} 
                      placeholder="https://api.openai.com/v1" 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">API Key</label>
                    <input 
                      className="input"
                      type="password" 
                      value={apiKey} 
                      onChange={e => setApiKey(e.target.value)} 
                      placeholder={editingId ? '******** (leave empty to keep unchanged)' : 'sk-...'} 
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Model Name</label>
                    <input 
                      className="input"
                      type="text" 
                      value={modelId} 
                      onChange={e => setModelId(e.target.value)} 
                      placeholder="e.g. gpt-4o or deepseek-chat" 
                    />
                  </div>
                </div>

                <div className="settings-form-footer">
                  <button 
                    className="btn btn-primary settings-submit"
                    onClick={handleSaveLLM}
                    disabled={savingLLM}
                  >
                    {savingLLM ? 'Saving...' : 'Save Configuration'}
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setIsEditingConfig(false)}
                    disabled={savingLLM}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'prompts' && (
          <div className="settings-section card animate-in">
            <h2>System Prompt Templates</h2>
            <p className="settings-desc">View and manage the underlying prompt templates used for contextual analysis.</p>
            
            {prompts.length === 0 ? (
              <p>Loading prompts...</p>
            ) : (
              <div className="prompt-list">
                {prompts.map(p => (
                  <div key={p.id} className="prompt-card">
                    <div className="prompt-card-header">
                      <div className="prompt-card-info">
                        <h3 className="prompt-card-title">{p.name}</h3>
                        <div className="prompt-card-meta">
                          {p.is_active ? (
                            <span className="badge badge-active">Active</span>
                          ) : (
                            <span className="badge badge-inactive">Inactive</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="prompt-preview">
                      <div className="preview-section">
                        <span className="preview-label">System Prompt:</span>
                        <pre className="preview-code">{p.system_prompt}</pre>
                      </div>
                      <div className="preview-section">
                        <span className="preview-label">User Prompt Template:</span>
                        <pre className="preview-code">{p.user_prompt}</pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tags' && <TagSettings />}
      </div>
    </div>
  );
}
