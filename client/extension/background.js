chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    // 注入提取脚本到当前页面的所有 frame（包括跨域 iframe）
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        try {
          // 1. 强制展开所有手风琴、折叠区域与隐藏面板
          let count = 0;
          document.querySelectorAll('details').forEach(d => {
            d.setAttribute('open', 'true');
            count++;
          });
          document.querySelectorAll('[aria-expanded="false"]').forEach(el => {
            el.setAttribute('aria-expanded', 'true');
            el.removeAttribute('hidden');
            if (el.classList.contains('collapsed')) el.classList.remove('collapsed');
            if (el.classList.contains('collapse') && !el.classList.contains('show')) el.classList.add('show');
            count++;
          });
          document.querySelectorAll('.accordion-body, .panel-collapse, .collapse, [data-accordion-content]').forEach(el => {
            el.style.display = 'block';
            el.style.height = 'auto';
            count++;
          });

          // 2. 查找正文区域
          let contentEl = document.querySelector('main, article, [role="main"], #content, .course-content, .lesson-content, .content');
          if (!contentEl) contentEl = document.body;

          const clone = contentEl.cloneNode(true);
          // 移除干扰标签
          clone.querySelectorAll('script, style, noscript, nav, header, footer, .sidebar, #sidebar').forEach(el => el.remove());
          // 补全图片绝对路径
          clone.querySelectorAll('img').forEach(img => {
            if (img.src) img.src = img.src;
          });

          const textLen = (clone.textContent || '').trim().length;

          return {
            title: document.title || 'Clipped Page',
            url: window.location.href,
            contentHtml: clone.innerHTML,
            textLen: textLen,
            siteName: window.location.hostname.replace(/^www\./, ''),
            count,
          };
        } catch (e) {
          return null;
        }
      },
    });

    if (!results || results.length === 0) {
      alert('Failed to read page content.');
      return;
    }

    // 在所有 frame 中找出文字内容最丰富、最完整的那个 frame（解决课件嵌入在 iframe 内部的问题）
    let bestResult = results[0]?.result;
    for (const r of results) {
      if (r?.result && r.result.textLen > (bestResult?.textLen || 0)) {
        bestResult = r.result;
      }
    }

    if (!bestResult || !bestResult.contentHtml) {
      alert('Unable to extract content from this page.');
      return;
    }

    // 发送给本地 Total English 后端
    const response = await fetch('http://localhost:3001/api/webpages/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: bestResult.title,
        url: bestResult.url,
        contentHtml: bestResult.contentHtml,
        siteName: bestResult.siteName,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const created = await response.json();
    if (created && created.id) {
      // 自动在浏览器中打开沉浸式阅读器
      chrome.tabs.create({
        url: `http://localhost:5173/reading/web/read/${created.id}`,
      });
    }
  } catch (err) {
    console.error('Total English Clipper Error:', err);
  }
});
