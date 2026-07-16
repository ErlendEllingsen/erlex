import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  // served from https://<user>.github.io/erlex/
  base: '/erlex/',
  plugins: [react()],
  server: {
    host: true, // expose on the LAN/Tailscale so a phone can reach the dev server
    port: 5173,
  },
});
