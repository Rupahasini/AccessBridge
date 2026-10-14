/**
 * AccessBridge — Options Controller
 * Orchestrates settings persistence, API connectivity verification,
 * and automated domain administration.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const apiKeyInput = document.getElementById('gemini-api-key');
  const btnToggleVisibility = document.getElementById('btn-toggle-visibility');
  const modelSelect = document.getElementById('gemini-model-select');
  const btnTestConnection = document.getElementById('btn-test-connection');
  const btnSaveGemini = document.getElementById('btn-save-gemini');
  const btnClearGemini = document.getElementById('btn-clear-gemini');
  const connectionStatus = document.getElementById('connection-status');

  const newDomainInput = document.getElementById('new-domain-input');
  const btnAddDomain = document.getElementById('btn-add-domain');
  const domainsListEl = document.getElementById('domains-list');

  const gateAria = document.getElementById('gate-aria');
  const gateFocus = document.getElementById('gate-focus');
  const gateLayout = document.getElementById('gate-layout');

  const btnFooterDemo = document.getElementById('btn-footer-demo');
  const announcer = document.getElementById('options-announcer');

  let currentDomains = [];

  function announce(text) {
    if (announcer) {
      announcer.textContent = '';
      setTimeout(() => { announcer.textContent = text; }, 50);
    }
  }

  function showStatus(text, isSuccess) {
    connectionStatus.hidden = false;
    connectionStatus.className = `status-banner ${isSuccess ? 'is-success' : 'is-error'}`;
    connectionStatus.textContent = text;
    announce(text);
  }

  function hideStatus() {
    connectionStatus.hidden = true;
    connectionStatus.textContent = '';
  }

  // Render configured auto-fix domains
  function renderDomains() {
    domainsListEl.innerHTML = '';
    if (!currentDomains || currentDomains.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-domain-notice';
      li.textContent = 'No automatic domains configured yet. Add one above or toggle from popup.';
      domainsListEl.appendChild(li);
      return;
    }

    currentDomains.forEach(domain => {
      const li = document.createElement('li');
      li.className = 'domain-item';

      const span = document.createElement('span');
      span.className = 'domain-name';
      span.textContent = domain;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'domain-remove-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.setAttribute('aria-label', `Remove ${domain} from auto-remediation`);
      removeBtn.addEventListener('click', async () => {
        currentDomains = currentDomains.filter(d => d !== domain);
        await chrome.storage.sync.set({ autoFixDomains: currentDomains });
        renderDomains();
        announce(`Removed ${domain} from auto-remediation.`);
      });

      li.appendChild(span);
      li.appendChild(removeBtn);
      domainsListEl.appendChild(li);
    });
  }

  // Load existing settings
  try {
    const data = await chrome.storage.sync.get([
      'geminiApiKey',
      'geminiModel',
      'autoFixDomains',
      'remediateAria',
      'remediateFocus',
      'remediateLayout'
    ]);

    if (data.geminiApiKey) apiKeyInput.value = data.geminiApiKey;
    if (data.geminiModel) modelSelect.value = data.geminiModel;

    currentDomains = Array.isArray(data.autoFixDomains) ? data.autoFixDomains : [];
    renderDomains();

    gateAria.checked = data.remediateAria !== false;
    gateFocus.checked = data.remediateFocus !== false;
    gateLayout.checked = data.remediateLayout !== false;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }

  // Toggle API key password masking
  btnToggleVisibility.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    btnToggleVisibility.textContent = isPassword ? 'Hide' : 'Show';
    btnToggleVisibility.setAttribute('aria-label', isPassword ? 'Hide API key in plain text' : 'Show API key in plain text');
  });

  // Test Connection
  btnTestConnection.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value;

    if (!key) {
      showStatus('Please provide an API key before testing.', false);
      return;
    }

    showStatus('Verifying connectivity to Google Gemini API...', true);
    btnTestConnection.disabled = true;

    try {
      chrome.runtime.sendMessage({
        type: 'TEST_GEMINI_KEY',
        payload: { apiKey: key, model }
      }, response => {
        btnTestConnection.disabled = false;
        if (response && response.success) {
          showStatus(`✓ Connection successful! Model (${response.model}) replied: "${response.sample}"`, true);
        } else {
          showStatus(`✗ Connection failed: ${response?.error || 'Unknown error'}`, false);
        }
      });
    } catch (err) {
      btnTestConnection.disabled = false;
      showStatus(`Test failed: ${err.message}`, false);
    }
  });

  // Save Key
  btnSaveGemini.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value;

    await chrome.storage.sync.set({
      geminiApiKey: key,
      geminiModel: model
    });

    showStatus('Gemini settings saved successfully.', true);
  });

  // Clear Key
  btnClearGemini.addEventListener('click', async () => {
    apiKeyInput.value = '';
    await chrome.storage.sync.set({ geminiApiKey: '' });
    showStatus('Gemini API key cleared. Reverting to local heuristic mode.', true);
  });

  // Add Domain
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
      await chrome.storage.sync.set({ autoFixDomains: currentDomains });
      newDomainInput.value = '';
      renderDomains();
      announce(`Added ${cleanDomain} to auto-remediation.`);
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

  // Subsystem Checkbox Gates
  gateAria.addEventListener('change', async () => {
    await chrome.storage.sync.set({ remediateAria: gateAria.checked });
  });

  gateFocus.addEventListener('change', async () => {
    await chrome.storage.sync.set({ remediateFocus: gateFocus.checked });
  });

  gateLayout.addEventListener('change', async () => {
    await chrome.storage.sync.set({ remediateLayout: gateLayout.checked });
  });

  // Footer Demo Button
  btnFooterDemo.addEventListener('click', () => {
    const demoUrl = chrome.runtime.getURL('demo.html');
    chrome.tabs.create({ url: demoUrl });
  });
});
