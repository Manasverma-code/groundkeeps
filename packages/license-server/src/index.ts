import { createLicenseServer } from './server.js';

const ADMIN_KEY = process.env['ADMIN_KEY'];
if (!ADMIN_KEY) {
  console.error('ADMIN_KEY environment variable is required');
  process.exit(1);
}

const port = parseInt(process.env['PORT'] ?? '3001', 10);

createLicenseServer({
  port,
  adminKey: ADMIN_KEY,
  webhookSecret: process.env['WEBHOOK_SECRET'] ?? ADMIN_KEY,
}).then((app) => app.listen({ port, host: '0.0.0.0' })).then(() => {
  console.log(`\n  🛡️  groundkeeps license server running on http://localhost:${port}\n`);
}).catch((err) => {
  console.error('Failed to start license server:', err);
  process.exit(1);
});
