import React, { useState, useEffect, useRef } from 'react';
import './SpeakButton.css';

interface SpeakButtonProps {
  wordId?: number;     // 已保存单词的 ID，用于请求缓存音频
  text?: string;       // 未保存词条的文本，用于实时生成预览音频
  size?: 'sm' | 'md';  // 按钮大小
}

export default function SpeakButton({ wordId, text, size = 'md' }: SpeakButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 退出组件时，清除并停止播放音频
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止事件冒泡，防止触发卡片展开/复习操作

    // 如果正在播放，再次点击则停止播放
    if (status === 'playing' && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setStatus('idle');
      return;
    }

    // 确定请求地址
    let audioUrl = '';
    if (wordId !== undefined) {
      audioUrl = `/api/tts/${wordId}`;
    } else if (text) {
      audioUrl = `/api/tts/preview?text=${encodeURIComponent(text)}`;
    } else {
      return;
    }

    setStatus('loading');

    // 创建或重置 Audio 实例
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    // 绑定音频播放相关事件
    audio.oncanplaythrough = () => {
      // 允许播放，开始播放
      audio.play().catch((err) => {
        console.error('音频播放失败:', err);
        setStatus('idle');
      });
    };

    audio.onplaying = () => {
      setStatus('playing');
    };

    audio.onwaiting = () => {
      setStatus('loading');
    };

    audio.onended = () => {
      setStatus('idle');
      audioRef.current = null;
    };

    audio.onpause = () => {
      setStatus('idle');
    };

    audio.onerror = () => {
      console.error('音频加载或播放出错');
      setStatus('idle');
      audioRef.current = null;
    };

    // 触发音频预加载
    audio.load();
  };

  return (
    <button
      className={`speak-btn speak-btn-${size} speak-status-${status}`}
      onClick={handlePlay}
      disabled={status === 'loading'}
      title={status === 'playing' ? '停止播放' : '发音朗读'}
      aria-label="单词发音"
    >
      {status === 'idle' && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="speak-btn-icon"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
        </svg>
      )}

      {status === 'loading' && (
        <span className="speak-btn-spinner" />
      )}

      {status === 'playing' && (
        <div className="speak-btn-wave">
          <span className="speak-wave-bar bar-1"></span>
          <span className="speak-wave-bar bar-2"></span>
          <span className="speak-wave-bar bar-3"></span>
        </div>
      )}
    </button>
  );
}
