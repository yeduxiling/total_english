/**
 * 提取书籍主标题（去除副标题，例如 "The Scout Mindset: Why Some People..." -> "The Scout Mindset"）
 */
export function getMainTitle(title: string | null | undefined): string {
  if (!title) return '';
  // 匹配冒号、中文冒号、破折号、分号或换行作为主副标题分隔符
  const parts = title.split(/\s*[:：]\s*|\s+[—–-]\s+|\s*--\s*|\n/);
  return parts[0]?.trim() || title.trim();
}
