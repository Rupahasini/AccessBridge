/**
 * AccessBridge — Options Controller
 * Simple settings manager with instant "Saved" confirmations,
 * screen reader announcements, and plain-language controls.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements: Fixes
  const gateAria = document.getElementById('gate-aria');
  const gateFocus = document.getElementById('gate-focus');
  const gateLayout = document.getElementById('gate-layout');

  // Elements: Off Sites
  const newDomainInput = document.getElementById('new-domain-input');
  const btnAddDomain = document.getElementById('btn-add-domain');
  const domainsListEl = document.getElementById('domains-list');

  // Elements: Advanced (Optional)
  const apiKeyInput = document.getElementById('gemini-api-key');
  const btnToggleVisibility = document.getElementById('btn-toggle-visibility');
  const modelSelect = document.getElementById('gemini-model-select');
  const btnSaveGemini = document.getElementById('btn-save-gemini');
  const btnClearGemini = document.getElementById('btn-clear-gemini');
  const connectionStatus = document.getElementById('connection-status');

  const saveToast = document.getElementById('save-toast');
  const announcer = document.getElementById('options-announcer');

  let currentDomains = [];
  let toastTimer = null;

  function announce(text) {
    if (announcer) {
      announcer.textContent = '';
      setTimeout(() => { announcer.textContent = text; }, 50);
    }
  }

  function showSavedToast() {
    if (!saveToast) return;
    saveToast.hidden = false;
    saveToast.classList.add('is-visible');
    announce('Saved');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      saveToast.classList.remove('is-visible');
      setTimeout(() => { saveToast.hidden = true; }, 250);
    }, 2000);
  }

  function showStatus(text, isSuccess) {
    if (!connectionStatus) return;
    connectionStatus.hidden = false;
    connectionStatus.className = `status-banner ${isSuccess ? 'is-success' : 'is-error'}`;
    connectionStatus.textContent = text;
  }

  function renderDomains() {
    domainsListEl.innerHTML = '';
    if (!currentDomains || currentDomains.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-sites-notice';
      li.textContent = 'AccessBridge is currently on for all websites.';
      domainsListEl.appendChild(li);
      return;
    }

    currentDomains.forEach(domain => {
      const li = document.createElement('li');
      li.className = 'site-item';

      const span = document.createElement('span');
      span.className = 'site-name';
      span.textContent = domain;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove-site';
      removeBtn.textContent = 'Remove';
      removeBtn.setAttribute('aria-label', `Turn AccessBridge back on for ${domain}`);
      removeBtn.addEventListener('click', async () => {
        currentDomains = currentDomains.filter(d => d !== domain);
        await chrome.storage.sync.set({ pausedDomains: currentDomains });
        renderDomains();
        showSavedToast();
      });

      li.appendChild(span);
      li.appendChild(removeBtn);
      domainsListEl.appendChild(li);
    });
  }

  // Load saved settings
  try {
    const data = await chrome.storage.sync.get([
      'remediateAria',
      'remediateFocus',
      'remediateLayout',
      'pausedDomains',
      'geminiApiKey',
      'geminiModel'
    ]);

    gateAria.checked = data.remediateAria !== false;
    gateFocus.checked = data.remediateFocus !== false;
    gateLayout.checked = data.remediateLayout !== false;

    currentDomains = Array.isArray(data.pausedDomains) ? data.pausedDomains : [];
    renderDomains();

    if (data.geminiApiKey) apiKeyInput.value = data.geminiApiKey;
    if (data.geminiModel) modelSelect.value = data.geminiModel;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }

  // Fixes checkbox listeners
  gateAria.addEventListener('change', async () => {
    await chrome.storage.sync.set({ remediateAria: gateAria.checked });
    showSavedToast();
  });

  gateFocus.addEventListener('change', async () => {
    await chrome.storage.sync.set({ remediateFocus: gateFocus.checked });
    showSavedToast();
  });

  gateLayout.addEventListener('change', async () => {
    await chrome.storage.sync.set({ remediateLayout: gateLayout.checked });
    showSavedToast();
  });

  // Add site to off list
  btnAddDomain.addEventListener('click', async () => {
    const raw = newDomainInput.value.trim();
    if (!raw) return;

    let cleanDomain = raw;
    try {
      if (raw.includes('://')) {
        cleanDomain = new URL(raw).hostname;
      } else {
        cleanDomain = raw.split('/')[0].split(':')[0];
      }
    } catch (_) {}

    cleanDomain = cleanDomain.toLowerCase();

    if (!currentDomains.includes(cleanDomain)) {
      currentDomains.push(cleanDomain);
      await chrome.storage.sync.set({ pausedDomains: currentDomains });
      newDomainInput.value = '';
      renderDomains();
      showSavedToast();
    } else {
      announce(`${cleanDomain} is already in the list.`);
    }
  });

  newDomainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnAddDomain.click();
    }
  });

  // Toggle API key visibility
  btnToggleVisibility.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    btnToggleVisibility.textContent = isPassword ? 'Hide' : 'Show';
    btnToggleVisibility.setAttribute('aria-label', isPassword ? 'Hide API key in plain text' : 'Show API key in plain text');
  });

  // Save optional key
  btnSaveGemini.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value;

    await chrome.storage.sync.set({
      geminiApiKey: key,
      geminiModel: model
    });

    showSavedToast();
    showStatus(key ? 'Key saved.' : 'Saved without an API key.', true);
  });

  // Clear optional key
  btnClearGemini.addEventListener('click', async () => {
    apiKeyInput.value = '';
    await chrome.storage.sync.set({ geminiApiKey: '' });
    showSavedToast();
    showStatus('Key cleared.', true);
  });
});
