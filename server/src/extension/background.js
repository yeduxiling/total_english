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
  showPageToast(tab.id, '⏳ Expanding accordions & extracting full content...', 'info');

  try {
    // 注入提取脚本到当前页面的所有 frame（包括多层嵌套 iframe）
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: async () => {
        try {
          // 0. 优先检测当前 frame 是否有用户选中的文字
          const selection = window.getSelection();
          let selectedHtml = '';
          if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
            const container = document.createElement('div');
            for (let i = 0; i < selection.rangeCount; i++) {
              container.appendChild(selection.getRangeAt(i).cloneContents());
            }
            selectedHtml = container.innerHTML.trim();
          }

          // 1. 第一轮：模拟点击所有处于折叠状态的手风琴与展开按钮
          const clickables = document.querySelectorAll(
            '[aria-expanded="false"], [data-state="closed"], .accordion-header, .accordion-button, .accordion-toggle, .accordion__trigger, .accordion-title, summary, [role="button"][aria-expanded="false"], .collapsible-header, .panel-heading'
          );
          clickables.forEach(function (el) {
            try { if (typeof el.click === 'function') el.click(); } catch (err) {}
          });

          document.querySelectorAll('.accordion, .collapsible, [data-accordion]').forEach(function (acc) {
            const header = acc.querySelector('button, header, h2, h3, h4, .title, [class*="header"], [class*="title"], [class*="toggle"]');
            if (header && typeof header.click === 'function') {
              try { header.click(); } catch (err) {}
            }
          });

          // 等待 350ms，让 React / Vue / LMS 动画完成 DOM 渲染挂载
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

          // 3. 提取当前 frame 的主体 DOM
          const bodyClone = document.body ? document.body.cloneNode(true) : document.createElement('div');

          // 只精准移除无用外壳，保留所有的正文容器和标题
          bodyClone.querySelectorAll('script, style, noscript, nav, .site-header, #site-header, .global-nav, .top-bar, .site-footer, #site-footer').forEach(function (el) {
            el.remove();
          });

          // 补全所有图片绝对路径
          bodyClone.querySelectorAll('img').forEach(function (img) {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('data:')) {
              try {
                img.src = new URL(src, window.location.href).href;
              } catch (err) {}
            }
          });

          // 4. 精准打分：计算正文段落密度（Paragraphs Score）
          // 课件正文 frame 必定包含很多实质段落 (<p>) 和长英文句子，而外壳页面全是一两个词的菜单链接
          const pElements = bodyClone.querySelectorAll('p, blockquote, li, pre');
          let paragraphTextLen = 0;
          pElements.forEach(p => {
            paragraphTextLen += (p.textContent || '').trim().length;
          });

          const totalText = (bodyClone.textContent || '').trim();
          const totalTextLen = totalText.length;
          const pCount = pElements.length;

          // 综合评分：段落文字长度 * 2 + 段落数量 * 50 + 总字数
          const qualityScore = (selectedHtml ? 100000 : 0) + (paragraphTextLen * 2) + (pCount * 50) + totalTextLen;

          // 提取最佳页面标题
          let pageTitle = '';
          const h1 = bodyClone.querySelector('h1, h2, h3, .title');
          if (h1 && (h1.textContent || '').trim().length > 3) {
            pageTitle = (h1.textContent || '').trim();
          } else {
            pageTitle = document.title || 'Clipped Article';
          }

          return {
            title: pageTitle,
            url: window.location.href,
            contentHtml: selectedHtml || bodyClone.innerHTML,
            totalTextLen: totalTextLen,
            paragraphTextLen: paragraphTextLen,
            pCount: pCount,
            qualityScore: qualityScore,
            hasSelection: !!selectedHtml,
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

    // 智能筛选出得分最高（正文段落最丰富、最具课件实质内容）的 frame
    let bestResult = null;
    for (const r of results) {
      if (r && r.result && !r.result.error) {
        if (!bestResult || (r.result.qualityScore || 0) > (bestResult.qualityScore || 0)) {
          bestResult = r.result;
        }
      }
    }

    if (!bestResult || !bestResult.contentHtml || (bestResult.totalTextLen < 20 && !bestResult.hasSelection)) {
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
    chrome.runtime.openOptionsPage();
  }
});
