/**
 * 从可能包含 HTML 的错误字符串中清洗出干净的人类可读文本
 */
function cleanErrorMessage(rawText: string, status: number): string {
  if (!rawText || rawText.trim() === '') {
    return `服务器响应异常 (HTTP ${status})，请稍后重试。`;
  }

  const trimmed = rawText.trim();

  // 如果包含 HTML 标签（如 <html>, <!DOCTYPE 等）
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    // 尝试提取 <title> 或 <body> 中的主要描述
    const titleMatch = trimmed.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const titleText = titleMatch[1].trim();
      return `服务器服务异常 (HTTP ${status} - ${titleText})，请检查网络或后端服务配置。`;
    }

    // 剥离所有 HTML 标签
    const cleanText = trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanText.length > 0) {
      // 限制提取长度在 150 字以内
      const shortText = cleanText.length > 150 ? cleanText.substring(0, 150) + '...' : cleanText;
      return `服务器响应格式异常 (HTTP ${status}): ${shortText}`;
    }

    return `服务器网关或内部异常 (HTTP ${status})，请稍后重试。`;
  }

  return trimmed;
}

/**
 * 前端通用安全 API 请求与响应 JSON 解析器
 * 1. 自动检查 Content-Type 与 HTTP 状态
 * 2. 杜绝对 HTML 网页或非法格式硬执行 res.json() 导致的 "Unexpected token '<'" 极难看报错
 * 3. 自动转换提取清晰友好的错误信息
 */
export async function safeFetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (netErr: any) {
    throw new Error(`网络连接失败，请检查网络设置或后端服务是否正常运行。(${netErr.message || 'NetworkError'})`);
  }

  const contentType = res.headers.get('content-type') || '';
  const isJsonContentType = contentType.includes('application/json');

  if (!res.ok) {
    let errorMsg = '';
    try {
      const text = await res.text();
      if (text && (isJsonContentType || text.trim().startsWith('{') || text.trim().startsWith('['))) {
        try {
          const jsonErr = JSON.parse(text);
          errorMsg = jsonErr.error || jsonErr.message || text;
        } catch {
          errorMsg = cleanErrorMessage(text, res.status);
        }
      } else {
        errorMsg = cleanErrorMessage(text, res.status);
      }
    } catch {
      errorMsg = `请求失败 (HTTP ${res.status})`;
    }

    // 防爆兜底清洗：如果 errorMsg 自身仍残留 html
    if (/<[a-z][\s\S]*>/i.test(errorMsg)) {
      errorMsg = cleanErrorMessage(errorMsg, res.status);
    }

    throw new Error(errorMsg);
  }

  // HTTP 200 OK 时的 JSON 安全解析
  const rawText = await res.text();
  if (!rawText || rawText.trim() === '') {
    throw new Error('服务器返回了空内容');
  }

  try {
    return JSON.parse(rawText) as T;
  } catch (parseErr) {
    if (rawText.trim().startsWith('<')) {
      throw new Error(`服务器返回了网页内容而非预期数据 (HTTP ${res.status})，请检查后端 API 路由。`);
    }
    throw new Error(`数据格式解析失败: ${(parseErr as Error).message}`);
  }
}
