/**
 * AccessBridge — Core Engine Orchestrator
 * Coordinates Semantic & ARIA Fixer, Focus Tree Rebuilder, Layout Elasticizer,
 * and Visual Highlighter. Manages live MutationObserver, Before/After states,
 * and extension popup messaging.
 */

(function() {
  'use strict';

  // Prevent multiple script initializations in the same frame
  if (window.__AccessBridgeInitialized__) return;
  window.__AccessBridgeInitialized__ = true;

  const {
    SemanticAriaFixer,
    FocusTreeRebuilder,
    LayoutElasticizer,
    VisualHighlighter
  } = window.AccessBridgeModules || {};

  // Engine state
  const state = {
    active: false,
    highlightsActive: false,
    stats: {
      ariaCount: 0,
      focusCount: 0,
      layoutCount: 0,
      totalCount: 0
    },
    domain: window.location.hostname || 'local',
    autoFixThisDomain: false,
    hasGeminiKey: false
  };

  let mutationObserver = null;
  let debounceTimer = null;
  let liveAnnouncer = null;

  /**
   * Initializes screen reader polite announcement region
   */
  function setupAnnouncer() {
    if (liveAnnouncer) return;
    liveAnnouncer = document.createElement('div');
    liveAnnouncer.id = 'accessbridge-live-announcer';
    liveAnnouncer.setAttribute('role', 'status');
    liveAnnouncer.setAttribute('aria-live', 'polite');
    liveAnnouncer.setAttribute('aria-atomic', 'true');
    liveAnnouncer.className = 'accessbridge-sr-only';
    document.body.appendChild(liveAnnouncer);
  }

  function announce(text) {
    if (!liveAnnouncer) setupAnnouncer();
    if (liveAnnouncer) {
      liveAnnouncer.textContent = '';
      setTimeout(() => {
        liveAnnouncer.textContent = text;
      }, 50);
    }
  }

  /**
   * Runs all remediation modules
   */
  async function runRepairs() {
    // Check if Gemini key is available in sync storage
    let useGemini = false;
    try {
      const syncData = await chrome.storage.sync.get(['geminiApiKey', 'highlightRepairs']);
      useGemini = Boolean(syncData.geminiApiKey?.trim());
      state.hasGeminiKey = useGemini;
      if (syncData.highlightRepairs && !state.highlightsActive) {
        state.highlightsActive = true;
        VisualHighlighter?.enable();
      }
    } catch (_) {}

    // Execute modular repair suites
    const ariaResult = SemanticAriaFixer?.repair({ useGemini }) || { count: 0 };
    const focusResult = FocusTreeRebuilder?.repair() || { count: 0 };
    const layoutResult = LayoutElasticizer?.repair() || { count: 0 };

    state.stats.ariaCount = ariaResult.count;
    state.stats.focusCount = focusResult.count;
    state.stats.layoutCount = layoutResult.count;
    state.stats.totalCount = ariaResult.count + focusResult.count + layoutResult.count;

    if (state.highlightsActive) {
      VisualHighlighter?.refresh();
    }

    // Notify background service worker to update action badge
    if (chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_BADGE',
        payload: {
          active: state.active,
          totalFixed: state.stats.totalCount
        }
      }).catch(() => {});
    }

    return state.stats;
  }

  /**
   * Reverts all DOM modifications (Before Mode)
   */
  function revertRepairs() {
    VisualHighlighter?.disable();
    SemanticAriaFixer?.revert();
    FocusTreeRebuilder?.revert();
    LayoutElasticizer?.revert();

    state.stats.ariaCount = 0;
    state.stats.focusCount = 0;
    state.stats.layoutCount = 0;
    state.stats.totalCount = 0;

    // Reset badge
    if (chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_BADGE',
        payload: {
          active: false,
          totalFixed: 0
        }
      }).catch(() => {});
    }
  }

  /**
   * Debounced mutation handler for dynamic Single Page Apps
   */
  function handleMutations(mutations) {
    if (!state.active) return;

    // Check if mutations occurred in AccessBridge internal elements
    let isSelfMutation = false;
    for (const m of mutations) {
      if (m.target?.id?.startsWith('accessbridge-') ||
          m.target?.dataset?.abRepaired ||
          m.attributeName?.startsWith('data-ab-')) {
        isSelfMutation = true;
        break;
      }
    }
    if (isSelfMutation && mutations.length < 3) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runRepairs();
    }, 250);
  }

  function startObserver() {
    if (mutationObserver) return;
    mutationObserver = new MutationObserver(handleMutations);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'src', 'href']
    });
  }

  function stopObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    clearTimeout(debounceTimer);
  }

  /**
   * Master Before / After activation toggle
   */
  async function setActive(shouldBeActive) {
    state.active = shouldBeActive;

    if (state.active) {
      startObserver();
      await runRepairs();
      announce(`AccessBridge active: ${state.stats.totalCount} accessibility barriers remediated.`);
    } else {
      stopObserver();
      revertRepairs();
      announce('AccessBridge deactivated: original DOM restored.');
    }

    return state;
  }

  /**
   * Checks storage for automatic domain activation
   */
  async function checkAutoActivation() {
    try {
      const { autoFixDomains = [], geminiApiKey = '' } = await chrome.storage.sync.get(['autoFixDomains', 'geminiApiKey']);
      state.hasGeminiKey = Boolean(geminiApiKey?.trim());

      const currentHost = window.location.hostname;
      if (currentHost && autoFixDomains.includes(currentHost)) {
        state.autoFixThisDomain = true;
        await setActive(true);
      }
    } catch (_) {}
  }

  /**
   * Extension messaging interface for popup and options
   */
  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (!request || !request.type) return false;

      switch (request.type) {
        case 'GET_STATUS':
          // Re-verify Gemini key status
          chrome.storage.sync.get(['geminiApiKey', 'autoFixDomains']).then(data => {
            state.hasGeminiKey = Boolean(data.geminiApiKey?.trim());
            const domains = data.autoFixDomains || [];
            state.autoFixThisDomain = Boolean(state.domain && domains.includes(state.domain));
            sendResponse({ success: true, state });
          }).catch(() => {
            sendResponse({ success: true, state });
          });
          return true;

        case 'TOGGLE_ACTIVE':
          setActive(request.payload?.active ?? !state.active).then(updatedState => {
            sendResponse({ success: true, state: updatedState });
          });
          return true;

        case 'TOGGLE_HIGHLIGHTS':
          const forced = request.payload?.highlight;
          state.highlightsActive = VisualHighlighter?.toggle(forced) ?? false;
          sendResponse({ success: true, highlightsActive: state.highlightsActive });
          return false;

        case 'TOGGLE_AUTO_FIX':
          (async () => {
            const host = window.location.hostname;
            if (!host) {
              sendResponse({ success: false, error: 'NO_HOSTNAME' });
              return;
            }
            const { autoFixDomains = [] } = await chrome.storage.sync.get('autoFixDomains');
            let updatedList = [...autoFixDomains];
            const shouldEnable = request.payload?.enable ?? !updatedList.includes(host);

            if (shouldEnable && !updatedList.includes(host)) {
              updatedList.push(host);
            } else if (!shouldEnable) {
              updatedList = updatedList.filter(d => d !== host);
            }

            await chrome.storage.sync.set({ autoFixDomains: updatedList });
            state.autoFixThisDomain = shouldEnable;
            sendResponse({ success: true, autoFixThisDomain: shouldEnable });
          })();
          return true;

        case 'TRIGGER_REMEDIATION':
          if (state.active) {
            runRepairs().then(stats => sendResponse({ success: true, stats }));
            return true;
          }
          sendResponse({ success: false, error: 'NOT_ACTIVE' });
          return false;

        default:
          return false;
      }
    });
  }

  // Initial setup
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupAnnouncer();
      checkAutoActivation();
    });
  } else {
    setupAnnouncer();
    checkAutoActivation();
  }
})();
