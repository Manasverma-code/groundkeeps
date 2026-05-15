import Fastify from 'fastify';
import { GuardEngine } from './engine.js';
import type { Policy, AgentRegistration } from '@trust-layer/shared';

export function createGuardServer(engine: GuardEngine) {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'ok', service: 'guard-engine' }));

  app.post<{ Body: AgentRegistration }>('/v1/agents', async (req, reply) => {
    const credentials = engine.registerAgent(req.body.name, req.body.scope);
    return reply.code(201).send(credentials);
  });

  app.get('/v1/agents', async () => {
    return engine.listAgents();
  });

  app.get<{ Params: { id: string } }>('/v1/agents/:id', async (req, reply) => {
    const agent = engine.getAgent(req.params.id);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    return agent;
  });

  app.delete<{ Params: { id: string } }>('/v1/agents/:id', async (req, reply) => {
    const revoked = engine.revokeAgent(req.params.id);
    if (!revoked) return reply.code(404).send({ error: 'Agent not found' });
    return reply.code(204).send();
  });

  app.post<{ Body: Policy }>('/v1/policies', async (req, reply) => {
    engine.setPolicy(req.body);
    return reply.code(201).send({ status: 'Policy set' });
  });

  app.get('/v1/policies', async () => {
    return engine.listPolicies();
  });

  app.post<{
    Body: { action: string; resource: string; agent_id: string };
  }>('/v1/evaluate', async (req) => {
    const { action, resource, agent_id } = req.body;
    return engine.evaluate(action, resource, agent_id);
  });

  app.post<{
    Body: { token: string; action: string; resource: string };
  }>('/v1/verify-action', async (req) => {
    return engine.verifyAction(req.body.token, req.body.action, req.body.resource);
  });

  return app;
}
