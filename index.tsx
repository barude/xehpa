
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  const errorMsg = document.createElement('div');
  errorMsg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;color:#ff6600;display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:14px;padding:20px;text-align:center;z-index:9999;';
  errorMsg.textContent = 'Error: Could not find root element to mount application. Please ensure the HTML contains an element with id="root".';
  document.body.appendChild(errorMsg);
  console.error('Could not find root element to mount to');
} else {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
