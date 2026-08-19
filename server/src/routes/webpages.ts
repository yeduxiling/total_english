import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/init.js';
import { parseWebArticle } from '../services/webParser.js';

export const webpagesRouter = Router();

/**
 * 0. 浏览器一键剪藏 (Web Clipper / Bookmarklet 接收接口)
 * POST /api/webpages/clip { title, contentHtml, url, byline?, siteName?, coverImage? }
 */
webpagesRouter.post('/clip', async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, contentHtml, url, byline, siteName, coverImage } = req.body;
    if (!contentHtml || typeof contentHtml !== 'string') {
      res.status(400).json({ error: 'Content HTML is required.' });
      return;
    }

    const { createCustomWebArticle } = await import('../services/webParser.js');
    const parsed = createCustomWebArticle(title || 'Clipped Article', contentHtml, url, byline);

    const db = getDb();
    const pageId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO web_pages (
        id, url, title, byline, site_name, excerpt, content_html, text_content, cover_image,
        reading_progress, estimated_reading_minutes, last_read_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      pageId,
      url || 'clip://' + pageId,
      parsed.title,
      parsed.byline,
      siteName || parsed.siteName,
      parsed.excerpt,
      parsed.contentHtml,
      parsed.textContent,
      coverImage || parsed.coverImage,
      parsed.estimatedReadingMinutes,
      now
    );

    const created = db.prepare('SELECT * FROM web_pages WHERE id = ?').get(pageId);
    
    // 如果是浏览器 Form 提交（用于绕过 HTTPS 混合内容限制），直接重定向至阅读器页面打开！
    const isFormSubmit = req.headers['content-type']?.includes('application/x-www-form-urlencoded') ||
                         req.headers['sec-fetch-mode'] === 'navigate';
    if (isFormSubmit) {
      res.redirect(`http://localhost:5173/reading/web/read/${pageId}`);
      return;
    }

    res.status(201).json(created);
  } catch (err: any) {
    console.error('Failed to clip webpage:', err);
    res.status(500).json({ error: err.message || 'Failed to save clipped webpage.' });
  }
});

/**
 * 0.1 动态打包并下载 Total English 浏览器扩展 (.zip)
 * GET /api/webpages/extension/download
 * 自动将 config.json 中的 serverUrl 替换为当前访问的服务器域名！
 */
