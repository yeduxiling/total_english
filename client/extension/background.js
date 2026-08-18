chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  try {
    // 注入提取脚本到当前页面的所有 frame（包括跨域 iframe）
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: async () => {
        try {
          // 1. 第一轮：模拟点击所有处于折叠状态的手风琴按钮与触发器（支持 React/Vue 动态挂载）
          const clickables = document.querySelectorAll(
            '[aria-expanded="false"], [data-state="closed"], .accordion-header, .accordion-button, .accordion-toggle, .accordion__trigger, .accordion-title, summary, [role="button"][aria-expanded="false"], .collapsible-header, .panel-heading'
          );
          clickables.forEach(function (el) {
            try {
              if (typeof el.click === 'function') el.click();
            } catch (err) {}
          });

          // 针对通过 class 或下箭头图标组织的手风琴进行深度触发
          document.querySelectorAll('.accordion, .collapsible, [data-accordion]').forEach(function (acc) {
            const header = acc.querySelector('button, header, h2, h3, h4, .title, [class*="header"], [class*="title"], [class*="toggle"]');
            if (header && typeof header.click === 'function') {
              try { header.click(); } catch (err) {}
            }
          });

          // 等待 350ms，让 React / Vue / 动画完成 DOM 渲染挂载
          await new Promise(function (resolve) { setTimeout(resolve, 350); });

          // 2. 第二轮：强制将所有 CSS 隐藏的手风琴面板、details、collapse 全部设为完全可见
          let count = 0;
          document.querySelectorAll('details').forEach(function (d) {
            d.setAttribute('open', 'true');
            count++;
          });

          const hiddenPanels = document.querySelectorAll(
            '[aria-expanded="false"], [data-state="closed"], .collapsed, .collapse:not(.show), [hidden], .accordion-content, .accordion-body, .panel-collapse, [data-accordion-content], [class*="accordion_body"], [class*="accordion__body"], [class*="accordion-body"], [class*="accordion-content"]'
          );
          hiddenPanels.forEach(function (el) {
            try {
              el.removeAttribute('hidden');
              el.setAttribute('aria-expanded', 'true');
              if (el.hasAttribute('data-state')) el.setAttribute('data-state', 'open');
              if (el.classList.contains('collapsed')) el.classList.remove('collapsed');
              if (el.classList.contains('collapse') && !el.classList.contains('show')) el.classList.add('show');
              el.style.display = 'block';
              el.style.height = 'auto';
              el.style.maxHeight = 'none';
              el.style.opacity = '1';
              el.style.visibility = 'visible';
              count++;
            } catch (err) {}
          });

          // 3. 查找最丰富正文区域
          let contentEl = document.querySelector('main, article, [role="main"], #content, .course-content, .lesson-content, .content, .page-content, body');
          if (!contentEl) contentEl = document.body;

          const clone = contentEl.cloneNode(true);

          // 移除脚本、样式、无用导航
          clone.querySelectorAll('script, style, noscript, nav, header, footer, .sidebar, #sidebar, .header-nav').forEach(function (el) {
            el.remove();
          });

          // 补全所有图片为绝对路径
          clone.querySelectorAll('img').forEach(function (img) {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('data:')) {
              try {
                img.src = new URL(src, window.location.href).href;
              } catch (err) {}
            }
          });

          const textLen = (clone.textContent || '').trim().length;

          return {
            title: document.title || 'Clipped Page',
            url: window.location.href,
            contentHtml: clone.innerHTML,
            textLen: textLen,
            siteName: window.location.hostname.replace(/^www\./, ''),
            count: count,
          };
        } catch (e) {
          return { error: e.message };
        }
      },
    });

    if (!results || results.length === 0) {
      console.warn('Total English Clipper: No frames found.');
      return;
    }

    // 在所有 frame 中找出正文字数最丰富的 frame（解决课件嵌入在 iframe 内部的问题）
    let bestResult = null;
    for (const r of results) {
      if (r && r.result && !r.result.error && (r.result.textLen || 0) > (bestResult ? bestResult.textLen : 0)) {
        bestResult = r.result;
      }
    }

    if (!bestResult || !bestResult.contentHtml || bestResult.textLen < 20) {
      console.warn('Total English Clipper: Content too short or empty.');
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
      throw new Error('Server returned status ' + response.status);
    }

    const created = await response.json();
    if (created && created.id) {
      // 自动在浏览器中打开沉浸式阅读器
      chrome.tabs.create({
        url: 'http://localhost:5173/reading/web/read/' + created.id,
      });
    }
  } catch (err) {
    console.error('Total English Clipper Error:', err);
  }
});
