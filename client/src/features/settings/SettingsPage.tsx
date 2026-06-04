import { useState, useEffect } from 'react';
import './SettingsPage.css';

interface TagData {
  id: number;
  name: string;
  count: number;
}

function TagSettings() {
  const [tags, setTags] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState('');

  const loadTags = (showLoading = true) => {
    if (showLoading) setLoading(true);
    fetch('/api/tags')
      .then(res => res.json())
      .then(data => {
        setTags(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTags(false);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleAdd = async () => {
    if (!newTag.trim()) return;
    try {
      await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTag }),
      });
      setNewTag('');
      loadTags();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this tag globally? It will be removed from all words.')) return;
    try {
      await fetch(`/api/tags/${id}`, { method: 'DELETE' });
      loadTags();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="settings-section animate-in">
      <h2>Tag Management</h2>
      <p className="settings-desc">Manage your global tags here. Adding or deleting tags here affects the entire dictionary.</p>
      
      <div className="tag-add-form">
        <input 
          className="input" 
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          placeholder="Enter new tag name..."
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button className="btn btn-primary" onClick={handleAdd}>Add Tag</button>
      </div>

      <div className="tags-list">
        {loading ? (
          <div className="spinner-container"><span className="spinner" /></div>
        ) : tags.length === 0 ? (
          <p className="settings-desc">No tags found.</p>
        ) : (
          <div className="tags-grid">
            {tags.map(t => (
              <div key={t.id} className="tag-item card">
                <div className="tag-item-info">
                  <span className="tag-name">{t.name}</span>
                  <span className="tag-count" title="Number of words using this tag">{t.count} words</span>
                </div>
                <button className="btn-icon tag-delete" onClick={() => handleDelete(t.id)} title="Delete globally">🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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
                    {llmConfigs.map(c => (
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
                        <div className="llm-card-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEditLLM(c)}>Edit</button>
                          <button className="btn btn-ghost btn-sm text-error" onClick={() => handleDeleteLLM(c.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
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
