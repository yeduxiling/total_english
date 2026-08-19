/**
 * 智能英文句子语境提取器 (Smart Sentence Context Extractor)
 * 根据当前选区 (Selection / Range) 从所在段落中提取包含选中文本的完整英文句子
 */
export function extractSentenceContext(selection: Selection | null, selectedText: string): string {
  const cleanSelected = (selectedText || '').trim();
  if (!cleanSelected) return '';

  // 如果选中的内容本身就是长句 (超过 5 个词且以大写或标点结尾)，直接作为句子返回
  const tokenCount = cleanSelected.split(/\s+/).filter(Boolean).length;
  if (tokenCount >= 6 && /[.!?]$/.test(cleanSelected)) {
    return cleanSelected;
  }

  if (!selection || selection.rangeCount === 0) {
    return cleanSelected;
  }

  try {
    const range = selection.getRangeAt(0);
    let node: Node | null = range.startContainer;

    // 向上寻找最近的块级容器 (p, li, blockquote, div, h1-h6, article, section)
    let blockElement: HTMLElement | null = null;
    let curr: Node | null = node;
    while (curr && curr !== document.body) {
      if (curr.nodeType === Node.ELEMENT_NODE) {
        const el = curr as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const display = window.getComputedStyle(el).display;
        if (
          ['p', 'li', 'blockquote', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'article', 'section'].includes(tag) ||
          display === 'block' ||
          display === 'list-item'
        ) {
          blockElement = el;
          break;
        }
      }
      curr = curr.parentNode;
    }

    if (!blockElement) {
      blockElement = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement;
    }

    const paragraphText = (blockElement?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!paragraphText) return cleanSelected;

    // 在段落中定位当前选中文本的索引位置
    let matchIndex = paragraphText.indexOf(cleanSelected);
    if (matchIndex === -1) {
      // 忽略大小写再次匹配
      matchIndex = paragraphText.toLowerCase().indexOf(cleanSelected.toLowerCase());
    }

    if (matchIndex === -1) {
      return paragraphText.length < 200 ? paragraphText : cleanSelected;
    }

    const wordStart = matchIndex;
    const wordEnd = matchIndex + cleanSelected.length;

    // 1. 向前扫描找到句首 (句号/问号/感叹号/段首)
    let sentenceStart = 0;
    for (let i = wordStart - 1; i >= 0; i--) {
      const ch = paragraphText[i];
      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
        // 避开常见英文缩写 (如 Mr., Dr., e.g., i.e., vs., U.S.)
        const prevWords = paragraphText.slice(Math.max(0, i - 4), i + 1).toLowerCase();
        if (
          prevWords.endsWith('mr.') ||
          prevWords.endsWith('dr.') ||
          prevWords.endsWith('ms.') ||
          prevWords.endsWith('vs.') ||
          prevWords.endsWith('e.g.') ||
          prevWords.endsWith('i.e.') ||
          prevWords.endsWith('u.s.')
        ) {
          continue;
        }
        sentenceStart = i + 1;
        break;
      }
    }

    // 2. 向后扫描找到句尾 (句号/问号/感叹号/段尾)
    let sentenceEnd = paragraphText.length;
    for (let i = wordEnd; i < paragraphText.length; i++) {
      const ch = paragraphText[i];
      if (ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
        const prevWords = paragraphText.slice(Math.max(0, i - 4), i + 1).toLowerCase();
        if (
          prevWords.endsWith('mr.') ||
          prevWords.endsWith('dr.') ||
          prevWords.endsWith('ms.') ||
          prevWords.endsWith('vs.') ||
          prevWords.endsWith('e.g.') ||
          prevWords.endsWith('i.e.') ||
          prevWords.endsWith('u.s.')
        ) {
          continue;
        }
        sentenceEnd = i + 1;
        break;
      }
    }

    const sentence = paragraphText.slice(sentenceStart, sentenceEnd).trim();
    if (sentence.length >= cleanSelected.length) {
      return sentence;
    }
  } catch (err) {
    console.warn('Failed to extract sentence context:', err);
  }

  return cleanSelected;
}
