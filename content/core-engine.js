/**
 * AccessBridge — Core Engine Orchestrator
 * Coordinates Semantic & ARIA Fixer, Focus Tree Rebuilder, Layout Elasticizer,
 * and Visual Highlighter. Manages live MutationObserver, persistent active state across
 * all browsing tabs, extension popup messaging, and text extraction for speech reading.
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
    pausedThisDomain: false,
    hasGeminiKey: false,
    isSpeaking: false
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

    let syncData = {};
    let useGemini = false;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        syncData = await chrome.storage.sync.get([
          'geminiApiKey',
          'highlightRepairs',
          'remediateAria',
          'remediateFocus',
          'remediateLayout'
        ]);
        useGemini = Boolean(syncData.geminiApiKey?.trim());
        state.hasGeminiKey = useGemini;
        if (syncData.highlightRepairs && !state.highlightsActive) {
          state.highlightsActive = true;
          VisualHighlighter?.enable(doc);
        }
      }
    } catch (_) {}

    const shouldFixAria = syncData.remediateAria !== false;
    const shouldFixFocus = syncData.remediateFocus !== false;
    const shouldFixLayout = syncData.remediateLayout !== false;

    // If an individual module was turned off, revert its previous repairs
    if (!shouldFixAria) SemanticAriaFixer?.revert({ doc });
    if (!shouldFixFocus) FocusTreeRebuilder?.revert({ doc });
    if (!shouldFixLayout) LayoutElasticizer?.revert({ doc });

    // Execute active repair suites
    const ariaResult = (shouldFixAria && SemanticAriaFixer)
      ? SemanticAriaFixer.repair({ useGemini, doc })
      : { count: 0, modified: [] };
    const focusResult = (shouldFixFocus && FocusTreeRebuilder)
      ? FocusTreeRebuilder.repair({ doc })
      : { count: 0, modified: [] };
    const layoutResult = (shouldFixLayout && LayoutElasticizer)
      ? LayoutElasticizer.repair({ doc })
      : { count: 0, modified: [] };

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

    // Notify background service worker to update action badge
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
   * Reverts all DOM modifications
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

    // Reset badge in extension context
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
      if (state.active) {
        runRepairs();
      }
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
   * Sets active status on the current webpage
   */
  async function setActive(shouldBeActive, options = {}) {
    const doc = options.doc || document;
    state.active = Boolean(shouldBeActive);

    if (state.active) {
      startObserver(doc);
      await runRepairs(options);
      if (!options.silent) {
        announce(`AccessBridge is on: ${state.stats.totalCount} problems fixed on this page.`, doc);
      }
    } else {
      stopObserver();
      revertRepairs(options);
      if (!options.silent) {
        announce('AccessBridge is off: original page restored.', doc);
      }
    }

    dispatchStateChange();
    return state;
  }

  /**
   * Extracts clean, accessible text from the remediated page for speech reading
   */
  function getReadablePageSummary(doc = document) {
    const mainEl = doc.querySelector('main, [role="main"], article') || doc.body;
    if (!mainEl) return '';

    const items = [];
    if (doc.title) {
      items.push(`Page title: ${doc.title}`);
    }

    // Traverse visible, substantive elements
    const elements = mainEl.querySelectorAll('h1, h2, h3, p, button, [role="button"], a[aria-label]');
    elements.forEach(el => {
      if (el.closest('[data-ab-ignore]') || el.offsetParent === null) return;
      
      // Use remediated accessible label or inner text
      const ariaLabel = el.getAttribute('aria-label');
      const text = (ariaLabel || el.innerText || el.textContent || '').trim();
      
      if (text.length > 2 && !items.includes(text)) {
        items.push(text);
      }
    });

    return items.slice(0, 100).join('. ');
  }

  /**
   * Initializes engine state from chrome.storage.sync
   */
  async function initEngine() {
    setupAnnouncer();

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const data = await chrome.storage.sync.get([
          'extensionEnabled',
          'pausedDomains',
          'geminiApiKey',
          'highlightRepairs'
        ]);

        const extensionEnabled = data.extensionEnabled !== false; // Default: true (active across web)
        const pausedDomains = Array.isArray(data.pausedDomains) ? data.pausedDomains : [];
        const currentHost = window.location.hostname || '';

        state.domain = currentHost;
        state.hasGeminiKey = Boolean(data.geminiApiKey?.trim());
        state.highlightsActive = Boolean(data.highlightRepairs);
        state.pausedThisDomain = Boolean(currentHost && pausedDomains.includes(currentHost));

        // If extension is globally enabled and current domain is not paused
        if (extensionEnabled && !state.pausedThisDomain) {
          await setActive(true, { silent: true });
        } else {
          state.active = false;
          // Update badge to indicate paused
          if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({
              type: 'UPDATE_BADGE',
              payload: { active: false, totalFixed: 0 }
            }).catch(() => {});
          }
          dispatchStateChange();
        }
      } else {
        // Fallback for direct browser execution
        await setActive(true);
      }
    } catch (err) {
      console.warn('AccessBridge initialization notice:', err);
      await setActive(true);
    }
  }

  /**
   * Listen for sync storage changes across tabs (e.g. user toggles extension on/off)
   */
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName !== 'sync') return;

      if (changes.extensionEnabled !== undefined) {
        const globallyEnabled = changes.extensionEnabled.newValue !== false;
        if (globallyEnabled && !state.pausedThisDomain) {
          if (!state.active) await setActive(true);
        } else {
          if (state.active) await setActive(false);
        }
      }

      if (changes.pausedDomains !== undefined) {
        const pausedList = Array.isArray(changes.pausedDomains.newValue) ? changes.pausedDomains.newValue : [];
        state.pausedThisDomain = Boolean(state.domain && pausedList.includes(state.domain));

        const syncData = await chrome.storage.sync.get('extensionEnabled');
        const globallyEnabled = syncData.extensionEnabled !== false;

        if (globallyEnabled && !state.pausedThisDomain) {
          if (!state.active) await setActive(true);
        } else {
          if (state.active) await setActive(false);
        }
      }

      if (changes.highlightRepairs !== undefined) {
        const hl = Boolean(changes.highlightRepairs.newValue);
        state.highlightsActive = hl;
        if (state.active) {
          VisualHighlighter?.toggle(hl, document);
        }
      }

      if (changes.geminiApiKey !== undefined) {
        state.hasGeminiKey = Boolean(changes.geminiApiKey.newValue?.trim());
      }

      if (changes.remediateAria !== undefined || changes.remediateFocus !== undefined || changes.remediateLayout !== undefined) {
        if (state.active) {
          await runRepairs();
        }
      }
    });
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
            chrome.storage.sync.get(['extensionEnabled', 'geminiApiKey', 'pausedDomains']).then(data => {
              state.hasGeminiKey = Boolean(data.geminiApiKey?.trim());
              const pausedList = Array.isArray(data.pausedDomains) ? data.pausedDomains : [];
              state.pausedThisDomain = Boolean(state.domain && pausedList.includes(state.domain));
              const globallyEnabled = data.extensionEnabled !== false;
              sendResponse({
                success: true,
                state: {
                  ...state,
                  globallyEnabled
                }
              });
            }).catch(() => {
              sendResponse({ success: true, state });
            });
          } else {
            sendResponse({ success: true, state });
          }
          return true;

        case 'TOGGLE_GLOBAL_ACTIVE':
          (async () => {
            const nextActive = Boolean(request.payload?.active);
            await chrome.storage.sync.set({ extensionEnabled: nextActive });
            if (nextActive && !state.pausedThisDomain) {
              await setActive(true);
            } else {
              await setActive(false);
            }
            sendResponse({ success: true, state });
          })();
          return true;

        case 'TOGGLE_DOMAIN_PAUSE':
          (async () => {
            const host = state.domain;
            if (!host) {
              sendResponse({ success: false, error: 'NO_HOSTNAME' });
              return;
            }
            const { pausedDomains = [] } = await chrome.storage.sync.get('pausedDomains');
            let updatedList = [...pausedDomains];
            const shouldPause = request.payload?.pause ?? !updatedList.includes(host);

            if (shouldPause && !updatedList.includes(host)) {
              updatedList.push(host);
            } else if (!shouldPause) {
              updatedList = updatedList.filter(d => d !== host);
            }

            await chrome.storage.sync.set({ pausedDomains: updatedList });
            state.pausedThisDomain = shouldPause;

            const { extensionEnabled = true } = await chrome.storage.sync.get('extensionEnabled');
            if (extensionEnabled && !shouldPause) {
              await setActive(true);
            } else {
              await setActive(false);
            }

            sendResponse({ success: true, pausedThisDomain: shouldPause, state });
          })();
          return true;

        case 'TOGGLE_HIGHLIGHTS':
          const forced = request.payload?.highlight;
          state.highlightsActive = VisualHighlighter?.toggle(forced) ?? false;
          chrome.storage.sync.set({ highlightRepairs: state.highlightsActive }).catch(() => {});
          dispatchStateChange();
          sendResponse({ success: true, highlightsActive: state.highlightsActive });
          return false;

        case 'GET_READABLE_TEXT':
          sendResponse({
            success: true,
            text: getReadablePageSummary(document)
          });
          return false;

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

  // Public Web API exposed on window.AccessBridge
  window.AccessBridge = {
    setActive,
    runRepairs,
    revertRepairs,
    getReadablePageSummary,
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

  // Initial execution
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initEngine();
      });
    } else {
      initEngine();
    }
  }
})();
