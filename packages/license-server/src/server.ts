import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { readFileSync } from 'node:fs';
import { sign } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { LicenseStore } from './store.js';
import type { LicenseRecord } from './store.js';

const PRO_LIMITS = {
  verifications_per_month: Infinity,
  max_agents: Infinity,
  audit_retention_days: 365,
};

function loadPrivateKey(): string {
  const paths = [
    resolve(process.cwd(), 'keys', 'private.pem'),
    resolve(process.cwd(), '..', '..', 'keys', 'private.pem'),
  ];
  for (const p of paths) {
    try {
      return readFileSync(p, 'utf-8');
    } catch { }
  }
  throw new Error('private.pem not found in keys/ directory');
}

function generateLicenseKey(payload: object, privateKey: string): string {
  const sig = sign(null, Buffer.from(JSON.stringify(payload)), privateKey);
  return Buffer.from(JSON.stringify({ payload, sig: sig.toString('base64url') })).toString('base64url');
}

function isExpired(expiresAt: string): boolean {
  return Date.now() > new Date(expiresAt).getTime();
}

const IssueBodySchema = z.object({
  tier: z.enum(['pro']),
  days: z.number().int().positive().default(365),
  customerEmail: z.string().email().optional(),
  paymentProvider: z.enum(['stripe', 'razorpay']).optional(),
  paymentId: z.string().optional(),
});

const ValidateBodySchema = z.object({
  licenseKey: z.string().min(1),
  hostname: z.string().optional(),
});

const RevokeBodySchema = z.object({
  licenseKey: z.string().min(1),
});

export async function createLicenseServer(config: {
  port?: number;
  adminKey: string;
  stripeSecret?: string;
  razorpaySecret?: string;
}) {
  const app = Fastify({ logger: true });
  await app.register(fastifyCors, { origin: true });

  const privateKey = loadPrivateKey();
  const store = new LicenseStore();

  // Admin auth middleware
  function adminAuth(request: FastifyRequest, reply: FastifyReply) {
    const auth = request.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== config.adminKey) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  }

  // Health
  app.get('/v1/health', async () => ({
    status: 'ok',
    service: 'groundkeeps-license-server',
    version: '0.1.0',
  }));

  // Issue a license (admin only)
  app.post('/v1/issue', async (req, reply) => {
    const authResult = adminAuth(req, reply);
    if (authResult) return authResult;

    const parsed = IssueBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { tier, days, customerEmail, paymentProvider, paymentId } = parsed.data;
    const exp = Math.floor(Date.now() / 1000) + days * 86400;

    const payload = {
      tier,
      limits: PRO_LIMITS,
      exp,
      iss: 'groundkeeps-license-server',
    };

    const licenseKey = generateLicenseKey(payload, privateKey);

    const record: LicenseRecord = {
      key: licenseKey,
      tier: 'pro',
      customerEmail,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(exp * 1000).toISOString(),
      revoked: false,
      paymentProvider,
      paymentId,
    };
    store.add(record);

    req.log.info({ tier, days, customerEmail }, 'License issued');

    return reply.code(201).send({
      licenseKey,
      tier,
      expiresAt: record.expiresAt,
    });
  });

  // Validate a license (called by proxy instances)
  app.post('/v1/validate', async (req, reply) => {
    const parsed = ValidateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const { licenseKey, hostname } = parsed.data;
    const record = store.findByKey(licenseKey);

    // Decode & verify signature locally first
    try {
      const decoded = JSON.parse(Buffer.from(licenseKey, 'base64url').toString('utf-8'));
      const payload = decoded.payload;
      const sig = decoded.sig ? Buffer.from(decoded.sig, 'base64url') : null;
      if (!sig) {
        return reply.send({ valid: false, reason: 'Malformed license key' });
      }
      if (isExpired(new Date(payload.exp * 1000).toISOString())) {
        return reply.send({ valid: false, reason: 'License expired', tier: 'free' });
      }
    } catch {
      return reply.send({ valid: false, reason: 'Malformed license key' });
    }

    // Check store for revocation
    if (record?.revoked) {
      return reply.send({ valid: false, reason: 'License revoked', tier: 'free' });
    }

    // Update last validated timestamp
    if (record) {
      store.recordValidation(licenseKey);
      if (hostname) record.hostname = hostname;
    }

    return reply.send({
      valid: true,
      tier: 'pro',
      expiresAt: record?.expiresAt ?? null,
    });
  });

  // Revoke a license (admin only)
  app.post('/v1/revoke', async (req, reply) => {
    const authResult = adminAuth(req, reply);
    if (authResult) return authResult;

    const parsed = RevokeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.issues });
    }

    const revoked = store.revoke(parsed.data.licenseKey);
    if (!revoked) {
      return reply.code(404).send({ error: 'License not found' });
    }
    req.log.info({ licenseKey: parsed.data.licenseKey }, 'License revoked');
    return reply.send({ status: 'revoked' });
  });

  // Stripe webhook
  app.post('/v1/webhook/stripe', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const eventType = body['type'] as string;

    if (eventType === 'checkout.session.completed') {
      const data = body['data'] as Record<string, unknown> | undefined;
      const session = (data?.['object'] ?? {}) as Record<string, unknown>;
      const customerDetails = session['customer_details'] as Record<string, unknown> | undefined;
      const customerEmail = (session['customer_email'] as string) ?? (customerDetails?.['email'] as string) ?? undefined;
      const paymentId = session['id'] as string;

      const exp = Math.floor(Date.now() / 1000) + 365 * 86400;
      const payload = { tier: 'pro', limits: PRO_LIMITS, exp, iss: 'groundkeeps-license-server' };
      const licenseKey = generateLicenseKey(payload, privateKey);

      store.add({
        key: licenseKey,
        tier: 'pro',
        customerEmail,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(exp * 1000).toISOString(),
        revoked: false,
        paymentProvider: 'stripe',
        paymentId,
      });

      req.log.info({ customerEmail, paymentId }, 'Stripe license issued');
    }

    return reply.send({ received: true });
  });

  // Razorpay webhook
  app.post('/v1/webhook/razorpay', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const event = body['event'] as string;

    if (event === 'payment.captured' || event === 'order.paid') {
      const payload = body['payload'] as Record<string, unknown> | undefined;
      const paymentData = (payload?.['payment'] as Record<string, unknown>) ?? {};
      const paymentEntity = paymentData['entity'] as Record<string, unknown> ?? {};
      const orderData = (payload?.['order'] as Record<string, unknown>) ?? {};
      const orderEntity = orderData['entity'] as Record<string, unknown> ?? {};
      const customerEmail = paymentEntity['email'] as string ?? undefined;
      const paymentId = paymentEntity['id'] as string ?? orderEntity['id'] as string;

      const exp = Math.floor(Date.now() / 1000) + 365 * 86400;
      const licPayload = { tier: 'pro', limits: PRO_LIMITS, exp, iss: 'groundkeeps-license-server' };
      const licenseKey = generateLicenseKey(licPayload, privateKey);

      store.add({
        key: licenseKey,
        tier: 'pro',
        customerEmail,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(exp * 1000).toISOString(),
        revoked: false,
        paymentProvider: 'razorpay',
        paymentId,
      });

      req.log.info({ customerEmail, paymentId }, 'Razorpay license issued');
    }

    return reply.send({ received: true });
  });

  // List licenses (admin only)
  app.get('/v1/licenses', async (req, reply) => {
    const authResult = adminAuth(req, reply);
    if (authResult) return authResult;
    return store.list();
  });

  return app;
}
