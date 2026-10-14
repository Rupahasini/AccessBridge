/**
 * AccessBridge — Layout Elasticizer
 * Prevents catastrophic text truncation and clipping under 200% zoom / large font sizes (WCAG 1.4.4 & 1.4.10).
 * Dynamically converts rigid fixed-pixel heights into flexible min-height constraints
 * and relieves overflow clipping on text containers while preserving overall page layout integrity.
 */

window.AccessBridgeModules = window.AccessBridgeModules || {};

window.AccessBridgeModules.LayoutElasticizer = (function() {
  'use strict';

  // Base root font size reference in px
  const BASE_FONT_PX = 16;

  /**
   * Identifies candidate elements bearing substantial text content
   */
  function isTextContainer(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;

    // Disqualify media, canvas, forms, and standalone icons
    const tag = el.tagName.toLowerCase();
    if (['img', 'video', 'canvas', 'svg', 'iframe', 'audio', 'script', 'style', 'input', 'select'].includes(tag)) {
      return false;
    }

    // Must contain text nodes with sufficient prose
    const text = el.innerText || el.textContent || '';
    if (text.trim().length < 15) return false;

    return true;
  }

  /**
   * Main Layout Elasticity scan
   */
  function repair() {
    let elasticFixedCount = 0;
    const modifiedElements = [];

    // Target elements prone to rigid height clipping: cards, banners, descriptions, summaries, testimonials, articles
    const candidates = document.querySelectorAll(
      'p, article, section, aside, .card, .banner, .alert, .product-card, .description, .summary, .content, .tile, .post, [class*="box"], [class*="card"], [class*="banner"]'
    );

    candidates.forEach(el => {
      if (el.dataset.abRepaired) return;
      if (!isTextContainer(el)) return;

      let modified = false;
      const computed = window.getComputedStyle(el);

      // 1. Inspect Fixed Heights with Overflow Truncation
      const inlineHeight = el.style.height;
      const computedHeight = parseFloat(computed.height);
      const computedOverflow = computed.overflow;
      const computedOverflowY = computed.overflowY;

      const hasHiddenOverflow = ['hidden', 'clip'].includes(computedOverflow) || ['hidden', 'clip'].includes(computedOverflowY);
      const hasFixedInlineHeight = inlineHeight && /px$/i.test(inlineHeight.trim());

      // If container has a fixed inline pixel height, or hidden overflow with fixed height
      if (hasFixedInlineHeight || (hasHiddenOverflow && computedHeight > 0 && computedHeight < 600)) {
        // Record original inline styles for pristine reversibility
        el.dataset.abOriginalInlineHeight = el.style.height || '__NONE__';
        el.dataset.abOriginalInlineMinHeight = el.style.minHeight || '__NONE__';
        el.dataset.abOriginalInlineOverflow = el.style.overflow || '__NONE__';
        el.dataset.abOriginalInlineOverflowY = el.style.overflowY || '__NONE__';

        const targetHeightPx = hasFixedInlineHeight ? parseFloat(inlineHeight) : computedHeight;

        // Apply elastic properties
        el.style.setProperty('min-height', `${targetHeightPx}px`, 'important');
        el.style.setProperty('height', 'auto', 'important');

        if (hasHiddenOverflow) {
          el.style.setProperty('overflow', 'visible', 'important');
          el.style.setProperty('overflow-y', 'visible', 'important');
        }

        modified = true;
      }

      // 2. Convert fixed inline font sizes in px to proportional rem units
      const inlineFontSize = el.style.fontSize;
      if (inlineFontSize && /px$/i.test(inlineFontSize.trim())) {
        const pxVal = parseFloat(inlineFontSize);
        if (pxVal > 0) {
          el.dataset.abOriginalInlineFontSize = inlineFontSize;
          const remVal = (pxVal / BASE_FONT_PX).toFixed(4);
          el.style.setProperty('font-size', `${remVal}rem`, 'important');
          modified = true;
        }
      }

      if (modified) {
        el.dataset.abRepaired = 'layout-elastic';
        elasticFixedCount++;
        modifiedElements.push({ el, type: 'layout-elastic' });
      }
    });

    return {
      count: elasticFixedCount,
      modified: modifiedElements
    };
  }

  /**
   * Reverts all elastic layout adjustments to original state
   */
  function revert() {
    const repaired = document.querySelectorAll('[data-ab-repaired="layout-elastic"]');
    repaired.forEach(el => {
      // Restore height
      if (el.dataset.abOriginalInlineHeight === '__NONE__') {
        el.style.removeProperty('height');
      } else if (el.dataset.abOriginalInlineHeight) {
        el.style.height = el.dataset.abOriginalInlineHeight;
      }
      delete el.dataset.abOriginalInlineHeight;

      // Restore minHeight
      if (el.dataset.abOriginalInlineMinHeight === '__NONE__') {
        el.style.removeProperty('min-height');
      } else if (el.dataset.abOriginalInlineMinHeight) {
        el.style.minHeight = el.dataset.abOriginalInlineMinHeight;
      }
      delete el.dataset.abOriginalInlineMinHeight;

      // Restore overflow
      if (el.dataset.abOriginalInlineOverflow === '__NONE__') {
        el.style.removeProperty('overflow');
      } else if (el.dataset.abOriginalInlineOverflow) {
        el.style.overflow = el.dataset.abOriginalInlineOverflow;
      }
      delete el.dataset.abOriginalInlineOverflow;

      if (el.dataset.abOriginalInlineOverflowY === '__NONE__') {
        el.style.removeProperty('overflow-y');
      } else if (el.dataset.abOriginalInlineOverflowY) {
        el.style.overflowY = el.dataset.abOriginalInlineOverflowY;
      }
      delete el.dataset.abOriginalInlineOverflowY;

      // Restore font-size
      if (el.dataset.abOriginalInlineFontSize) {
        el.style.fontSize = el.dataset.abOriginalInlineFontSize;
        delete el.dataset.abOriginalInlineFontSize;
      }

      delete el.dataset.abRepaired;
    });
  }

  return {
    repair,
    revert
  };
})();
