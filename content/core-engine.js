/**
 * AccessBridge — Core Engine Orchestrator
 * Coordinates Semantic & ARIA Fixer, Focus Tree Rebuilder, Layout Elasticizer,
 * and Visual Highlighter. Manages live MutationObserver, Before/After states,
 * extension popup messaging, and standalone web-app invocation.
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
    issues: [],
    lastReport: [],
    domain: (typeof window !== 'undefined' && window.location?.hostname) || 'local',
    autoFixThisDomain: false,
    hasGeminiKey: false
  };

  let mutationObserver = null;
  let debounceTimer = null;
  let liveAnnouncer = null;

  /**
   * Initializes screen reader polite announcement region
   */
  function setupAnnouncer(doc = document) {
    if (liveAnnouncer || !doc || !doc.body) return;
    liveAnnouncer = doc.createElement('div');
    liveAnnouncer.id = 'accessbridge-live-announcer';
    liveAnnouncer.setAttribute('role', 'status');
    liveAnnouncer.setAttribute('aria-live', 'polite');
    liveAnnouncer.setAttribute('aria-atomic', 'true');
    liveAnnouncer.className = 'accessbridge-sr-only';
    liveAnnouncer.dataset.abIgnore = 'true';
    doc.body.appendChild(liveAnnouncer);
  }

  function announce(text, doc = document) {
    if (!liveAnnouncer) setupAnnouncer(doc);
    if (liveAnnouncer) {
      liveAnnouncer.textContent = '';
      setTimeout(() => {
        liveAnnouncer.textContent = text;
      }, 50);
    }
  }

  function dispatchStateChange() {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('accessbridge-state-change', {
          detail: {
            ...state,
            stats: { ...state.stats },
            issues: [...state.issues],
            lastReport: [...state.lastReport]
          }
        }));
      } catch (_) {}
    }
  }

  /**
   * Runs all remediation modules
   */
  async function runRepairs(options = {}) {
    const doc = options.doc || document;

    // Check if Gemini key is available in sync storage (Chrome extension mode)
    let useGemini = false;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const syncData = await chrome.storage.sync.get(['geminiApiKey', 'highlightRepairs']);
        useGemini = Boolean(syncData.geminiApiKey?.trim());
        state.hasGeminiKey = useGemini;
        if (syncData.highlightRepairs && !state.highlightsActive) {
          state.highlightsActive = true;
          VisualHighlighter?.enable(doc);
        }
      }
    } catch (_) {}

    // Execute modular repair suites
    const ariaResult = SemanticAriaFixer?.repair({ useGemini, doc }) || { count: 0, modified: [] };
    const focusResult = FocusTreeRebuilder?.repair({ doc }) || { count: 0, modified: [] };
    const layoutResult = LayoutElasticizer?.repair({ doc }) || { count: 0, modified: [] };

    state.stats.ariaCount = ariaResult.count || 0;
    state.stats.focusCount = focusResult.count || 0;
    state.stats.layoutCount = layoutResult.count || 0;
    state.stats.totalCount = state.stats.ariaCount + state.stats.focusCount + state.stats.layoutCount;

    state.issues = [
      ...(focusResult.modified || []),
      ...(ariaResult.modified || []),
      ...(layoutResult.modified || [])
    ];
    state.lastReport = [...state.issues];

    if (state.highlightsActive) {
      VisualHighlighter?.refresh(doc);
    }

    // Notify background service worker to update action badge if in extension context
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_BADGE',
        payload: {
          active: state.active,
          totalFixed: state.stats.totalCount
        }
      }).catch(() => {});
    }

    dispatchStateChange();
    return state.stats;
  }

  /**
   * Reverts all DOM modifications (Before Mode)
   */
  function revertRepairs(options = {}) {
    const doc = options.doc || document;

    VisualHighlighter?.disable(doc);
    SemanticAriaFixer?.revert({ doc });
    FocusTreeRebuilder?.revert({ doc });
    LayoutElasticizer?.revert({ doc });

    state.stats.ariaCount = 0;
    state.stats.focusCount = 0;
    state.stats.layoutCount = 0;
    state.stats.totalCount = 0;
    state.issues = [];

    // Reset badge if in extension context
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'UPDATE_BADGE',
        payload: {
          active: false,
          totalFixed: 0
        }
      }).catch(() => {});
    }

    dispatchStateChange();
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
          m.target?.closest?.('[data-ab-ignore]') ||
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

  function startObserver(doc = document) {
    if (mutationObserver || !doc || !doc.body || typeof MutationObserver === 'undefined') return;
    mutationObserver = new MutationObserver(handleMutations);
    mutationObserver.observe(doc.body, {
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
  async function setActive(shouldBeActive, options = {}) {
    const doc = options.doc || document;
    state.active = Boolean(shouldBeActive);

    if (state.active) {
      startObserver(doc);
      await runRepairs(options);
      announce(`AccessBridge active: ${state.stats.totalCount} accessibility barriers remediated.`, doc);
    } else {
      stopObserver();
      revertRepairs(options);
      announce('AccessBridge deactivated: original DOM restored.', doc);
    }

    dispatchStateChange();
    return state;
  }

  /**
   * Checks storage for automatic domain activation (Chrome extension only)
   */
  async function checkAutoActivation() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const { autoFixDomains = [], geminiApiKey = '' } = await chrome.storage.sync.get(['autoFixDomains', 'geminiApiKey']);
        state.hasGeminiKey = Boolean(geminiApiKey?.trim());

        const currentHost = window.location.hostname;
        if (currentHost && autoFixDomains.includes(currentHost)) {
          state.autoFixThisDomain = true;
          await setActive(true);
        }
      }
    } catch (_) {}
  }

  /**
   * Extension messaging interface for popup and options
   */
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (!request || !request.type) return false;

      switch (request.type) {
        case 'GET_STATUS':
          if (chrome.storage?.sync) {
            chrome.storage.sync.get(['geminiApiKey', 'autoFixDomains']).then(data => {
              state.hasGeminiKey = Boolean(data.geminiApiKey?.trim());
              const domains = data.autoFixDomains || [];
              state.autoFixThisDomain = Boolean(state.domain && domains.includes(state.domain));
              sendResponse({ success: true, state });
            }).catch(() => {
              sendResponse({ success: true, state });
            });
          } else {
            sendResponse({ success: true, state });
          }
          return true;

        case 'TOGGLE_ACTIVE':
          setActive(request.payload?.active ?? !state.active).then(updatedState => {
            sendResponse({ success: true, state: updatedState });
          });
          return true;

        case 'TOGGLE_HIGHLIGHTS':
          const forced = request.payload?.highlight;
          state.highlightsActive = VisualHighlighter?.toggle(forced) ?? false;
          dispatchStateChange();
          sendResponse({ success: true, highlightsActive: state.highlightsActive });
          return false;

        case 'TOGGLE_AUTO_FIX':
          (async () => {
            const host = window.location.hostname;
            if (!host) {
              sendResponse({ success: false, error: 'NO_HOSTNAME' });
              return;
            }
            if (!chrome.storage?.sync) {
              sendResponse({ success: false, error: 'NO_STORAGE' });
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
            dispatchStateChange();
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

  /**
   * Listen for postMessage commands (useful for sandboxed iframes)
   */
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('message', async (event) => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'AB_SET_ACTIVE') {
        const nextState = await setActive(Boolean(event.data.active));
        if (event.source && typeof event.source.postMessage === 'function') {
          event.source.postMessage({
            type: 'AB_STATE_UPDATE',
            state: window.AccessBridge.getState()
          }, '*');
        }
      } else if (event.data.type === 'AB_GET_STATE') {
        if (event.source && typeof event.source.postMessage === 'function') {
          event.source.postMessage({
            type: 'AB_STATE_UPDATE',
            state: window.AccessBridge.getState()
          }, '*');
        }
      } else if (event.data.type === 'AB_TOGGLE_HIGHLIGHTS') {
        window.AccessBridge.toggleHighlights(event.data.highlight);
        if (event.source && typeof event.source.postMessage === 'function') {
          event.source.postMessage({
            type: 'AB_STATE_UPDATE',
            state: window.AccessBridge.getState()
          }, '*');
        }
      }
    });
  }

  // Public Web API exposed on window.AccessBridge
  window.AccessBridge = {
    setActive,
    runRepairs,
    revertRepairs,
    toggleHighlights: (forced, doc = document) => {
      state.highlightsActive = VisualHighlighter?.toggle(forced, doc) ?? false;
      dispatchStateChange();
      return state.highlightsActive;
    },
    getState: () => ({
      ...state,
      stats: { ...state.stats },
      issues: [...state.issues],
      lastReport: [...state.lastReport]
    }),
    announce,
    modules: window.AccessBridgeModules
  };

  // Initial setup
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setupAnnouncer();
        checkAutoActivation();
      });
    } else {
      setupAnnouncer();
      checkAutoActivation();
    }
  }
})();
