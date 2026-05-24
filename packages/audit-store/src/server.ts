import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuditStore } from './store.js';
import type { AuditAppendRequest, AuditQuery } from './store.js';

export function createAuditServer(store: AuditStore, apiKey?: string) {
  const app = Fastify({ logger: true });

  function authHook(req: FastifyRequest, reply: FastifyReply) {
    if (!apiKey) return;
    if (req.url === '/health') return;
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
    }
    const key = auth.slice(7);
    if (key.length !== apiKey.length || !timingSafeEqual(Buffer.from(key), Buffer.from(apiKey))) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }
  }

  app.addHook('onRequest', async (req, reply) => authHook(req, reply));

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
