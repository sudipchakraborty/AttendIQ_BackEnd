import { pathToFileURL } from 'node:url';
import { loadConfig, type Config } from './config.js';
import { openStore } from './store.js';
import { createApp } from './app.js';
export function startServer(config: Config) {
  process.umask(0o077);
  const store = openStore(config.storage);
  const server = createApp(config, store).listen(config.port, config.host, () => console.log(JSON.stringify({event:'server.started',host:config.host,port:config.port})));
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  let stopping = false;
  const stop = () => { if (stopping) return; stopping = true; server.close(() => { store.close(); process.exitCode = 0; }); setTimeout(() => { server.closeAllConnections(); }, 15000).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  return { server, store, stop };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer(loadConfig());
