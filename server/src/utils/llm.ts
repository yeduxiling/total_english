interface LlmRequestOptions {
  apiUrl: string;
  apiKey: string;
  requestBody: any;
  maxRetries?: number;
  baseDelayMs?: number;
}

/**
 * 带有指数退避自动重试的超级强健的大模型调用工具
 */
export async function callLlmWithRetry(options: LlmRequestOptions): Promise<string> {
  const { apiUrl, apiKey, requestBody, maxRetries = 3, baseDelayMs = 300 } = options;

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📡 [LLM Call] Attempt ${attempt}/${maxRetries} to URL: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Model API error (HTTP ${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as any;
      const rawContent = data.choices?.[0]?.message?.content;

      // 如果返回内容为空、null 或 undefined，视为需要重试的暂时性故障
      if (rawContent === undefined || rawContent === null || rawContent.trim() === '') {
        throw new Error('Model returned an empty or undefined response content.');
      }

      // 成功获取到非空内容，直接返回
      console.log(`✅ [LLM Call] Success on attempt ${attempt}`);
      return rawContent;
    } catch (err: any) {
      lastError = err;
      console.warn(`⚠️ [LLM Call Attempt ${attempt}/${maxRetries} Failed]: ${err.message}`);
      
      if (attempt < maxRetries) {
        // 指数退避等待首轮 300ms，次轮 600ms 等
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(`⏱️ Waiting ${delay}ms before next attempt...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // 如果所有重试都失败了，抛出包含详细原因的最终错误
  throw lastError || new Error('All LLM call attempts failed.');
}