webpagesRouter.get('/extension/download', async (req: Request, res: Response): Promise<void> => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const AdmZip = (await import('adm-zip')).default;

    // 智能获取当前站点的真实外部访问地址（支持 Nginx 反向代理头）
    const forwardedProto = (req.headers['x-forwarded-proto'] as string) || '';
    const protocol = forwardedProto.split(',')[0].trim() || req.protocol || 'http';
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || '';
    const host = forwardedHost.split(',')[0].trim() || req.get('host') || 'localhost:5173';
    
    let serverOrigin = `${protocol}://${host}`;
    if (host === 'localhost:3001' || host === '127.0.0.1:3001') {
      serverOrigin = 'http://localhost:5173';
    }

    const zip = new AdmZip();

    // 查找源码目录
    const possibleDirs = [
      path.resolve(process.cwd(), 'src/extension'),
      path.resolve(process.cwd(), 'dist/extension'),
      path.resolve(process.cwd(), '../client/extension'),
      path.resolve(process.cwd(), 'client/extension'),
      path.resolve('/app/src/extension'),
      path.resolve('/app/client/extension'),
    ];

    let extDir = possibleDirs.find(d => fs.existsSync(d));

    if (extDir && fs.existsSync(extDir)) {
      const files = fs.readdirSync(extDir);
      for (const file of files) {
        const filePath = path.join(extDir, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          if (file === 'config.json') {
            const dynamicConfig = JSON.stringify({ serverUrl: serverOrigin }, null, 2);
            zip.addFile('config.json', Buffer.from(dynamicConfig, 'utf8'));
          } else {
            const content = fs.readFileSync(filePath);
            zip.addFile(file, content);
          }
        }
      }
    }

    // 关键双保险：如果 zip 中缺少必要文件，注入完整生产代码！
    const entries = zip.getEntries().map(e => e.entryName);

    if (!entries.includes('manifest.json')) {
      const manifest = {
        manifest_version: 3,
        name: "Total English Web Clipper",
        version: "1.1.0",
        description: "1-Click clip any article, LMS course, or webpage to Total English reader with AI tools.",
        permissions: ["activeTab", "scripting", "storage"],
        host_permissions: ["<all_urls>"],
        action: { default_title: "Clip to Total English (Auto-expands all accordions)" },
        options_page: "options.html",
        background: { service_worker: "background.js" }
      };
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    }

    if (!entries.includes('config.json')) {
      zip.addFile('config.json', Buffer.from(JSON.stringify({ serverUrl: serverOrigin }, null, 2), 'utf8'));
    }

    if (!entries.includes('options.html')) {
      const optionsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Total English Clipper Settings</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #18181b; color: #f4f4f5; padding: 32px; max-width: 480px; margin: 0 auto; }
    h2 { font-size: 20px; margin-top: 0; color: #ffffff; display: flex; align-items: center; gap: 8px; }
    p { font-size: 13.5px; color: #a1a1aa; line-height: 1.5; }
    .form-group { margin: 24px 0; }
    label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #e4e4e7; }
    input { width: 100%; box-sizing: border-box; padding: 10px 14px; background: #27272a; border: 1px solid #3f3f46; border-radius: 6px; color: #ffffff; font-size: 14px; outline: none; }
    input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); }
    .btn-row { display: flex; gap: 12px; }
    button { padding: 10px 20px; border-radius: 6px; font-size: 13.5px; font-weight: 600; cursor: pointer; border: none; background: #6366f1; color: #ffffff; }
    button:hover { background: #4f46e5; }
    .status-msg { margin-top: 16px; font-size: 13px; padding: 8px 12px; border-radius: 6px; display: none; }
    .status-success { background: rgba(34, 197, 94, 0.1); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.25); }
    .status-error { background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.25); }
  </style>
</head>
<body>
  <h2><span>⚙️</span> Total English Clipper Settings</h2>
  <p>Configure the server address where clipped articles will be saved and opened.</p>
  <div class="form-group">
    <label for="serverUrl">Total English Server URL</label>
    <input type="url" id="serverUrl" placeholder="https://your-domain.com" required>
  </div>
  <div class="btn-row"><button id="saveBtn">Save & Test Connection</button></div>
  <div id="statusMsg" class="status-msg"></div>
  <script src="options.js"></script>
</body>
</html>`;
      zip.addFile('options.html', Buffer.from(optionsHtml, 'utf8'));
    }

    if (!entries.includes('options.js')) {
      const optionsJs = `const input = document.getElementById('serverUrl');
const saveBtn = document.getElementById('saveBtn');
const statusMsg = document.getElementById('statusMsg');
function showStatus(text, isError) { statusMsg.textContent = text; statusMsg.className = 'status-msg ' + (isError ? 'status-error' : 'status-success'); statusMsg.style.display = 'block'; }
async function loadConfig() {
  const stored = await chrome.storage.local.get(['serverUrl']);
  if (stored.serverUrl) { input.value = stored.serverUrl; return; }
  try { const res = await fetch(chrome.runtime.getURL('config.json')); const json = await res.json(); if (json.serverUrl) input.value = json.serverUrl; } catch {}
}
saveBtn.addEventListener('click', async () => {
  let url = (input.value || '').trim().replace(/\\/+$/, '');
  if (!url) { showStatus('Please enter a valid server URL.', true); return; }
  saveBtn.disabled = true; saveBtn.textContent = 'Testing connection...';
  try {
    const testRes = await fetch(url + '/api/health');
    if (testRes.ok) { await chrome.storage.local.set({ serverUrl: url }); showStatus('✅ Connected & saved successfully!', false); }
    else { await chrome.storage.local.set({ serverUrl: url }); showStatus('⚠️ Saved, but server returned HTTP ' + testRes.status, true); }
  } catch (err) { await chrome.storage.local.set({ serverUrl: url }); showStatus('⚠️ Saved, but failed to connect (' + err.message + ').', true); }
  finally { saveBtn.disabled = false; saveBtn.textContent = 'Save & Test Connection'; }
});
loadConfig();`;
      zip.addFile('options.js', Buffer.from(optionsJs, 'utf8'));
    }

    if (!entries.includes('background.js')) {
      const backgroundJs = `async function getServerUrl() {
  const stored = await chrome.storage.local.get(['serverUrl']);
  if (stored.serverUrl && stored.serverUrl.trim()) return stored.serverUrl.trim().replace(/\\/+$/, '');
  try { const res = await fetch(chrome.runtime.getURL('config.json')); const json = await res.json(); if (json.serverUrl && json.serverUrl.trim()) return json.serverUrl.trim().replace(/\\/+$/, ''); } catch {}
  return 'http://localhost:5173';
}
function showPageToast(tabId, message, type) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (msg, toastType) => {
      const existing = document.getElementById('total-english-toast');
      if (existing) existing.remove();
      const toast = document.createElement('div');
      toast.id = 'total-english-toast';
      toast.style.position = 'fixed'; toast.style.top = '24px'; toast.style.right = '24px'; toast.style.zIndex = '99999999';
      toast.style.padding = '14px 20px'; toast.style.borderRadius = '10px'; toast.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      toast.style.fontSize = '14px'; toast.style.fontWeight = '600'; toast.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5)';
      toast.style.transition = 'all 0.3s ease'; toast.style.display = 'flex'; toast.style.alignItems = 'center'; toast.style.gap = '10px';
      if (toastType === 'success') { toast.style.background = '#10b981'; toast.style.color = '#ffffff'; }
      else if (toastType === 'error') { toast.style.background = '#ef4444'; toast.style.color = '#ffffff'; }
      else { toast.style.background = '#6366f1'; toast.style.color = '#ffffff'; }
      toast.textContent = msg; document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-10px)'; setTimeout(() => toast.remove(), 400); }, toastType === 'error' ? 6000 : 3000);
    },
    args: [message, type],
  }).catch(() => {});
}
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  const serverUrl = await getServerUrl();
  showPageToast(tab.id, '⏳ Expanding accordions & extracting full content...', 'info');
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: async () => {
        try {
          const selection = window.getSelection();
          let selectedHtml = '';
          if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
            const container = document.createElement('div');
            for (let i = 0; i < selection.rangeCount; i++) container.appendChild(selection.getRangeAt(i).cloneContents());
            selectedHtml = container.innerHTML.trim();
          }
          const clickables = document.querySelectorAll('[aria-expanded="false"], [data-state="closed"], .accordion-header, .accordion-button, .accordion-toggle, .accordion__trigger, .accordion-title, summary, [role="button"][aria-expanded="false"], .collapsible-header, .panel-heading');
          clickables.forEach(function(el) { try { if (typeof el.click === 'function') el.click(); } catch(err) {} });
          document.querySelectorAll('.accordion, .collapsible, [data-accordion]').forEach(function(acc) {
            const header = acc.querySelector('button, header, h2, h3, h4, .title, [class*="header"], [class*="title"], [class*="toggle"]');
            if (header && typeof header.click === 'function') { try { header.click(); } catch(err) {} }
          });
          await new Promise(function(resolve) { setTimeout(resolve, 350); });
          let count = 0;
          document.querySelectorAll('details').forEach(function(d) { d.setAttribute('open', 'true'); count++; });
          const hiddenPanels = document.querySelectorAll('[aria-expanded="false"], [data-state="closed"], .collapsed, .collapse:not(.show), [hidden], .accordion-content, .accordion-body, .panel-collapse, [data-accordion-content], [class*="accordion_body"], [class*="accordion__body"], [class*="accordion-body"], [class*="accordion-content"]');
          hiddenPanels.forEach(function(el) {
            try {
              el.removeAttribute('hidden'); el.setAttribute('aria-expanded', 'true');
              if (el.hasAttribute('data-state')) el.setAttribute('data-state', 'open');
              if (el.classList.contains('collapsed')) el.classList.remove('collapsed');
              if (el.classList.contains('collapse') && !el.classList.contains('show')) el.classList.add('show');
              el.style.display = 'block'; el.style.height = 'auto'; el.style.maxHeight = 'none'; el.style.opacity = '1'; el.style.visibility = 'visible'; count++;
            } catch(err) {}
          });
          const bodyClone = document.body ? document.body.cloneNode(true) : document.createElement('div');
          bodyClone.querySelectorAll('script, style, noscript, nav, .site-header, #site-header, .global-nav, .top-bar, .site-footer, #site-footer').forEach(function(el) { el.remove(); });
          bodyClone.querySelectorAll('img').forEach(function(img) {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('data:')) { try { img.src = new URL(src, window.location.href).href; } catch(err) {} }
          });
          const pElements = bodyClone.querySelectorAll('p, blockquote, li, pre');
          let paragraphTextLen = 0;
          pElements.forEach(p => { paragraphTextLen += (p.textContent || '').trim().length; });
          const totalText = (bodyClone.textContent || '').trim();
          const totalTextLen = totalText.length;
          const pCount = pElements.length;
          const qualityScore = (selectedHtml ? 100000 : 0) + (paragraphTextLen * 2) + (pCount * 50) + totalTextLen;
          let pageTitle = '';
          const h1 = bodyClone.querySelector('h1, h2, h3, .title');
          if (h1 && (h1.textContent || '').trim().length > 3) pageTitle = (h1.textContent || '').trim();
          else pageTitle = document.title || 'Clipped Article';
          return { title: pageTitle, url: window.location.href, contentHtml: selectedHtml || bodyClone.innerHTML, totalTextLen: totalTextLen, paragraphTextLen: paragraphTextLen, pCount: pCount, qualityScore: qualityScore, hasSelection: !!selectedHtml, siteName: window.location.hostname.replace(/^www\\./, ''), count: count };
        } catch(e) { return { error: e.message }; }
      },
    });
    if (!results || results.length === 0) { showPageToast(tab.id, '❌ No frame content found on this page.', 'error'); return; }
    let bestResult = null;
    for (const r of results) {
      if (r && r.result && !r.result.error) {
        if (!bestResult || (r.result.qualityScore || 0) > (bestResult.qualityScore || 0)) bestResult = r.result;
      }
    }
    if (!bestResult || !bestResult.contentHtml || (bestResult.totalTextLen < 20 && !bestResult.hasSelection)) { showPageToast(tab.id, '⚠️ Content is empty or too short to clip.', 'error'); return; }
    const clipApiUrl = serverUrl + '/api/webpages/clip';
    const response = await fetch(clipApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: bestResult.title, url: bestResult.url, contentHtml: bestResult.contentHtml, siteName: bestResult.siteName }),
    });
    if (!response.ok) throw new Error('Server returned HTTP ' + response.status + ' (' + clipApiUrl + ')');
    const created = await response.json();
    if (created && created.id) {
      showPageToast(tab.id, '🎉 Clipped successfully! Opening reader...', 'success');
      chrome.tabs.create({ url: serverUrl + '/reading/web/read/' + created.id });
    }
  } catch(err) {
    console.error('Total English Clipper Error:', err);
    showPageToast(tab.id, '❌ Failed to connect to ' + serverUrl + ': ' + err.message, 'error');
    chrome.runtime.openOptionsPage();
  }
});`;
      zip.addFile('background.js', Buffer.from(backgroundJs, 'utf8'));
    }

    const zipBuffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="total-english-clipper.zip"');
    res.setHeader('Content-Length', zipBuffer.length.toString());
    res.send(zipBuffer);
  } catch (err: any) {
    console.error('Failed to generate extension zip:', err);
    res.status(500).json({ error: 'Failed to generate extension package.' });
  }
});

/**
 * 1. 仅解析网页 (用于前端预览或校验)
 * POST /api/webpages/parse { url }
 */
webpagesRouter.post('/parse', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
      res.status(400).json({ error: 'Please provide a valid HTTP/HTTPS webpage URL.' });
      return;
    }

    const parsed = await parseWebArticle(url.trim());
    res.json(parsed);
  } catch (err: any) {
    console.error('Failed to parse webpage:', err);
    res.status(500).json({ error: err.message || 'Failed to parse webpage content.' });
  }
});

/**
 * 2. 导入并保存网页文章
 * POST /api/webpages { url, title?, byline?, ... }
 */
webpagesRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, title, byline, siteName, excerpt, contentHtml, textContent, coverImage, estimatedReadingMinutes } = req.body;
    if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
      res.status(400).json({ error: 'Please provide a valid HTTP/HTTPS webpage URL.' });
      return;
    }

    const db = getDb();
    const cleanUrl = url.trim();

    // 检查是否已经导入过该 URL
    const existing = db.prepare('SELECT * FROM web_pages WHERE url = ?').get(cleanUrl) as any;
    if (existing) {
      // 已经存在，更新阅读时间并直接返回已有记录
      const now = new Date().toISOString();
      db.prepare('UPDATE web_pages SET last_read_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(now, existing.id);
      res.json({ ...existing, last_read_at: now, isExisting: true });
      return;
    }

    // 如果未传已解析内容，则在此处抓取
    let articleData = {
      title: title || '',
      byline: byline || null,
      siteName: siteName || '',
      excerpt: excerpt || null,
      contentHtml: contentHtml || '',
      textContent: textContent || '',
      coverImage: coverImage || null,
      estimatedReadingMinutes: estimatedReadingMinutes || 1,
    };

    if (!articleData.contentHtml) {
      const parsed = await parseWebArticle(cleanUrl);
      articleData = {
        title: parsed.title,
        byline: parsed.byline,
        siteName: parsed.siteName,
        excerpt: parsed.excerpt,
        contentHtml: parsed.contentHtml,
        textContent: parsed.textContent,
        coverImage: parsed.coverImage,
        estimatedReadingMinutes: parsed.estimatedReadingMinutes,
      };
    }

    const pageId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO web_pages (
        id, url, title, byline, site_name, excerpt, content_html, text_content, cover_image,
        reading_progress, estimated_reading_minutes, last_read_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      pageId,
      cleanUrl,
      articleData.title,
      articleData.byline,
      articleData.siteName,
      articleData.excerpt,
      articleData.contentHtml,
      articleData.textContent,
      articleData.coverImage,
      articleData.estimatedReadingMinutes,
      now
    );

    const created = db.prepare('SELECT * FROM web_pages WHERE id = ?').get(pageId);
    res.status(201).json(created);
  } catch (err: any) {
    console.error('Failed to save webpage:', err);
    res.status(500).json({ error: err.message || 'Failed to save webpage article.' });
  }
});

/**
 * 2.1 直接保存用户粘贴的文本/富文本内容
 * POST /api/webpages/custom { title, content, url?, byline? }
 */
webpagesRouter.post('/custom', async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, content, url, byline } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'Article content cannot be empty.' });
      return;
    }

    const { createCustomWebArticle } = await import('../services/webParser.js');
    const parsed = createCustomWebArticle(title || 'Custom Article', content, url, byline);

    const db = getDb();
    const pageId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO web_pages (
        id, url, title, byline, site_name, excerpt, content_html, text_content, cover_image,
        reading_progress, estimated_reading_minutes, last_read_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      pageId,
      parsed.url || 'custom://' + pageId,
      parsed.title,
      parsed.byline,
      parsed.siteName,
      parsed.excerpt,
      parsed.contentHtml,
      parsed.textContent,
      parsed.coverImage,
      parsed.estimatedReadingMinutes,
      now
    );

    const created = db.prepare('SELECT * FROM web_pages WHERE id = ?').get(pageId);
    res.status(201).json(created);
  } catch (err: any) {
    console.error('Failed to save custom article:', err);
    res.status(500).json({ error: err.message || 'Failed to save custom article.' });
  }
});

/**
 * 3. 获取所有网页文章列表 (Collection)
 * GET /api/webpages
 */
webpagesRouter.get('/', (_req: Request, res: Response): void => {
  try {
    const db = getDb();
    const pages = db.prepare(`
      SELECT id, url, title, byline, site_name, excerpt, cover_image, reading_progress,
             estimated_reading_minutes, last_read_at, created_at
      FROM web_pages
      ORDER BY created_at DESC
    `).all();
    res.json(pages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. 获取最近阅读的网页文章
 * GET /api/webpages/recent
 */
webpagesRouter.get('/recent', (_req: Request, res: Response): void => {
  try {
    const db = getDb();
    const pages = db.prepare(`
      SELECT id, url, title, byline, site_name, excerpt, cover_image, reading_progress,
             estimated_reading_minutes, last_read_at, created_at
      FROM web_pages
      ORDER BY COALESCE(last_read_at, created_at) DESC
      LIMIT 6
    `).all();
    res.json(pages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. 获取单篇网页文章完整详情（含划线与想法）
 * GET /api/webpages/:id
 */
webpagesRouter.get('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const db = getDb();
    const page = db.prepare('SELECT * FROM web_pages WHERE id = ?').get(id) as any;
    if (!page) {
      res.status(404).json({ error: 'Article not found.' });
      return;
    }

    const highlights = db.prepare('SELECT * FROM web_page_highlights WHERE page_id = ? ORDER BY created_at ASC').all(id);
    const notes = db.prepare('SELECT * FROM web_page_notes WHERE page_id = ? ORDER BY created_at ASC').all(id);

    // 自动更新阅读时间
    const now = new Date().toISOString();
    db.prepare('UPDATE web_pages SET last_read_at = ? WHERE id = ?').run(now, id);

    res.json({
      page: { ...page, last_read_at: now },
      highlights,
      notes,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 6. 更新阅读进度
 * PUT /api/webpages/:id/progress { progress }
 */
webpagesRouter.put('/:id/progress', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const { progress } = req.body;
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE web_pages SET reading_progress = ?, last_read_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(typeof progress === 'number' ? progress : 0, now, id);
    res.json({ success: true, last_read_at: now });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. 删除网页文章
 * DELETE /api/webpages/:id
 */
webpagesRouter.delete('/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const db = getDb();
    db.prepare('DELETE FROM web_pages WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 8. 划线高亮 CRUD
 */
webpagesRouter.post('/:id/highlights', (req: Request, res: Response): void => {
  try {
    const { id: pageId } = req.params;
    const { text, color, rangeInfo } = req.body;
    if (!text || !rangeInfo) {
      res.status(400).json({ error: 'Text and rangeInfo are required.' });
      return;
    }
    const highlightId = uuidv4();
    const db = getDb();
    db.prepare(`
      INSERT INTO web_page_highlights (id, page_id, text, color, range_info, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(highlightId, pageId, text.trim(), color || 'yellow', typeof rangeInfo === 'string' ? rangeInfo : JSON.stringify(rangeInfo));

    const created = db.prepare('SELECT * FROM web_page_highlights WHERE id = ?').get(highlightId);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

webpagesRouter.patch('/highlights/:highlightId', (req: Request, res: Response): void => {
  try {
    const { highlightId } = req.params;
    const { color } = req.body;
    const db = getDb();
    db.prepare('UPDATE web_page_highlights SET color = ? WHERE id = ?').run(color || 'yellow', highlightId);
    const updated = db.prepare('SELECT * FROM web_page_highlights WHERE id = ?').get(highlightId);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

webpagesRouter.delete('/highlights/:highlightId', (req: Request, res: Response): void => {
  try {
    const { highlightId } = req.params;
    const db = getDb();
    db.prepare('DELETE FROM web_page_highlights WHERE id = ?').run(highlightId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 9. 想法笔记 CRUD
 */
webpagesRouter.post('/:id/notes', (req: Request, res: Response): void => {
  try {
    const { id: pageId } = req.params;
    const { highlightId, referencedText, content } = req.body;
    if (!content || !referencedText) {
      res.status(400).json({ error: 'Content and referencedText are required.' });
      return;
    }
    const noteId = uuidv4();
    const db = getDb();
    db.prepare(`
      INSERT INTO web_page_notes (id, page_id, highlight_id, referenced_text, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(noteId, pageId, highlightId || null, referencedText.trim(), content.trim());

    const created = db.prepare('SELECT * FROM web_page_notes WHERE id = ?').get(noteId);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

webpagesRouter.put('/notes/:noteId', (req: Request, res: Response): void => {
  try {
    const { noteId } = req.params;
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ error: 'Content is required.' });
      return;
    }
    const db = getDb();
    db.prepare('UPDATE web_page_notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(content.trim(), noteId);
    const updated = db.prepare('SELECT * FROM web_page_notes WHERE id = ?').get(noteId);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

webpagesRouter.delete('/notes/:noteId', (req: Request, res: Response): void => {
  try {
    const { noteId } = req.params;
    const db = getDb();
    db.prepare('DELETE FROM web_page_notes WHERE id = ?').run(noteId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
