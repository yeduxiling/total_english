import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import DOMPurify from 'isomorphic-dompurify';

export interface ParsedWebPage {
  url: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  contentHtml: string;
  textContent: string;
  coverImage: string | null;
  estimatedReadingMinutes: number;
}

/**
 * 智能网页内容抓取与正文解析引擎
 * 基于 Mozilla Readability 官方算法，自动过滤广告、导航、侧边栏，保留正文配图、视频与外链
 */
export async function parseWebArticle(targetUrl: string): Promise<ParsedWebPage> {
  const parsedUrl = new URL(targetUrl);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

  // 1. 模拟现代浏览器抓取目标网页 HTML
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status} ${response.statusText})`);
  }

  const rawHtml = await response.text();

  // 2. 使用 JSDOM 解析 DOM 树
  const dom = new JSDOM(rawHtml, { url: targetUrl });
  const doc = dom.window.document;

  // 提取 OpenGraph 首图作为封面
  let coverImage: string | null = null;
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
                   doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content');
  if (ogImage) {
    try {
      coverImage = new URL(ogImage, targetUrl).href;
    } catch {
      coverImage = ogImage;
    }
  }

  // 3. 执行 Mozilla Readability 智能正文识别与降噪提取
  const reader = new Readability(doc, {
    keepClasses: false,
  });
  const article = reader.parse();

  if (!article || !article.content) {
    throw new Error('Unable to extract main readable article content from this webpage.');
  }

  // 4. 后处理正文 DOM：修复相对链接、图片绝对地址与媒体嵌入
  const articleDom = new JSDOM(article.content, { url: targetUrl });
  const articleDoc = articleDom.window.document;

  // (1) 修复并补全所有 img 的 src 与 srcset 为绝对路径
  const images = articleDoc.querySelectorAll('img');
  images.forEach(img => {
    const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original-src');
    if (src) {
      try {
        img.setAttribute('src', new URL(src, targetUrl).href);
      } catch {}
    }
    // 移除无用 lazy 属性或限制，确保图片直接加载
    img.removeAttribute('loading');
    img.removeAttribute('data-src');
    img.removeAttribute('srcset');
    if (!coverImage && src) {
      try {
        coverImage = new URL(src, targetUrl).href;
      } catch {}
    }
  });

  // (2) 格式化超链接，支持新标签页打开
  const links = articleDoc.querySelectorAll('a');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href) {
      try {
        link.setAttribute('href', new URL(href, targetUrl).href);
      } catch {}
    }
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  });

  // (3) 保留合法的视频与 iframe 嵌入（如 YouTube, Vimeo, Bilibili）
  const iframes = articleDoc.querySelectorAll('iframe');
  iframes.forEach(ifr => {
    const src = ifr.getAttribute('src') || '';
    const isAllowedVideo = /youtube\.com|youtu\.be|vimeo\.com|bilibili\.com|player\./i.test(src);
    if (!isAllowedVideo) {
      ifr.remove();
    } else {
      ifr.setAttribute('allowfullscreen', 'true');
      ifr.setAttribute('loading', 'lazy');
    }
  });

  // 5. 使用 DOMPurify 进行终极安全净化（允许保留必要富媒体标签）
  const cleanHtml = DOMPurify.sanitize(articleDoc.body.innerHTML, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'blockquote', 'pre', 'code', 'em', 'strong', 'i', 'b', 'u', 's',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'figure', 'figcaption', 'picture', 'source',
      'video', 'audio', 'iframe', 'hr', 'br', 'a', 'span', 'div'
    ],
    ALLOWED_ATTR: [
      'src', 'href', 'target', 'rel', 'alt', 'title', 'class',
      'width', 'height', 'controls', 'autoplay', 'loop', 'muted', 'poster',
      'allowfullscreen', 'frameborder', 'loading'
    ],
    ADD_ATTR: ['target'],
  });

  // 6. 估算英文阅读耗时（以 200 词/分钟计）
  const wordsCount = article.textContent ? article.textContent.trim().split(/\s+/).length : 0;
  const estimatedMinutes = Math.max(1, Math.round(wordsCount / 200));

  return {
    url: targetUrl,
    title: article.title || doc.title || 'Untitled Article',
    byline: article.byline || null,
    siteName: article.siteName || parsedUrl.hostname.replace(/^www\./, ''),
    excerpt: article.excerpt || null,
    contentHtml: cleanHtml,
    textContent: article.textContent || '',
    coverImage,
    estimatedReadingMinutes: estimatedMinutes,
  };
}
