import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Store } from './store.js';
import type { Config } from './config.js';
import { sessionMiddleware } from './auth.js';
import { route } from './api.js';
import { ApiError, randomId } from './security.js';
export function createApp(config: Config, store: Store) {
  const app = express(); app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 'loopback');
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    const origin = req.headers.origin;
    // Same-origin browser requests are allowed even with no CORS allowlist.
    const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
    if (origin && !sameOrigin) {
      if (!config.origins.includes(origin)) { res.status(403).json({error: 'Origin is not allowed.'}); return; }
      res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' });
    }
    if (req.method === 'OPTIONS') { res.set({ 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-CSRF-Token' }); res.sendStatus(204); return; }
    next();
  });
  app.get('/health', (_req, res) => { res.json({status:'ok', service:'attendiq-backend'}); });
  app.get('/ready', (_req, res) => { store.ready(); res.json({status:'ready'}); });
  app.use('/api', express.json({ limit: 32768, strict: true }), (req, _res, next) => {
    if (req.body && (Array.isArray(req.body) || typeof req.body !== 'object')) throw new ApiError(422, 'A JSON object is required.');
    next();
  }, sessionMiddleware(config, store), async (req, res) => {
    const path = req.path === '/index.php' ? req.query.route : req.path;
    if (typeof path !== 'string' || !path.startsWith('/') || path.length > 180) throw new ApiError(404, 'Invalid route.');
    res.json(await route(req, res.locals.context, store, config, path));
  });
  app.use((_req, res) => { res.status(404).json({error:'Endpoint not found.'}); });
  app.use((error: Error & {status?: number; type?: string}, _req: Request, res: Response, _next: NextFunction) => {
    const status = error instanceof ApiError ? error.status : error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError && error.status === 400 ? 422 : 500;
    const requestId = randomId();
    if (status === 500) console.error(JSON.stringify({level:'error', event:'request.failed', requestId, type:error.name}));
    res.status(status).json({error: status === 500 ? 'The server could not complete the request. Please contact your administrator.' : status === 413 ? 'Request is too large.' : status === 422 && !(error instanceof ApiError) ? 'Invalid JSON request.' : error.message, ...(status === 500 ? {requestId} : {})});
  });
  return app;
}
