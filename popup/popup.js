/**
 * AccessBridge — Popup Controller Script
 * Manages communication with active tab content script, telemetry telemetry rendering,
 * and user preference updates.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const masterToggle = document.getElementById('master-toggle');
  const beacon = document.getElementById('status-beacon');
  const beaconText = document.getElementById('beacon-text');
  const rockerCaption = document.getElementById('rocker-status-caption');
  const readoutSection = document.querySelector('.readout-section');

  const totalCountEl = document.getElementById('total-count');
  const ariaCountEl = document.getElementById('aria-count');
  const focusCountEl = document.getElementById('focus-count');
  const layoutCountEl = document.getElementById('layout-count');

  const toggleHighlights = document.getElementById('toggle-highlights');
  const toggleAutofix = document.getElementById('toggle-autofix');
  const domainSubtext = document.getElementById('domain-subtext');

  const aiBanner = document.getElementById('ai-banner');
  const aiStatusText = document.getElementById('ai-status-text');
  const aiDetail = document.getElementById('ai-detail');
  const btnConfigureKey = document.getElementById('btn-configure-key');

  const btnOpenDemo = document.getElementById('btn-open-demo');
  const btnOpenOptions = document.getElementById('btn-open-options');
  const announcer = document.getElementById('popup-announcer');

  let activeTabId = null;
  let currentHost = '';

  function announce(text) {
    if (announcer) {
      announcer.textContent = '';
      setTimeout(() => { announcer.textContent = text; }, 50);
    }
  }

  function formatNumber(n) {
    const val = Number(n) || 0;
    return val < 10 ? `0${val}` : `${val}`;
  }

  function renderState(state) {
    if (!state) return;

    const isActive = Boolean(state.active);
    masterToggle.setAttribute('aria-checked', isActive ? 'true' : 'false');

    if (isActive) {
      beacon.classList.add('is-active');
      beaconText.textContent = 'ACTIVE';
      beacon.setAttribute('aria-label', 'Engine status: Active');
      rockerCaption.textContent = 'Webpage remediated for screen reader, keyboard, & zoom.';
      readoutSection.classList.add('is-active');
    } else {
      beacon.classList.remove('is-active');
      beaconText.textContent = 'IDLE';
      beacon.setAttribute('aria-label', 'Engine status: Idle');
      rockerCaption.textContent = 'Currently displaying unassisted webpage DOM.';
      readoutSection.classList.remove('is-active');
    }

    // Counts
    const stats = state.stats || {};
    totalCountEl.textContent = formatNumber(stats.totalCount || 0);
    ariaCountEl.textContent = formatNumber(stats.ariaCount || 0);
    focusCountEl.textContent = formatNumber(stats.focusCount || 0);
    layoutCountEl.textContent = formatNumber(stats.layoutCount || 0);

    // Switches
    toggleHighlights.checked = Boolean(state.highlightsActive);
    toggleAutofix.checked = Boolean(state.autoFixThisDomain);

    if (state.domain) {
      domainSubtext.textContent = `Always active on ${state.domain}`;
    }

    // AI Status
    if (state.hasGeminiKey) {
      aiBanner.classList.add('is-connected');
      aiStatusText.textContent = 'Gemini Multimodal: Connected';
      aiDetail.textContent = 'Neural alt-text active for substantive images';
    } else {
      aiBanner.classList.remove('is-connected');
      aiStatusText.textContent = 'Gemini Multimodal: Offline';
      aiDetail.textContent = 'Using deterministic local heuristics';
    }
  }

  // Query active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      activeTabId = tab.id;
      if (tab.url) {
        try {
          const parsed = new URL(tab.url);
          currentHost = parsed.hostname;
          if (currentHost) {
            domainSubtext.textContent = `Always active on ${currentHost}`;
          }
        } catch (_) {}
      }

      // Fetch status from content script
      chrome.tabs.sendMessage(activeTabId, { type: 'GET_STATUS' }, response => {
        if (chrome.runtime.lastError || !response || !response.success) {
          // Tab may not have content script (e.g. chrome:// page or fresh tab)
          rockerCaption.textContent = 'Navigate to any webpage or Test Lab to activate.';
          return;
        }
        renderState(response.state);
      });
    }
  } catch (err) {
    console.warn('AccessBridge popup initialization notice:', err);
  }

  // Master Rocker Toggle
  masterToggle.addEventListener('click', () => {
    if (!activeTabId) return;

    const currentCheck = masterToggle.getAttribute('aria-checked') === 'true';
    const nextCheck = !currentCheck;

    chrome.tabs.sendMessage(activeTabId, {
      type: 'TOGGLE_ACTIVE',
      payload: { active: nextCheck }
    }, response => {
      if (response && response.success) {
        renderState(response.state);
        announce(nextCheck
          ? `AccessBridge activated. ${response.state?.stats?.totalCount || 0} barriers bridged.`
          : 'AccessBridge deactivated. Original page restored.'
        );
      }
    });
  });

  // Keyboard accessibility for Master Rocker Toggle (Enter & Space)
  masterToggle.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      masterToggle.click();
    }
  });

  // Visual Highlights Switch
  toggleHighlights.addEventListener('change', () => {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, {
      type: 'TOGGLE_HIGHLIGHTS',
      payload: { highlight: toggleHighlights.checked }
    }, response => {
      if (response && response.success) {
        announce(toggleHighlights.checked ? 'Diagnostic visual highlights enabled.' : 'Visual highlights disabled.');
      }
    });
  });

  // Auto-Fix Domain Switch
  toggleAutofix.addEventListener('change', () => {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, {
      type: 'TOGGLE_AUTO_FIX',
      payload: { enable: toggleAutofix.checked }
    }, response => {
      if (response && response.success) {
        announce(toggleAutofix.checked ? `Auto-repair enabled for ${currentHost}.` : `Auto-repair disabled for ${currentHost}.`);
      }
    });
  });

  // Open Options Page
  btnConfigureKey.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  btnOpenOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Launch Demo Test Lab in new tab
  btnOpenDemo.addEventListener('click', () => {
    const demoUrl = chrome.runtime.getURL('demo.html');
    chrome.tabs.create({ url: demoUrl });
  });
});
