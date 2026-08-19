// 获取配置的服务器根地址
async function getServerUrl() {
  const stored = await chrome.storage.local.get(['serverUrl']);
  if (stored.serverUrl && stored.serverUrl.trim()) {
    return stored.serverUrl.trim().replace(/\/+$/, '');
  }
  try {
    const res = await fetch(chrome.runtime.getURL('config.json'));
    const json = await res.json();
    if (json.serverUrl && json.serverUrl.trim()) {
      return json.serverUrl.trim().replace(/\/+$/, '');
    }
  } catch {}
  return 'http://localhost:5173';
}

// 向页面注入半透明 Toast 提示
function showPageToast(tabId, message, type) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (msg, toastType) => {
      const existing = document.getElementById('total-english-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = 'total-english-toast';
      toast.style.position = 'fixed';
      toast.style.top = '24px';
      toast.style.right = '24px';
      toast.style.zIndex = '99999999';
      toast.style.padding = '14px 20px';
      toast.style.borderRadius = '10px';
      toast.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      toast.style.fontSize = '14px';
      toast.style.fontWeight = '600';
      toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5)';
      toast.style.transition = 'all 0.3s ease';
      toast.style.display = 'flex';
      toast.style.alignItems = 'center';
      toast.style.gap = '10px';

      if (toastType === 'success') {
        toast.style.background = '#10b981';
        toast.style.color = '#ffffff';
      } else if (toastType === 'error') {
        toast.style.background = '#ef4444';
        toast.style.color = '#ffffff';
      } else {
        toast.style.background = '#6366f1';
        toast.style.color = '#ffffff';
      }

      toast.textContent = msg;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 400);
      }, toastType === 'error' ? 6000 : 3000);
    },
    args: [message, type],
  }).catch(() => {});
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  const serverUrl = await getServerUrl();
  showPageToast(tab.id, '⏳ Expanding accordions & clipping content...', 'info');

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
      showPageToast(tab.id, '❌ No frame content found on this page.', 'error');
      return;
    }

    // 在所有 frame 中找出正文字数最丰富的 frame
    let bestResult = null;
    for (const r of results) {
      if (r && r.result && !r.result.error && (r.result.textLen || 0) > (bestResult ? bestResult.textLen : 0)) {
        bestResult = r.result;
      }
    }

    if (!bestResult || !bestResult.contentHtml || bestResult.textLen < 20) {
      showPageToast(tab.id, '⚠️ Content is empty or too short to clip.', 'error');
      return;
    }

    // 发送给 Total English 后端 API (/api/webpages/clip)
    const clipApiUrl = serverUrl + '/api/webpages/clip';
    const response = await fetch(clipApiUrl, {
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
      throw new Error('Server returned HTTP ' + response.status + ' (' + clipApiUrl + ')');
    }

    const created = await response.json();
    if (created && created.id) {
      showPageToast(tab.id, '🎉 Clipped successfully! Opening reader...', 'success');
      // 自动在浏览器新标签页中打开沉浸式阅读器
      chrome.tabs.create({
        url: `${serverUrl}/reading/web/read/${created.id}`,
      });
    }
  } catch (err) {
    console.error('Total English Clipper Error:', err);
    showPageToast(tab.id, `❌ Failed to connect to ${serverUrl}: ${err.message}`, 'error');
    // 如果连接失败，自动打开选项页面引导用户查看或修改服务器地址
    chrome.runtime.openOptionsPage();
  }
});
