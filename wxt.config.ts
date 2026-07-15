import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Chrome 126+ broke web-ext's in-place reload; let it not launch a browser.
  // Load .output/chrome-mv3-dev manually once via chrome://extensions.
  webExt: { disabled: true },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'YouTube News',
    // `cookies` + google.com host access: read the SAPISID cookie to sign
    // InnerTube requests (SAPISIDHASH) so the history scrape isn't 403'd.
    permissions: ['storage', 'cookies'],
    host_permissions: [
      'https://www.googleapis.com/*',
      'https://*.youtube.com/*',
      'https://*.google.com/*',
    ],
  },
});
