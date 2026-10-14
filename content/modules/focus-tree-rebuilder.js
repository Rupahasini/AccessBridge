/**
 * AccessBridge — Focus Tree Rebuilder
 * Restores keyboard navigation parity to broken DOM trees:
 * 1. Converts unreachable clickable div/span elements into accessible keyboard buttons.
 * 2. Injects Enter/Space key actuation with scroll suppression.
 * 3. Injects a high-contrast Skip to Main Content landmark link if absent.
 * 4. Ensures strict WCAG 2.2 focus visibility.
 */

window.AccessBridgeModules = window.AccessBridgeModules || {};

window.AccessBridgeModules.FocusTreeRebuilder = (function() {
  'use strict';

  // WeakMap to keep track of attached keyboard listeners for clean removal
  const attachedKeyListeners = new WeakMap();

  /**
   * Universal keyboard activator for simulated buttons
   */
  function handleButtonKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ' || event.keyCode === 13 || event.keyCode === 32) {
      // Prevent default page scrolling when pressing Space on a button
      if (event.key === ' ' || event.keyCode === 32) {
        event.preventDefault();
      }
      event.stopPropagation();

      // Trigger the native click event
      event.currentTarget.click();
    }
  }

  /**
   * Checks if an element is a native interactive control
   */
  function isNaturallyInteractive(el) {
    const tag = el.tagName.toLowerCase();
    if (['button', 'input', 'select', 'textarea'].includes(tag)) return true;
    if (tag === 'a' && el.hasAttribute('href')) return true;
    if (tag === 'summary') return true;
    return false;
  }

  /**
   * Validates if a non-interactive element functions as a clickable widget
   */
  function isUnreachableClickable(el) {
    if (isNaturallyInteractive(el)) return false;
    if (el.dataset.abRepaired) return false;

    if (el.closest && el.closest('[data-ab-ignore]')) return false;

    // Skip large structural containers to avoid making the whole page/article a button
    const tag = el.tagName.toLowerCase();
    if (['html', 'body', 'main', 'header', 'footer', 'nav', 'article', 'section', 'table', 'form'].includes(tag)) {
      return false;
    }

    // Check if it already has explicit keyboard focus
    const tabIndexAttr = el.getAttribute('tabindex');
    if (tabIndexAttr !== null && parseInt(tabIndexAttr, 10) >= 0) {
      return false;
    }

    // Has explicit onclick handler attribute or data-action
    const hasClickAttr = el.hasAttribute('onclick') ||
                         el.hasAttribute('data-action') ||
                         el.hasAttribute('ng-click') ||
                         el.hasAttribute('@click') ||
                         el.getAttribute('role') === 'button';

    // Check computed cursor style (throttled/cached where possible)
    let hasPointerCursor = false;
    try {
      const win = el.ownerDocument?.defaultView || window;
      const computed = win.getComputedStyle(el);
      hasPointerCursor = computed.cursor === 'pointer';
    } catch (_) {}

    if (!hasClickAttr && !hasPointerCursor) {
      return false;
    }

    // Ensure it doesn't just enclose other interactive children (e.g. wrapper div around a real button)
    const interactiveChild = el.querySelector('button, a[href], input, select, textarea');
    if (interactiveChild && interactiveChild !== el) {
      return false;
    }

    // Must have a bounding box (visible on screen)
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;

    return true;
  }

  /**
   * Detects or injects a Skip to Main Content link
   */
  function ensureSkipLink(doc = document) {
    if (!doc || !doc.body) return null;

    // Check if an existing skip link is present
    const existingSkip = doc.querySelector(
      'a[href^="#"][class*="skip" i], a[href^="#"][id*="skip" i], a[href^="#"][aria-label*="skip" i]'
    );
    if (existingSkip) return null;

    // Identify main content destination
    let mainTarget = doc.querySelector('main, [role="main"], article, #main, #content, .main-content');
    if (!mainTarget) {
      mainTarget = doc.querySelector('h1');
    }
    if (!mainTarget) {
      // Fallback: first content section
      mainTarget = doc.body.firstElementChild;
    }

    if (!mainTarget) return null;

    // Anchor configuration
    const anchorId = mainTarget.id || 'accessbridge-main-content-anchor';
    if (!mainTarget.id) {
      mainTarget.id = anchorId;
      mainTarget.dataset.abInjectedId = 'true';
    }

    // Ensure target element can receive focus programmatically without entering tab sequence
    if (!mainTarget.hasAttribute('tabindex')) {
      mainTarget.setAttribute('tabindex', '-1');
      mainTarget.dataset.abInjectedTabindex = 'true';
    }

    // Create high-craft accessible skip link
    const skipLink = doc.createElement('a');
    skipLink.href = `#${anchorId}`;
    skipLink.className = 'accessbridge-skip-link';
    skipLink.textContent = 'Skip to main content';
    skipLink.dataset.abInjected = 'skip-link';
    skipLink.setAttribute('aria-label', 'Skip to main content landmark');

    // When clicked, explicitly move focus to main landmark
    skipLink.addEventListener('click', () => {
      mainTarget.focus();
    });

    if (doc.body.firstChild) {
      doc.body.insertBefore(skipLink, doc.body.firstChild);
    } else {
      doc.body.appendChild(skipLink);
    }

    return skipLink;
  }

  /**
   * Main Focus Tree repair scan
   */
  function repair(options = {}) {
    const doc = options.doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return { count: 0, modified: [] };

    let focusFixedCount = 0;
    const modifiedElements = [];

    // 1. Ensure Skip to Main Content
    const skipEl = ensureSkipLink(doc);
    if (skipEl) {
      focusFixedCount += 1;
      modifiedElements.push({
        el: skipEl,
        type: 'focus-skip-link',
        criterion: 'WCAG 2.4.1 Bypass Blocks',
        issue: 'Missing Skip to Main Content landmark link',
        fix: 'Injected high-contrast bypass skip link at document head',
        tag: 'a',
        selector: 'a.accessbridge-skip-link'
      });
    }

    // 2. Scan for unreachable clickable div/span/custom elements
    const candidates = doc.querySelectorAll(
      'div, span, p, a:not([href]), li, tr, i, em, svg, [role="button"]:not([tabindex])'
    );

    candidates.forEach(el => {
      if (isUnreachableClickable(el)) {
        // Store original attributes
        el.dataset.abOriginalTabindex = el.getAttribute('tabindex') || '__NONE__';
        el.dataset.abOriginalRole = el.getAttribute('role') || '__NONE__';
        el.dataset.abRepaired = 'focus-clickable';

        // Elevate element into keyboard tab order
        el.setAttribute('tabindex', '0');

        // Ensure button role if missing
        if (!el.getAttribute('role')) {
          el.setAttribute('role', 'button');
        }

        // Attach Enter/Space keyboard actuator
        el.addEventListener('keydown', handleButtonKeydown);
        attachedKeyListeners.set(el, handleButtonKeydown);

        focusFixedCount++;
        const tag = el.tagName.toLowerCase();
        const snippet = el.innerText ? el.innerText.trim().slice(0, 30) : '';
        modifiedElements.push({
          el,
          type: 'focus-clickable',
          label: snippet || 'Clickable control',
          criterion: 'WCAG 2.1.1 Keyboard',
          issue: `Inaccessible clickable <${tag}> cannot receive keyboard focus or keystrokes`,
          fix: 'Set tabindex="0", role="button", and attached Enter/Space key actuation with scroll suppression',
          tag,
          selector: el.className ? `${tag}.${el.className.split(' ').join('.')}` : tag
        });
      }
    });

    return {
      count: focusFixedCount,
      modified: modifiedElements
    };
  }

  /**
   * Reverts all keyboard and focus repairs to original state
   */
  function revert(options = {}) {
    const doc = options.doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;

    // 1. Remove injected skip link
    const injectedSkip = doc.querySelectorAll('[data-ab-injected="skip-link"]');
    injectedSkip.forEach(el => el.remove());

    // Clean up anchor tag attributes
    const injectedAnchors = doc.querySelectorAll('[data-ab-injected-id="true"]');
    injectedAnchors.forEach(el => {
      el.removeAttribute('id');
      delete el.dataset.abInjectedId;
    });

    const injectedTabindices = doc.querySelectorAll('[data-ab-injected-tabindex="true"]');
    injectedTabindices.forEach(el => {
      el.removeAttribute('tabindex');
      delete el.dataset.abInjectedTabindex;
    });

    // 2. Revert clickable elements
    const repaired = doc.querySelectorAll('[data-ab-repaired="focus-clickable"]');
    repaired.forEach(el => {
      // Remove event listener
      const listener = attachedKeyListeners.get(el);
      if (listener) {
        el.removeEventListener('keydown', listener);
        attachedKeyListeners.delete(el);
      }

      // Restore tabindex
      if (el.dataset.abOriginalTabindex === '__NONE__') {
        el.removeAttribute('tabindex');
      } else if (el.dataset.abOriginalTabindex) {
        el.setAttribute('tabindex', el.dataset.abOriginalTabindex);
      }
      delete el.dataset.abOriginalTabindex;

      // Restore role
      if (el.dataset.abOriginalRole === '__NONE__') {
        el.removeAttribute('role');
      } else if (el.dataset.abOriginalRole) {
        el.setAttribute('role', el.dataset.abOriginalRole);
      }
      delete el.dataset.abOriginalRole;

      delete el.dataset.abRepaired;
    });
  }

  return {
    repair,
    revert
  };
})();
