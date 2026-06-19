import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 音频缓存目录：server/data/audio/
const AUDIO_DIR = path.join(__dirname, '../../data/audio');

/**
 * 确保音频目录存在
 */
export function ensureAudioDir(): void {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    console.log('✅ 音频缓存目录已创建:', AUDIO_DIR);
  }
}

/**
 * 获取某个 word 的音频 file 路径
 */
export function getAudioPath(wordId: number): string {
  return path.join(AUDIO_DIR, `${wordId}.mp3`);
}

/**
 * 检查某个 word 是否已有缓存音频
 */
export function hasAudio(wordId: number): boolean {
  return fs.existsSync(getAudioPath(wordId));
}

/**
 * 从网络拉取音频数据（双重备用引擎，美音）
 */
async function fetchAudioBuffer(text: string): Promise<Buffer> {
  const youdaoUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`;
  const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-us&client=tw-ob&q=${encodeURIComponent(text)}`;

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  // 1. 优先使用有道（美音，国内节点，响应快速）
  try {
    const res = await fetch(youdaoUrl, { headers });
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // 有道在请求失败时可能会返回一个极小的 HTML 或是错误音频，这里校验大小（一般大于 1KB）
      if (buffer.length > 500) {
        return buffer;
      }
    }
  } catch (err: any) {
    console.warn('⚠️ 有道 TTS 失败，尝试谷歌 TTS:', err.message);
  }

  // 2. 备用使用谷歌翻译 TTS
  try {
    const res = await fetch(googleUrl, { headers });
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    throw new Error(`Google TTS status: ${res.status}`);
  } catch (err: any) {
    throw new Error(`TTS 引擎全部失效: ${err.message}`);
  }
}

/**
 * 为指定单词生成 TTS 音频并缓存到磁盘
 * 如果已有缓存则跳过（除非 force=true）
 */
export async function generateAudio(
  wordId: number,
  text: string,
  force = false
): Promise<string> {
  ensureAudioDir();

  const filePath = getAudioPath(wordId);

  // 已有缓存且不强制重新生成
  if (!force && fs.existsSync(filePath)) {
    return filePath;
  }

  // 调用网络接口生成
  const audioBuffer = await fetchAudioBuffer(text);

  // 写入文件
  fs.writeFileSync(filePath, audioBuffer);
  console.log(`🔊 TTS 音频已生成: ${text} → ${filePath}`);

  return filePath;
}

/**
 * 实时生成音频（不缓存，用于未保存的单词预览）
 */
export async function generatePreviewAudio(text: string): Promise<Buffer> {
  return await fetchAudioBuffer(text);
}
