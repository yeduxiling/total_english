import { useState, useEffect, useRef } from 'react';
import './TagAutocomplete.css';

interface TagData {
  id: number;
  name: string;
  count: number;
}

interface TagAutocompleteProps {
  onAddTag: (tagName: string) => void;
  existingTags?: string[];
  placeholder?: string;
}

export default function TagAutocomplete({ onAddTag, existingTags = [], placeholder = "Add a tag and press Enter..." }: TagAutocompleteProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [allTags, setAllTags] = useState<TagData[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 获取所有标签
  useEffect(() => {
    fetch('/api/tags')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAllTags(data);
        }
      })
      .catch(err => console.error('Failed to fetch tags', err));
  }, []);

  // 点击外部收起下拉框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 过滤推荐标签逻辑
  const availableTags = allTags.filter(t => !existingTags.includes(t.name));
  let suggestedTags: TagData[] = [];

  if (!input.trim()) {
    // 未输入内容时，展示 top 5
    suggestedTags = availableTags.slice(0, 5);
  } else {
    // 有输入时模糊匹配（包含该子串）
    suggestedTags = availableTags.filter(t => t.name.toLowerCase().includes(input.toLowerCase()));
  }

  const handleAdd = (tagName: string) => {
    const trimmed = tagName.trim();
    if (trimmed && !existingTags.includes(trimmed)) {
      onAddTag(trimmed);
      setInput('');
      setIsFocused(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd(input);
    }
  };

  return (
    <div className="tag-autocomplete-wrap" ref={wrapRef}>
      <input
        className="input tag-input"
        placeholder={placeholder}
        value={input}
        onChange={e => setInput(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleKeyDown}
      />
      {isFocused && (
        <div className="tag-dropdown card">
          {suggestedTags.length > 0 ? (
            <>
              {!input.trim() && <div className="tag-dropdown-title">Top Tags</div>}
              {suggestedTags.map(tag => (
                <div 
                  key={tag.id} 
                  className="tag-dropdown-item"
                  onClick={() => handleAdd(tag.name)}
                >
                  <span className="tag-name">{tag.name}</span>
                  <span className="tag-count">{tag.count}</span>
                </div>
              ))}
              {input.trim() && !suggestedTags.some(t => t.name.toLowerCase() === input.toLowerCase()) && (
                <div className="tag-dropdown-item tag-dropdown-create" onClick={() => handleAdd(input)}>
                  Create "{input}"
                </div>
              )}
            </>
          ) : (
            input.trim() ? (
              <div className="tag-dropdown-item tag-dropdown-create" onClick={() => handleAdd(input)}>
                Create "{input}"
              </div>
            ) : (
              <div className="tag-dropdown-empty">No tags available</div>
            )
          )}
        </div>
      )}
    </div>
  );
}
