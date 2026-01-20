/**
 * Safe localStorage helper functions with error handling
 */

/**
 * Safely get an item from localStorage, returning a default value on error
 */
export function safeLocalStorageGet<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    return JSON.parse(item) as T;
  } catch (e) {
    console.error(`Failed to read localStorage key "${key}":`, e);
    return defaultValue;
  }
}

/**
 * Safely set an item in localStorage, returning success status
 */
export function safeLocalStorageSet(key: string, value: any): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    if (e instanceof DOMException && (e.code === 22 || e.code === 1014 || e.name === 'QuotaExceededError')) {
      console.error(`localStorage quota exceeded for key "${key}". Data not saved.`);
    } else {
      console.error(`Failed to write localStorage key "${key}":`, e);
    }
    return false;
  }
}

/**
 * Create a debounced localStorage write function
 * @param key - The localStorage key to write to
 * @param delay - The debounce delay in milliseconds (default: 300)
 */
export function createDebouncedLocalStorageWrite(key: string, delay: number = 300) {
  let timeoutId: number | null = null;
  return (value: any) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      safeLocalStorageSet(key, value);
      timeoutId = null;
    }, delay);
  };
}




