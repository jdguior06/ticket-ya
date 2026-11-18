import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';

// En desarrollo Vite hace de gateway (igual que Nginx en el servidor):
//   /api/<servicio>/...  ->  http://localhost:<puerto>/<servicio>/...   (solo se quita "/api")
// payments y notifications NO se exponen, igual que en Nginx.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'EY_');
  const targets: Record<string, string> = {
    auth: env.EY_AUTH_URL ?? 'http://localhost:3001',
    events: env.EY_EVENTS_URL ?? 'http://localhost:3002',
    orders: env.EY_ORDERS_URL ?? 'http://localhost:3003',
    tickets: env.EY_TICKETS_URL ?? 'http://localhost:3005',
    checkin: env.EY_CHECKIN_URL ?? 'http://localhost:3007',
  };
  const proxy: Record<string, ProxyOptions> = {};
  for (const [name, target] of Object.entries(targets)) {
    proxy[`/api/${name}`] = { target, changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') };
  }
  // HTTPS con certificado de desarrollo: el navegador del teléfono solo permite la cámara en HTTPS.
  const https = env.EY_HTTPS !== 'false';

  return {
    plugins: [react(), tailwindcss(), ...(https ? [basicSsl()] : [])],
    server: { host: true, port: 5173, proxy },
    preview: { host: true, port: 4173, proxy },
  };
});
