import { createApp } from '../app.js';

let appPromise = null;

function getApp() {
  if (!appPromise) {
    appPromise = createApp().catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    const message = err?.message || String(err);
    console.error('[resolve] app init failed:', message);
    if (err?.stack) console.error(err.stack);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        error: 'INIT_FAILED',
        message,
        hint:
          'Check Vercel Project Settings → Environment Variables. Required: OPENROUTER_API_KEY, TURSO_DATABASE_URL (libsql:// URL — not file:), TURSO_AUTH_TOKEN.',
      })
    );
  }
}
