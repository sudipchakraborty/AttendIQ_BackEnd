import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
export function clientAddress(req: { ip?: string; headers: Record<string, unknown> }, secret: string): string {
  const ip = req.headers['x-attendiq-client-ip'], timestamp = req.headers['x-attendiq-timestamp'], signature = req.headers['x-attendiq-signature'];
  if (secret.length < 64 || typeof ip !== 'string' || !isIP(ip) || typeof timestamp !== 'string' || !/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 60000 || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return req.ip || 'unknown';
  const expected = createHmac('sha256', secret).update(`${timestamp}\n${ip}`).digest();
  return timingSafeEqual(Buffer.from(signature, 'hex'), expected) ? ip : req.ip || 'unknown';
}
