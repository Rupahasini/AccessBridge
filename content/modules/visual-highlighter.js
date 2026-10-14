/**
 * AccessBridge — Visual Highlighter
 * Provides non-intrusive, high-craft visual diagnostic badges
 * outlining repaired elements during hackathon demos and accessibility evaluations.
 */

window.AccessBridgeModules = window.AccessBridgeModules || {};

window.AccessBridgeModules.VisualHighlighter = (function() {
  'use strict';

  let highlightsActive = false;

  /**
   * Applies or updates badge markers on all repaired elements
   */
  function refresh(doc = document) {
    if (!highlightsActive || !doc) return;

    const repaired = doc.querySelectorAll('[data-ab-repaired]');
    repaired.forEach(el => {
      const type = el.dataset.abRepaired;
      let badgeText = '';

      if (type.startsWith('aria-')) {
        const name = el.getAttribute('aria-label') || el.getAttribute('alt') || 'Accessible Name';
        badgeText = `ARIA: "${name.length > 25 ? name.slice(0, 22) + '...' : name}"`;
      } else if (type === 'focus-clickable') {
        badgeText = 'Keyboard: Tab + Enter/Space';
      } else if (type === 'focus-skip-link') {
        badgeText = 'Skip Link: Landmark Bypass';
      } else if (type === 'layout-elastic') {
        badgeText = 'Layout: Elastic Reflow';
      }

      el.setAttribute('data-ab-badge', badgeText);
    });
  }

  /**
   * Enables visual diagnostic outlines
   */
  function enable(doc = document) {
    highlightsActive = true;
    if (doc?.documentElement?.classList) {
      doc.documentElement.classList.add('accessbridge-highlights-active');
    }
    refresh(doc);
  }

  /**
   * Disables visual diagnostic outlines
   */
  function disable(doc = document) {
    highlightsActive = false;
    if (doc?.documentElement?.classList) {
      doc.documentElement.classList.remove('accessbridge-highlights-active');
    }
    if (doc) {
      const elementsWithBadges = doc.querySelectorAll('[data-ab-badge]');
      elementsWithBadges.forEach(el => el.removeAttribute('data-ab-badge'));
    }
  }

  /**
   * Toggles highlight state
   */
  function toggle(forcedState, doc = document) {
    const nextState = typeof forcedState === 'boolean' ? forcedState : !highlightsActive;
    if (nextState) {
      enable(doc);
    } else {
      disable(doc);
    }
    return nextState;
  }

  return {
    enable,
    disable,
    toggle,
    refresh,
    isActive: () => highlightsActive
  };
})();
