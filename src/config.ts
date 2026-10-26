import { resolve } from 'node:path';
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT || 3201);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT.');
  const production = env.NODE_ENV === 'production';
  const origins = (env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  for (const origin of origins) if (new URL(origin).origin !== origin || (production && !origin.startsWith('https://'))) throw Error('Origins must be exact HTTPS origins in production.');
  return {
    port, host: env.HOST || '127.0.0.1', production,
    storage: resolve(env.ATTENDIQ_STORAGE || '.attendiq'),
    secureCookies: production, origins, gatewaySecret: env.ATTENDIQ_GATEWAY_SECRET || '',
    trustProxy: env.TRUST_PROXY === '1',
    smtp: { host: env.SMTP_HOST || '', port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === 'true', user: env.SMTP_USER || '', password: env.SMTP_PASSWORD || '', from: env.SMTP_FROM || '' }
  };
}
export type Config = ReturnType<typeof loadConfig>;
