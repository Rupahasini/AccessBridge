/**
 * AccessBridge — Popup Controller Script
 * Plain-language controller for single-site toggle, summary of fixes,
 * highlight toggle, and options link.
 * Safe messaging with lastError checks, URL validation, and auto-injection retry.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const siteToggle = document.getElementById('site-toggle');
  const siteToggleLabel = document.getElementById('site-toggle-label');

  const summaryLine = document.getElementById('summary-line');
  const fixLineNames = document.getElementById('fix-line-names');
  const fixLineKeyboard = document.getElementById('fix-line-keyboard');
  const fixLineText = document.getElementById('fix-line-text');

  const toggleHighlights = document.getElementById('toggle-highlights');
  const btnMoreSettings = document.getElementById('btn-more-settings');
  const announcer = document.getElementById('popup-announcer');

  let activeTabId = null;
  let currentUrl = '';
  let currentHost = '';

  function announce(text) {
    if (announcer) {
      announcer.textContent = '';
      setTimeout(() => { announcer.textContent = text; }, 50);
    }
  }

  /**
   * Safe wrapper around chrome.tabs.sendMessage that always reads
   * chrome.runtime.lastError to prevent "Unchecked runtime.lastError" logs.
   */
  function sendTabMessage(tabId, message) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          const err = chrome.runtime.lastError; // Must read immediately to mark checked!
          if (err) {
            resolve({ success: false, error: err.message || 'NO_RESPONSE' });
          } else {
            resolve(response || { success: true });
          }
        });
      } catch (ex) {
        resolve({ success: false, error: ex.message || 'EXCEPTION' });
      }
    });
  }

  /**
   * Validates if a tab is a standard web page (http:// or https://)
   * where extensions are permitted to execute.
   */
  function isSupportedUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host === 'chromewebstore.google.com' || host === 'chrome.google.com') {
        return false;
      }
    } catch (_) {
      return false;
    }
    return true;
  }

  /**
   * Re-injects content scripts and stylesheet if receiving end does not exist.
   */
  async function injectContentScripts(tabId) {
    try {
      if (!chrome.scripting || !chrome.scripting.executeScript) return false;

      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['content/content.css']
      }).catch(() => {});

      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          'content/modules/semantic-aria-fixer.js',
          'content/modules/focus-tree-rebuilder.js',
          'content/modules/layout-elasticizer.js',
          'content/modules/visual-highlighter.js',
          'content/core-engine.js'
        ]
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Sends a message to a tab, retrying once after injecting scripts if needed.
   */
  async function sendTabMessageWithRetry(tabId, message) {
    let res = await sendTabMessage(tabId, message);
    if (!res.success && res.error && res.error.includes('Receiving end does not exist')) {
      const injected = await injectContentScripts(tabId);
      if (injected) {
        await new Promise(r => setTimeout(r, 80));
        res = await sendTabMessage(tabId, message);
      }
    }
    return res;
  }

  function showUnsupportedPage() {
    siteToggle.checked = false;
    siteToggle.disabled = true;
    toggleHighlights.disabled = true;
    siteToggleLabel.textContent = "AccessBridge can't run on this page.";
    summaryLine.textContent = "AccessBridge can't run on this page.";
    fixLineNames.hidden = true;
    fixLineKeyboard.hidden = true;
    fixLineText.hidden = true;
  }

  function showNeedsReload() {
    siteToggle.checked = false;
    siteToggle.disabled = true;
    toggleHighlights.disabled = true;
    siteToggleLabel.textContent = 'AccessBridge is ready to start';
    summaryLine.textContent = 'Reload this page to start AccessBridge';
    fixLineNames.hidden = true;
    fixLineKeyboard.hidden = true;
    fixLineText.hidden = true;
  }

  function renderState(state) {
    if (!state) return;

    siteToggle.disabled = false;
    toggleHighlights.disabled = false;

    const isDomainPaused = Boolean(state.pausedThisDomain);
    const isGloballyEnabled = state.globallyEnabled !== false;
    const isSiteOn = isGloballyEnabled && !isDomainPaused;

    // Main Switch
    siteToggle.checked = isSiteOn;
    siteToggle.setAttribute('aria-checked', isSiteOn ? 'true' : 'false');
    siteToggleLabel.textContent = isSiteOn
      ? 'AccessBridge is ON for this site'
      : 'AccessBridge is OFF for this site';

    // Highlight toggle
    toggleHighlights.checked = Boolean(state.highlightsActive);
    toggleHighlights.setAttribute('aria-checked', Boolean(state.highlightsActive) ? 'true' : 'false');

    // If site is turned off
    if (!isSiteOn) {
      summaryLine.textContent = 'Nothing to fix on this page';
      fixLineNames.hidden = true;
      fixLineKeyboard.hidden = true;
      fixLineText.hidden = true;
      return;
    }

    // Site is ON: calculate fixes
    const stats = state.stats || {};
    const total = Number(stats.totalCount) || 0;
    const namesCount = Number(stats.ariaCount) || 0;
    const keyboardCount = Number(stats.focusCount) || 0;
    const textCount = Number(stats.layoutCount) || 0;

    if (total === 0) {
      summaryLine.textContent = 'Nothing to fix on this page';
      fixLineNames.hidden = true;
      fixLineKeyboard.hidden = true;
      fixLineText.hidden = true;
    } else {
      summaryLine.textContent = total === 1
        ? 'Fixed 1 problem on this page'
        : `Fixed ${total} problems on this page`;

      // 1. Names for buttons and images
      if (namesCount > 0) {
        fixLineNames.hidden = false;
        fixLineNames.textContent = namesCount === 1
          ? 'Added names to 1 button or image'
          : `Added names to ${namesCount} buttons and images`;
      } else {
        fixLineNames.hidden = true;
      }

      // 2. Usable with keyboard
      if (keyboardCount > 0) {
        fixLineKeyboard.hidden = false;
        fixLineKeyboard.textContent = keyboardCount === 1
          ? 'Made 1 item usable with the keyboard'
          : `Made ${keyboardCount} items usable with the keyboard`;
      } else {
        fixLineKeyboard.hidden = true;
      }

      // 3. Enlarged text cutoffs
      if (textCount > 0) {
        fixLineText.hidden = false;
        fixLineText.textContent = textCount === 1
          ? 'Fixed 1 area that cut off enlarged text'
          : `Fixed ${textCount} areas that cut off enlarged text`;
      } else {
        fixLineText.hidden = true;
      }
    }
  }

  // Query active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    const tab = tabs && tabs[0];

    if (!tab || !tab.id) {
      showUnsupportedPage();
      return;
    }

    activeTabId = tab.id;
    currentUrl = tab.url || '';

    // Check URL: Must start with http:// or https:// and not be restricted
    if (!isSupportedUrl(currentUrl)) {
      showUnsupportedPage();
      return;
    }

    try {
      currentHost = new URL(currentUrl).hostname;
    } catch (_) {}

    // Fetch status from active tab with re-injection retry
    const response = await sendTabMessageWithRetry(activeTabId, { type: 'GET_STATUS' });

    if (response.success && response.state) {
      renderState(response.state);
    } else {
      showNeedsReload();
    }
  } catch (err) {
    showNeedsReload();
  }

  // Toggle On/Off for this site
  siteToggle.addEventListener('change', async () => {
    if (!isSupportedUrl(currentUrl) || !activeTabId) return;

    const shouldBeOn = siteToggle.checked;
    siteToggleLabel.textContent = shouldBeOn
      ? 'AccessBridge is ON for this site'
      : 'AccessBridge is OFF for this site';

    // Save On/Off state in chrome.storage.local
    try {
      const localData = await chrome.storage.local.get('pausedDomains');
      let pausedDomains = Array.isArray(localData.pausedDomains) ? localData.pausedDomains : [];
      if (shouldBeOn) {
        pausedDomains = pausedDomains.filter(d => d !== currentHost);
      } else {
        if (!pausedDomains.includes(currentHost)) {
          pausedDomains.push(currentHost);
        }
      }
      await chrome.storage.local.set({
        pausedDomains,
        extensionEnabled: true
      });
    } catch (_) {}

    const response = await sendTabMessageWithRetry(activeTabId, {
      type: 'TOGGLE_DOMAIN_PAUSE',
      payload: { pause: !shouldBeOn }
    });

    if (response.success && response.state) {
      renderState(response.state);
      announce(shouldBeOn ? 'AccessBridge is ON for this site' : 'AccessBridge is OFF for this site');
    } else {
      announce(shouldBeOn ? 'AccessBridge is ON for this site' : 'AccessBridge is OFF for this site');
    }
  });

  // Toggle Highlight Fixes
  toggleHighlights.addEventListener('change', async () => {
    if (!isSupportedUrl(currentUrl) || !activeTabId) return;

    const isHighlighted = toggleHighlights.checked;

    try {
      await chrome.storage.local.set({ highlightRepairs: isHighlighted });
    } catch (_) {}

    const response = await sendTabMessageWithRetry(activeTabId, {
      type: 'TOGGLE_HIGHLIGHTS',
      payload: { highlight: isHighlighted }
    });

    if (response.success) {
      announce(isHighlighted ? 'Fixes outlined on page' : 'Outlines turned off');
    }
  });

  // Open Options Page
  btnMoreSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
