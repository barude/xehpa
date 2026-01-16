/**
 * DOM utility functions
 */

/**
 * Check if user is currently typing in an input or textarea element
 */
export function isTyping(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  if (active.tagName === 'TEXTAREA') return true;
  if (active.tagName === 'INPUT') {
    const type = (active as HTMLInputElement).type;
    return ['text', 'number', 'password', 'email', 'search'].includes(type);
  }
  return false;
}


