/**
 * Minimal user-facing error notification system
 * Provides clear, actionable feedback without being verbose
 */

export function showError(message: string, action?: string) {
  // Use alert for now - minimal, reliable, no dependencies
  // Format: Clear problem statement, optional action
  const fullMessage = action ? `${message}\n\n${action}` : message;
  alert(fullMessage);
}

export function showWarning(message: string, detail?: string) {
  // Warnings are less critical - still user-facing but less intrusive
  const fullMessage = detail ? `${message}\n\n${detail}` : message;
  alert(fullMessage);
  console.warn(message); // Keep console for debugging
}

