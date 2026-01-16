// Shim for jszip that uses the global JSZip loaded via script tag in index.html
// This avoids Vite trying to resolve the import

declare global {
  interface Window {
    JSZip: any;
  }
}

export default async function loadJSZip() {
  // Wait for JSZip to be available on window (loaded via script tag)
  if ((window as any).JSZip) {
    return (window as any).JSZip;
  }
  
  // If not available yet, wait a bit and try again
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const checkJSZip = () => {
      if ((window as any).JSZip) {
        resolve((window as any).JSZip);
      } else if (attempts < 50) {
        attempts++;
        setTimeout(checkJSZip, 100);
      } else {
        reject(new Error('JSZip failed to load from CDN'));
      }
    };
    checkJSZip();
  });
}

