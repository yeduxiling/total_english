const input = document.getElementById('serverUrl');
const saveBtn = document.getElementById('saveBtn');
const statusMsg = document.getElementById('statusMsg');

function showStatus(text, isError) {
  statusMsg.textContent = text;
  statusMsg.className = 'status-msg ' + (isError ? 'status-error' : 'status-success');
  statusMsg.style.display = 'block';
}

// 页面加载时读取已有配置
async function loadConfig() {
  const stored = await chrome.storage.local.get(['serverUrl']);
  if (stored.serverUrl) {
    input.value = stored.serverUrl;
    return;
  }
  try {
    const res = await fetch(chrome.runtime.getURL('config.json'));
    const json = await res.json();
    if (json.serverUrl) {
      input.value = json.serverUrl;
    }
  } catch {}
}

saveBtn.addEventListener('click', async () => {
  let url = (input.value || '').trim().replace(/\/+$/, '');
  if (!url) {
    showStatus('Please enter a valid server URL.', true);
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Testing connection...';

  try {
    const testRes = await fetch(url + '/api/health');
    if (testRes.ok) {
      await chrome.storage.local.set({ serverUrl: url });
      showStatus('✅ Connected & saved successfully!', false);
    } else {
      await chrome.storage.local.set({ serverUrl: url });
      showStatus('⚠️ Saved, but server returned HTTP ' + testRes.status + ' for /api/health.', true);
    }
  } catch (err) {
    await chrome.storage.local.set({ serverUrl: url });
    showStatus('⚠️ Saved, but failed to connect (' + err.message + '). Please check if the server is reachable.', true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save & Test Connection';
  }
});

loadConfig();
