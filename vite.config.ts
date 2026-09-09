import { defineConfig } from 'vite';

const startupRecoveryScript = String.raw`
(() => {
  const refreshParam = '__poortaal_refresh';
  let booted = false;
  let recovering = false;

  function showStartupFailure() {
    const render = () => {
      if (!document.body || document.getElementById('poortaal-startup-error')) return;

      const banner = document.createElement('div');
      banner.id = 'poortaal-startup-error';
      banner.setAttribute('role', 'alert');
      banner.style.cssText = [
        'position:fixed',
        'left:16px',
        'right:16px',
        'top:16px',
        'z-index:9999',
        'padding:12px 16px',
        'border-radius:12px',
        'background:#fff',
        'color:#1f2937',
        'box-shadow:0 8px 30px rgba(0,0,0,.18)',
        'font:500 14px/1.4 system-ui,-apple-system,sans-serif',
      ].join(';');
      banner.textContent = 'Poortaal kon niet starten na een update. Vernieuw de pagina.';
      document.body.prepend(banner);
    };

    if (document.body) render();
    else window.addEventListener('DOMContentLoaded', render, { once: true });
  }

  function recoverStartup() {
    if (booted || recovering) return;
    recovering = true;

    const url = new URL(window.location.href);
    if (url.searchParams.has(refreshParam)) {
      showStartupFailure();
      return;
    }

    url.searchParams.set(refreshParam, Date.now().toString());
    window.location.replace(url.toString());
  }

  window.addEventListener('poortaal:booted', () => {
    booted = true;

    const url = new URL(window.location.href);
    if (!url.searchParams.has(refreshParam)) return;

    url.searchParams.delete(refreshParam);
    const cleaned = url.pathname + url.search + url.hash;
    window.history.replaceState(null, '', cleaned);
  }, { once: true });

  window.addEventListener('error', (event) => {
    if (booted) return;

    const target = event.target;
    if (target instanceof HTMLScriptElement || event.error) {
      recoverStartup();
    }
  }, true);

  window.addEventListener('unhandledrejection', () => {
    recoverStartup();
  });
})();
`;

export default defineConfig({
  plugins: [
    {
      name: 'poortaal-startup-recovery',
      transformIndexHtml(html) {
        return html.replace(
          '<head>',
          `<head>\n<script>${startupRecoveryScript}</script>`,
        );
      },
    },
  ],
});
