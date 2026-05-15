import { randomUUID, createHmac, randomBytes } from 'node:crypto';
import type { AgentRegistration, AgentCredentials, AgentInfo } from '@trust-layer/shared';

const TOKEN_ISSUER = 'trust-layer-guard';
const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour

interface TokenPayload {
  sub: string;
  scope: string;
  iss: string;
  iat: number;
  exp: number;
}

export class AgentIdentityManager {
  private agents = new Map<string, {
    name: string;
    scope: string;
    secret: string;
    createdAt: string;
  }>();
  private signingKey: string;

  constructor(signingKey?: string) {
    this.signingKey = signingKey ?? randomBytes(32).toString('hex');
  }

  registerAgent(registration: AgentRegistration): AgentCredentials {
    const agentId = randomUUID();
    const clientSecret = randomBytes(24).toString('hex');

    this.agents.set(agentId, {
      name: registration.name,
      scope: registration.scope,
      secret: clientSecret,
      createdAt: new Date().toISOString(),
    });

    const token = this.createToken(agentId, registration.scope);

    return { agent_id: agentId, client_secret: clientSecret, token };
  }

  verifyToken(token: string): { agentId: string; scope: string } | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const payload = this.decodePayload(parts[1]);
      if (!payload) return null;

      const expectedSig = this.sign(parts[0], parts[1]);
      if (parts[2] !== expectedSig) return null;

      if (payload.exp < Math.floor(Date.now() / 1000)) return null;

      const agent = this.agents.get(payload.sub);
      if (!agent) return null;

      return { agentId: payload.sub, scope: payload.scope };
    } catch {
      return null;
    }
  }

  getAgent(agentId: string): AgentInfo | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    return {
      agent_id: agentId,
      name: agent.name,
      scope: agent.scope,
      created_at: agent.createdAt,
    };
  }

  listAgents(): AgentInfo[] {
    return Array.from(this.agents.entries()).map(([id, agent]) => ({
      agent_id: id,
      name: agent.name,
      scope: agent.scope,
      created_at: agent.createdAt,
    }));
  }

  revokeAgent(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  private createToken(agentId: string, scope: string): string {
    const header = this.encodeBase64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      sub: agentId,
      scope,
      iss: TOKEN_ISSUER,
      iat: now,
      exp: now + TOKEN_EXPIRY_SECONDS,
    };
    const payloadB64 = this.encodeBase64(JSON.stringify(payload));
    const sig = this.sign(header, payloadB64);
    return `${header}.${payloadB64}.${sig}`;
  }

  private sign(header: string, payload: string): string {
    return createHmac('sha256', this.signingKey)
      .update(`${header}.${payload}`)
      .digest('base64url');
  }

  private decodePayload(payloadB64: string): TokenPayload | null {
    try {
      const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as TokenPayload;
      if (typeof parsed.sub !== 'string' || typeof parsed.exp !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private encodeBase64(data: string): string {
    return Buffer.from(data).toString('base64url');
  }
}
