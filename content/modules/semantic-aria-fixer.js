/**
 * AccessBridge — Semantic & ARIA Fixer
 * Inspects DOM for unlabeled interactive controls, icon-only buttons, unlabeled inputs,
 * and missing image alt attributes. Infers meaningful, contextual accessible names
 * following strict WCAG 2.2 AA computation order.
 */

window.AccessBridgeModules = window.AccessBridgeModules || {};

window.AccessBridgeModules.SemanticAriaFixer = (function() {
  'use strict';

  // Comprehensive semantic map for icon patterns across FontAwesome, Lucide, Material, Heroicons, Bootstrap, etc.
  const ICON_DICTIONARY = [
    { pattern: /(?:search|magnif|lens)/i, label: 'Search' },
    { pattern: /(?:shopping[-_]?cart|basket|bag)/i, label: 'Shopping cart' },
    { pattern: /(?:heart|favorite|wishlist|bookmark)/i, label: 'Add to wishlist' },
    { pattern: /(?:close|cross|times|dismiss|cancel|x[-_]?mark)/i, label: 'Close' },
    { pattern: /(?:hamburger|bars|menu[-_]?toggle|nav[-_]?toggle|drawer)/i, label: 'Open navigation menu' },
    { pattern: /(?:trash|delete|remove|bin|recycle)/i, label: 'Delete item' },
    { pattern: /(?:gear|settings|cog|preferences|adjust)/i, label: 'Settings' },
    { pattern: /(?:user|person|profile|account|avatar)/i, label: 'User account' },
    { pattern: /(?:bell|notification|alert)/i, label: 'Notifications' },
    { pattern: /(?:chevron[-_]?left|arrow[-_]?left|prev|back)/i, label: 'Previous page' },
    { pattern: /(?:chevron[-_]?right|arrow[-_]?right|next|forward)/i, label: 'Next page' },
    { pattern: /(?:chevron[-_]?down|arrow[-_]?down|expand|dropdown)/i, label: 'Expand menu' },
    { pattern: /(?:chevron[-_]?up|arrow[-_]?up|collapse)/i, label: 'Collapse menu' },
    { pattern: /(?:mail|envelope|message|inbox)/i, label: 'Send email message' },
    { pattern: /(?:phone|call|telephone)/i, label: 'Call telephone number' },
    { pattern: /(?:share|social|forward)/i, label: 'Share this content' },
    { pattern: /(?:download|save|export)/i, label: 'Download file' },
    { pattern: /(?:upload|cloud[-_]?upload)/i, label: 'Upload file' },
    { pattern: /(?:pencil|edit|pen|compose)/i, label: 'Edit details' },
    { pattern: /(?:play|start)/i, label: 'Play media' },
    { pattern: /(?:pause|stop)/i, label: 'Pause media' },
    { pattern: /(?:volume[-_]?up|speaker|audio|sound)/i, label: 'Sound on' },
    { pattern: /(?:volume[-_]?mute|mute|silent)/i, label: 'Mute audio' },
    { pattern: /(?:sun|light[-_]?mode)/i, label: 'Switch to light mode' },
    { pattern: /(?:moon|dark[-_]?mode)/i, label: 'Switch to dark mode' },
    { pattern: /(?:filter|funnel)/i, label: 'Filter results' },
    { pattern: /(?:sort|ordering|arrows[-_]?up[-_]?down)/i, label: 'Sort items' },
    { pattern: /(?:info|help|question)/i, label: 'More information' },
    { pattern: /(?:eye[-_]?slash|hide)/i, label: 'Hide details' },
    { pattern: /(?:eye|view|preview)/i, label: 'View details' },
    { pattern: /(?:check|tick|success)/i, label: 'Confirm action' },
    { pattern: /(?:refresh|reload|sync)/i, label: 'Refresh content' },
    { pattern: /(?:plus|add|create|new)/i, label: 'Add new item' },
    { pattern: /(?:minus|subtract|reduce)/i, label: 'Decrease quantity' },
    { pattern: /(?:print|printer)/i, label: 'Print document' },
    { pattern: /(?:lock|secure)/i, label: 'Secure authentication' }
  ];

  // URL path mappings for links with no accessible text
  const URL_DICTIONARY = [
    { pattern: /\/checkout/i, label: 'Proceed to checkout' },
    { pattern: /\/cart|\/basket/i, label: 'View shopping cart' },
    { pattern: /\/search/i, label: 'Search page' },
    { pattern: /\/login|\/signin/i, label: 'Log in to your account' },
    { pattern: /\/logout|\/signout/i, label: 'Log out' },
    { pattern: /\/register|\/signup/i, label: 'Create new account' },
    { pattern: /\/profile|\/account/i, label: 'View your profile' },
    { pattern: /\/settings/i, label: 'Manage settings' },
    { pattern: /\/about/i, label: 'About us page' },
    { pattern: /\/contact/i, label: 'Contact page' },
    { pattern: /\/pricing/i, label: 'View pricing plans' },
    { pattern: /\/faq|\/help/i, label: 'Frequently asked questions' },
    { pattern: /\/terms/i, label: 'Terms and conditions' },
    { pattern: /\/privacy/i, label: 'Privacy policy' },
    { pattern: /^mailto:(.+)/i, label: (m) => `Send email to ${m[1]}` },
    { pattern: /^tel:(.+)/i, label: (m) => `Call phone number ${m[1]}` }
  ];

  // Sensitive field detection for strict privacy guard
  function isSensitiveField(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (type === 'password' || type === 'hidden') return true;

    const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase();
    if (/cc-|credit-card|cvc|cvv|current-password|new-password/.test(autocomplete)) return true;

    const nameOrId = `${element.name || ''} ${element.id || ''}`.toLowerCase();
    return /password|passwd|cvv|cvc|creditcard|cardnumber|ssn|secret/.test(nameOrId);
  }

  /**
   * Evaluates if an element currently provides a valid accessible name
   * per WCAG 2.2 Accessible Name and Description Computation.
   */
  function hasAccessibleName(el) {
    // 1. aria-labelledby
    const labelledby = el.getAttribute('aria-labelledby');
    if (labelledby) {
      const referenced = labelledby.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean);
      const text = referenced.map(r => r.textContent.trim()).join(' ');
      if (text.length > 0) return true;
    }

    // 2. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim().length > 0) return true;

    // 3. title or alt
    const title = el.getAttribute('title');
    if (title && title.trim().length > 0) return true;

    const alt = el.getAttribute('alt');
    if (alt !== null && alt.trim().length > 0) return true;

    // 4. Native textContent (excluding hidden nodes and pure whitespace)
    const clone = el.cloneNode(true);
    // Remove svg and hidden elements from cloned text check
    clone.querySelectorAll('svg, [aria-hidden="true"], style, script').forEach(n => n.remove());
    const visibleText = clone.textContent.trim();
    if (visibleText.length > 0) return true;

    // 5. Associated <label> for form controls
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      if (el.id) {
        const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (explicitLabel && explicitLabel.textContent.trim().length > 0) return true;
      }
      const parentLabel = el.closest('label');
      if (parentLabel && parentLabel.textContent.trim().length > 0) return true;
    }

    return false;
  }

  /**
   * Infers a label from CSS class names, ID attributes, and SVG inner markup
   */
  function inferFromClassesAndIcons(el) {
    // Collect classes and IDs from element and inner SVG/I/SPAN children
    const tokens = [];
    tokens.push(el.className || '');
    tokens.push(el.id || '');
    tokens.push(el.getAttribute('data-icon') || '');
    tokens.push(el.getAttribute('data-action') || '');

    const icons = el.querySelectorAll('svg, i, span, em');
    icons.forEach(icon => {
      tokens.push(icon.className || '');
      tokens.push(icon.id || '');
      tokens.push(icon.getAttribute('data-icon') || '');
      tokens.push(icon.getAttribute('data-feather') || '');
      tokens.push(icon.getAttribute('data-lucide') || '');

      // Check SVG title or desc tags
      const svgTitle = icon.querySelector('title');
      if (svgTitle && svgTitle.textContent.trim()) {
        tokens.push(svgTitle.textContent.trim());
      }
    });

    const combinedStr = tokens.join(' ').toLowerCase();

    for (const item of ICON_DICTIONARY) {
      if (item.pattern.test(combinedStr)) {
        return item.label;
      }
    }

    return null;
  }

  /**
   * Infers a label from surrounding context, adjacent headings, or tooltips
   */
  function inferFromContext(el) {
    // Check data attributes
    const tooltip = el.getAttribute('data-tooltip') || el.getAttribute('data-tip') || el.getAttribute('data-original-title');
    if (tooltip && tooltip.trim().length > 0) return tooltip.trim();

    // Check parent or previous sibling for descriptive text
    let sibling = el.previousElementSibling;
    while (sibling) {
      if (['SPAN', 'LABEL', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(sibling.tagName)) {
        const text = sibling.textContent.trim();
        if (text.length > 0 && text.length < 40) return text;
      }
      sibling = sibling.previousElementSibling;
    }

    // Check parent text
    const parent = el.parentElement;
    if (parent && parent.tagName !== 'BODY') {
      const parentClone = parent.cloneNode(true);
      parentClone.querySelectorAll('button, a, input, [role="button"], script, style').forEach(n => n.remove());
      const parentText = parentClone.textContent.trim();
      if (parentText.length > 0 && parentText.length < 50) return parentText;
    }

    return null;
  }

  /**
   * Infers label for links from URL paths
   */
  function inferFromHref(el) {
    const href = el.getAttribute('href');
    if (!href) return null;

    for (const entry of URL_DICTIONARY) {
      const match = href.match(entry.pattern);
      if (match) {
        return typeof entry.label === 'function' ? entry.label(match) : entry.label;
      }
    }

    // Parse path slug as fallback
    try {
      const parsed = new URL(href, window.location.href);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        const lastPart = decodeURIComponent(parts[parts.length - 1])
          .replace(/[-_]/g, ' ')
          .replace(/\.[a-zA-Z0-9]+$/, '')
          .trim();
        if (lastPart.length > 1 && !/^\d+$/.test(lastPart)) {
          return `Navigate to ${lastPart.charAt(0).toUpperCase() + lastPart.slice(1)}`;
        }
      }
    } catch (_) {}

    return null;
  }

  /**
   * Formats sanitized image filename to human readable text
   */
  function cleanFilename(src) {
    if (!src) return '';
    try {
      const path = src.split('?')[0].split('#')[0];
      const filename = path.substring(path.lastIndexOf('/') + 1);
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      if (nameWithoutExt.length < 3 || /^(img|image|photo|pic|dsc|screenshot)[\d_-]*$/i.test(nameWithoutExt)) {
        return '';
      }
      return nameWithoutExt.replace(/[-_]+/g, ' ').trim();
    } catch (_) {
      return '';
    }
  }

  /**
   * Main remediation scan
   */
  function repair(options = {}) {
    let repairedCount = 0;
    const modifiedElements = [];

    // 1. Remediate Buttons & [role="button"]
    const buttons = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]');
    buttons.forEach(el => {
      if (el.dataset.abRepaired) return;
      if (!hasAccessibleName(el)) {
        // Step 1: Attribute title/alt
        let label = el.getAttribute('title') || el.getAttribute('alt');
        // Step 2: Context / tooltip
        if (!label) label = inferFromContext(el);
        // Step 3: Icon & class analysis
        if (!label) label = inferFromClassesAndIcons(el);
        // Step 4: Parent form context
        if (!label && el.closest('form')) {
          const form = el.closest('form');
          if (el.type === 'submit' || el.getAttribute('type') === 'submit') {
            label = form.getAttribute('action') ? 'Submit form' : 'Submit';
          }
        }
        // Fallback: Descriptive default (never generic "Button 1")
        if (!label) {
          const isDialogAction = el.closest('[role="dialog"], modal, .modal, .dialog');
          label = isDialogAction ? 'Dialog action control' : 'Action button';
        }

        // Store original state for clean reversibility
        el.dataset.abOriginalAriaLabel = el.getAttribute('aria-label') || '';
        el.dataset.abRepaired = 'aria-button';
        el.setAttribute('aria-label', label);
        repairedCount++;
        modifiedElements.push({ el, type: 'aria-button', label });
      }
    });

    // 2. Remediate Links with no text
    const links = document.querySelectorAll('a[href]');
    links.forEach(el => {
      if (el.dataset.abRepaired) return;
      if (!hasAccessibleName(el)) {
        let label = el.getAttribute('title');
        if (!label) label = inferFromContext(el);
        if (!label) label = inferFromClassesAndIcons(el);
        if (!label) label = inferFromHref(el);
        if (!label) label = 'Open link';

        el.dataset.abOriginalAriaLabel = el.getAttribute('aria-label') || '';
        el.dataset.abRepaired = 'aria-link';
        el.setAttribute('aria-label', label);
        repairedCount++;
        modifiedElements.push({ el, type: 'aria-link', label });
      }
    });

    // 3. Remediate Unlabeled Form Controls (with strict privacy guard)
    const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
    inputs.forEach(el => {
      if (el.dataset.abRepaired) return;
      if (hasAccessibleName(el)) return;

      // Privacy Check: DO NOT read value, but DO provide an accessible name for screen readers
      if (isSensitiveField(el)) {
        const type = (el.getAttribute('type') || '').toLowerCase();
        const secureLabel = type === 'password' ? 'Password field' : 'Secure payment credential field';
        el.dataset.abOriginalAriaLabel = el.getAttribute('aria-label') || '';
        el.dataset.abRepaired = 'aria-form';
        el.setAttribute('aria-label', secureLabel);
        repairedCount++;
        modifiedElements.push({ el, type: 'aria-form', label: secureLabel });
        return;
      }

      // Infer form field label from placeholder, name, id, or preceding text
      let label = el.getAttribute('placeholder');
      if (!label && el.name) {
        label = el.name.replace(/[-_]/g, ' ').replace(/([A-Z])/g, ' $1').trim();
      }
      if (!label && el.id) {
        label = el.id.replace(/[-_]/g, ' ').replace(/([A-Z])/g, ' $1').trim();
      }
      if (!label) {
        label = inferFromContext(el);
      }
      if (!label) {
        const type = el.getAttribute('type') || el.tagName.toLowerCase();
        label = `${type.charAt(0).toUpperCase() + type.slice(1)} input field`;
      }

      el.dataset.abOriginalAriaLabel = el.getAttribute('aria-label') || '';
      el.dataset.abRepaired = 'aria-form';
      el.setAttribute('aria-label', label);
      repairedCount++;
      modifiedElements.push({ el, type: 'aria-form', label });
    });

    // 4. Remediate Images Missing Alt
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (img.dataset.abRepaired) return;

      // Has alt attribute (even alt="" for decorative)
      const altAttr = img.getAttribute('alt');
      if (altAttr !== null) return;

      // Check if image is purely decorative spacer or tracking pixel
      const rect = img.getBoundingClientRect();
      const isTiny = (img.naturalWidth > 0 && img.naturalWidth <= 16) ||
                    (img.naturalHeight > 0 && img.naturalHeight <= 16) ||
                    (rect.width > 0 && rect.width <= 16) ||
                    (rect.height > 0 && rect.height <= 16);

      if (isTiny || img.getAttribute('role') === 'presentation') {
        img.dataset.abOriginalAlt = '__NONE__';
        img.dataset.abRepaired = 'aria-img-decorative';
        img.setAttribute('alt', '');
        img.setAttribute('role', 'presentation');
        repairedCount++;
        modifiedElements.push({ el: img, type: 'aria-img-decorative', label: 'Decorative' });
        return;
      }

      // Infer descriptive alt from context, caption, or filename
      let altText = img.getAttribute('title');
      if (!altText) {
        const figure = img.closest('figure');
        if (figure) {
          const figcaption = figure.querySelector('figcaption');
          if (figcaption && figcaption.textContent.trim()) {
            altText = figcaption.textContent.trim();
          }
        }
      }
      if (!altText) {
        const cleanedName = cleanFilename(img.getAttribute('src'));
        if (cleanedName) altText = cleanedName;
      }
      if (!altText) {
        altText = inferFromContext(img);
      }
      if (!altText) {
        altText = 'Content photograph';
      }

      img.dataset.abOriginalAlt = '__NONE__';
      img.dataset.abRepaired = 'aria-img';
      img.setAttribute('alt', altText);
      repairedCount++;
      modifiedElements.push({ el: img, type: 'aria-img', label: altText });

      // Optional Gemini Vision enhancement for substantial images
      if (options.useGemini && chrome.runtime?.sendMessage) {
        const src = img.src;
        if (src && !src.startsWith('data:') && rect.width >= 40 && rect.height >= 40) {
          chrome.runtime.sendMessage({
            type: 'CALL_GEMINI_VISION',
            payload: {
              imageUrl: src,
              contextHint: altText
            }
          }, response => {
            if (response && response.success && response.altText) {
              img.setAttribute('alt', response.altText);
              img.dataset.abGeminiCaption = 'true';
            }
          });
        }
      }
    });

    return {
      count: repairedCount,
      modified: modifiedElements
    };
  }

  /**
   * Reverts all semantic repairs to pristine original state
   */
  function revert() {
    const repaired = document.querySelectorAll('[data-ab-repaired^="aria-"]');
    repaired.forEach(el => {
      const type = el.dataset.abRepaired;
      if (type === 'aria-button' || type === 'aria-link' || type === 'aria-form') {
        if (el.dataset.abOriginalAriaLabel === '') {
          el.removeAttribute('aria-label');
        } else if (el.dataset.abOriginalAriaLabel) {
          el.setAttribute('aria-label', el.dataset.abOriginalAriaLabel);
        }
        delete el.dataset.abOriginalAriaLabel;
      } else if (type === 'aria-img' || type === 'aria-img-decorative') {
        if (el.dataset.abOriginalAlt === '__NONE__') {
          el.removeAttribute('alt');
          if (type === 'aria-img-decorative') el.removeAttribute('role');
        } else if (el.dataset.abOriginalAlt) {
          el.setAttribute('alt', el.dataset.abOriginalAlt);
        }
        delete el.dataset.abOriginalAlt;
        delete el.dataset.abGeminiCaption;
      }
      delete el.dataset.abRepaired;
    });
  }

  return {
    repair,
    revert
  };
})();
