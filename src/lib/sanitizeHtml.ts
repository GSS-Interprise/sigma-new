/**
 * Sanitizes HTML content pasted from external sources (Google Sheets, Docs, etc.)
 * Removes dangerous styles like position:absolute, z-index, fixed dimensions from
 * external sources, and strips Google Sheets internal elements.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";

  const doc = new DOMParser().parseFromString(html, "text/html");

  // Remove elements that are Google Sheets/Docs internals
  const selectorsToRemove = [
    '[g_editable]',
    '[docs-unhandledkeys]',
  ];

  selectorsToRemove.forEach((sel) => {
    doc.querySelectorAll(sel).forEach((el) => {
      // Keep text content but remove the element wrapper
      const textContent = el.textContent || '';
      if (textContent.trim()) {
        const span = doc.createElement('span');
        span.innerHTML = el.innerHTML;
        el.replaceWith(span);
      } else {
        el.remove();
      }
    });
  });

  // Dangerous CSS properties to strip from inline styles
  const dangerousProps = [
    'position',
    'z-index',
    'top',
    'left',
    'right',
    'bottom',
    'min-width',
    'min-height',
    'max-width',
    'max-height',
    'resize',
    'cursor',
    '-webkit-user-modify',
    'transform',
  ];

  doc.querySelectorAll('[style]').forEach((el) => {
    const htmlEl = el as HTMLElement;
    dangerousProps.forEach((prop) => {
      htmlEl.style.removeProperty(prop);
    });

    // Remove input-box class styling (from Google Sheets)
    if (htmlEl.classList.contains('input-box')) {
      htmlEl.style.removeProperty('border-width');
      htmlEl.style.removeProperty('border-image');
      htmlEl.style.removeProperty('border-color');
      htmlEl.style.removeProperty('box-shadow');
      htmlEl.style.removeProperty('outline');
      htmlEl.style.removeProperty('overflow');
      htmlEl.style.removeProperty('padding');
      htmlEl.classList.remove('input-box');
    }
  });

  return doc.body.innerHTML;
}
