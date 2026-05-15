import Fastify from 'fastify';
import { GroundingEngine } from './engine.js';
import type { GroundingRequest } from '@trust-layer/shared';

export function createGroundingServer(engine: GroundingEngine) {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'grounding-engine' }));

  app.post<{ Body: GroundingRequest }>('/v1/ground', async (req, reply) => {
    const result = await engine.verify(req.body);
    return reply.code(200).send(result);
  });

  return app;
}
