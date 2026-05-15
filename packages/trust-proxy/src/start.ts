import { createProvider, providerFromEnv } from '@trust-layer/providers';
import { createApp } from './app.js';

export async function startProxy() {
  const config = providerFromEnv('TARGET_LLM');
  const provider = createProvider(config);
  const app = await createApp({ targetProvider: provider });

  const port = parseInt(process.env['PROXY_PORT'] ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Trust Proxy running on port ${port} [provider=${config.name}]`);
  return app;
}
