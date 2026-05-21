/**
 * 弹性容错：自动闭合被截断的 JSON 字符串
 */
export function repairTruncatedJson(jsonStr: string): string {
  jsonStr = jsonStr.trim();
  
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') {
          stack.pop();
        }
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') {
          stack.pop();
        }
      }
    }
  }

  // 1. 如果在字符串内部被截断，补上引号
  if (inString) {
    jsonStr += '"';
  }

  // 2. 逆序补全所有未闭合的括号
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') {
      jsonStr += '}';
    } else if (last === '[') {
      jsonStr += ']';
    }
  }

  return jsonStr;
}

/**
 * 极度强健的 JSON 或纯文本解析器 (专为 LLM 响应设计)
 * 1. 自动定位、裁剪前导废话与可能存在的不完整 Markdown 代码块标记
 * 2. 尝试常规 JSON 解析
 * 3. 尝试截断修补 JSON 解析
 * 4. 对于 Reroll 等场景，如果都失败了，且确实不是以 { 开头，将其视为纯文本直接填充该字段返回
 */
export function parseLlmResponse<T>(rawContent: string, fallbackKey?: keyof T): T {
  let jsonStr = rawContent.trim();

  // 1. 定位并剥离 Markdown 包装，去除前导多余文本与后导标记 (无需成对出现)
  const startIdx = jsonStr.indexOf('```');
  if (startIdx !== -1) {
    // 裁剪掉代码块起点之前的所有前导废话
    jsonStr = jsonStr.substring(startIdx);
    // 清除开头的 ```json 或 ``` 及其后续换行空白
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '');
    // 清除可能存在的末尾单边或成对的 ``` 标记
    jsonStr = jsonStr.replace(/\s*```$/i, '');
  }

  // 2. 尝试常规解析
  try {
    return JSON.parse(jsonStr) as T;
  } catch (initialError) {
    // 3. 尝试自动补全截断解析
    try {
      const repaired = repairTruncatedJson(jsonStr);
      return JSON.parse(repaired) as T;
    } catch (repairError) {
      // 4. 最终兜底方案：如果指定了 fallbackKey 且看起来确实不像是一个 JSON 块，
      // 我们直接将这行纯文本内容以指定字段返回，防止直接报错崩溃。
      if (fallbackKey && typeof fallbackKey === 'string') {
        const cleanText = jsonStr.trim();
        const fallbackObj = {
          [fallbackKey]: cleanText
        } as unknown as T;
        console.warn('⚠️ JSON parsing completely failed. Fallback to raw text for key:', fallbackKey, 'content:', cleanText);
        return fallbackObj;
      }
      throw new Error(`Failed to parse LLM response. Raw content: ${rawContent}`);
    }
  }
}
