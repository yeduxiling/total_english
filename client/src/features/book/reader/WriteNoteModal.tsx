import { useState } from 'react';
import './WriteNoteModal.css';

interface WriteNoteModalProps {
  isOpen: boolean;
  referencedText: string;
  onClose: () => void;
  onSave: (content: string) => void;
}

export default function WriteNoteModal({
  isOpen,
  referencedText,
  onClose,
  onSave,
}: WriteNoteModalProps) {
  const [content, setContent] = useState('');

  if (!isOpen) return null;

  const handleSave = () => {
    if (!content.trim()) return;
    onSave(content.trim());
    setContent('');
    onClose();
  };

  return (
    <div className="note-modal-overlay">
      <div className="note-modal card">
        <div className="note-modal-header">
          <h3 className="note-modal-title">💭 Add Note / Thought</h3>
          <button className="note-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="note-modal-body">
          {/* 原文引用 */}
          <div className="note-modal-quote">
            <p className="note-modal-quote-text font-english">“{referencedText}”</p>
          </div>

          {/* 笔记正文输入 */}
          <textarea
            className="input note-modal-textarea"
            placeholder="Write your thoughts or understanding about this sentence..."
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            autoFocus
          />
        </div>

        <div className="note-modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!content.trim()}
          >
            Save Note
          </button>
        </div>
      </div>
    </div>
  );
}
