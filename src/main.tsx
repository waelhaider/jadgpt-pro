import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// كتم أخطاء الاتصال بـ Websocket الخاصة بـ Vite لمنع ظهور النوافذ المزعجة في المتصفح
if (typeof window !== 'undefined') {
  const isViteWSWarning = (reason: any) => {
    if (!reason) return false;
    const msg = String(reason.message || reason);
    return msg.includes('WebSocket') || msg.includes('vite') || msg.includes('ws://');
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (isViteWSWarning(event.reason)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  window.addEventListener('error', (event) => {
    if (isViteWSWarning(event.message || event.error)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register service worker for PWA capabilities (like Web Share Target)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('Service Worker registered successfully:', reg.scope);
        // Auto update service worker when new version found
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('New service worker available, reloading to apply...');
                window.location.reload();
              }
            });
          }
        });
      })
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}


