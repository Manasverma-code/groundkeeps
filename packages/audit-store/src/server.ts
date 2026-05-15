import Fastify from 'fastify';
import { AuditStore } from './store.js';
import type { AuditAppendRequest, AuditQuery } from './store.js';

export function createAuditServer(store: AuditStore) {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'audit-store' }));

  app.post<{ Body: AuditAppendRequest }>('/v1/audit', async (req, reply) => {
    const entry = store.append(req.body);
    return reply.code(201).send(entry);
  });

  app.get('/v1/audit', async (req) => {
    const query = req.query as AuditQuery;
    return store.query(query);
  });

  app.get<{ Params: { id: string } }>('/v1/audit/:id', async (req, reply) => {
    const entry = store.getByAuditId(req.params.id);
    if (!entry) {
      return reply.code(404).send({ error: 'Audit entry not found' });
    }
    return entry;
  });

  app.get('/v1/audit/count', async (req) => {
    const query = req.query as AuditQuery;
    return { count: store.count(query) };
  });

  app.get('/v1/audit/chain/verify', async () => {
    return store.verifyChain();
  });

  return app;
}
