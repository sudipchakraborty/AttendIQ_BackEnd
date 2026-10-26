import nodemailer from 'nodemailer';
import type { Config } from './config.js';
import type { Ticket, User } from './store.js';
import { ApiError } from './security.js';
export async function sendSupport(config: Config, ticket: Ticket, user: User) {
  if (!config.smtp.host || !config.smtp.from) throw new ApiError(503, 'Support email is not configured. Please contact your administrator.');
  const transport = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    connectionTimeout: 10000, socketTimeout: 15000, greetingTimeout: 10000,
    requireTLS: config.production && !config.smtp.secure
  });
  try {
    const result = await transport.sendMail({ from: config.smtp.from, to: 'info@niyanti.com', replyTo: user.email, subject: `[${ticket.id}] ${ticket.subject}`, text: `${user.name} (${user.email})\n\n${ticket.message}`, disableFileAccess: true, disableUrlAccess: true });
    if (!result.accepted?.length) throw Error('Recipient rejected');
  } catch { throw new ApiError(503, 'The mail server could not accept your request. Please try again later.'); }
  finally { transport.close(); }
}
