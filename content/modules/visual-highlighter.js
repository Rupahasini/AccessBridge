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
  function refresh() {
    if (!highlightsActive) return;

    const repaired = document.querySelectorAll('[data-ab-repaired]');
    repaired.forEach(el => {
      const type = el.dataset.abRepaired;
      let badgeText = '';

      if (type.startsWith('aria-')) {
        const name = el.getAttribute('aria-label') || el.getAttribute('alt') || 'Accessible Name';
        badgeText = `ARIA: "${name.length > 25 ? name.slice(0, 22) + '...' : name}"`;
      } else if (type === 'focus-clickable') {
        badgeText = 'Keyboard: Tab + Enter/Space';
      } else if (type === 'layout-elastic') {
        badgeText = 'Layout: Elastic Reflow';
      }

      el.setAttribute('data-ab-badge', badgeText);
    });
  }

  /**
   * Enables visual diagnostic outlines
   */
  function enable() {
    highlightsActive = true;
    document.documentElement.classList.add('accessbridge-highlights-active');
    refresh();
  }

  /**
   * Disables visual diagnostic outlines
   */
  function disable() {
    highlightsActive = false;
    document.documentElement.classList.remove('accessbridge-highlights-active');
    const elementsWithBadges = document.querySelectorAll('[data-ab-badge]');
    elementsWithBadges.forEach(el => el.removeAttribute('data-ab-badge'));
  }

  /**
   * Toggles highlight state
   */
  function toggle(forcedState) {
    const nextState = typeof forcedState === 'boolean' ? forcedState : !highlightsActive;
    if (nextState) {
      enable();
    } else {
      disable();
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
