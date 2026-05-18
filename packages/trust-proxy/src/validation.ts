import { z } from 'zod';

const MAX_STRING_LENGTH = 10000;
const MAX_MESSAGE_LENGTH = 100000;
const MAX_CONTENT_LENGTH = 100000;
const MAX_MESSAGES = 1000;
const MAX_SOURCES = 100;
const MAX_SOURCE_CONTENT_LENGTH = 100000;
const MAX_AGENT_NAME = 200;
const MAX_SCOPE = 500;
const MAX_RESOURCE_LENGTH = 2000;
const MAX_REASON_LENGTH = 500;
const MAX_POLICY_RULES = 100;

const NonEmptyString = (max: number) => z.string().min(1, 'Must not be empty').max(max, `Must be at most ${max} characters`);

export const LLMMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(MAX_MESSAGE_LENGTH),
});

export const SourceDocumentSchema = z.object({
  id: NonEmptyString(500),
  title: NonEmptyString(500),
  content: z.string().min(1).max(MAX_SOURCE_CONTENT_LENGTH),
  url: z.string().url().max(2000).optional(),
  timestamp: z.string().max(100).optional(),
  authority_score: z.number().min(0).max(1).optional(),
  relevance_score: z.number().min(0).max(1).optional(),
  metadata: z.object({
    status: z.enum(['active', 'expired', 'draft', 'superseded']).optional(),
    effective_date: z.string().max(100).optional(),
    expiry_date: z.string().max(100).optional(),
    version: z.number().int().positive().optional(),
    supersedes: z.array(z.string().max(500)).max(100).optional(),
    superseded_by: z.string().max(500).optional(),
  }).optional(),
});

export const ChatBodySchema = z.object({
  model: NonEmptyString(200).optional(),
  messages: z.array(LLMMessageSchema).min(1, 'At least one message required').max(MAX_MESSAGES),
  max_tokens: z.number().int().positive().max(1000000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const GovernanceRuleSchema = z.object({
  type: z.enum(['status_equals', 'effective_date_on_or_before', 'not_expired', 'not_superseded', 'version_gte']),
  value: z.union([z.string().max(500), z.number()]).optional(),
  reason: NonEmptyString(MAX_REASON_LENGTH).optional(),
});

export const DocumentGovernanceConfigSchema = z.object({
  rules: z.array(GovernanceRuleSchema).min(1).max(100),
});

export const CitationCheckSchema = z.object({
  cited_ids: z.array(z.string().max(500)).max(1000).optional(),
  fabricated_ids: z.array(z.string().max(500)).max(1000).optional(),
  valid_ids: z.array(z.string().max(500)).max(1000).optional(),
  citation_count: z.number().int().nonnegative().optional(),
});

export const ContentSafetyViolationSchema = z.object({
  type: NonEmptyString(200),
  pattern: NonEmptyString(500),
  match: NonEmptyString(MAX_CONTENT_LENGTH),
});

export const OutputGovernanceConfigSchema = z.object({
  check_citations: z.boolean().optional(),
  forbid_fabricated_citations: z.boolean().optional(),
  block_pii: z.boolean().optional(),
  custom_patterns: z.array(z.string().max(500)).max(100).optional(),
  min_citations: z.number().int().nonnegative().max(100).optional(),
});

export const EscalationRuleSchema = z.object({
  metric: z.enum(['hallucination_score', 'unsupported_claim_count', 'citation_missing', 'content_violation']),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq']),
  threshold: z.number().min(0).max(1000000),
  action: z.enum(['pass', 'flag', 'block', 'correct']),
  message: NonEmptyString(MAX_REASON_LENGTH).optional(),
});

export const EscalationConfigSchema = z.object({
  rules: z.array(EscalationRuleSchema).min(1).max(100),
});

export const VerifyBodySchema = z.object({
  response: NonEmptyString(MAX_CONTENT_LENGTH),
  sources: z.array(SourceDocumentSchema).max(MAX_SOURCES).default([]),
  action: NonEmptyString(200),
  resource: NonEmptyString(MAX_RESOURCE_LENGTH),
  agent_token: NonEmptyString(2000).optional(),
  agent_id: NonEmptyString(200).optional(),
  governance: DocumentGovernanceConfigSchema.optional(),
  output_governance: OutputGovernanceConfigSchema.optional(),
  escalation: EscalationConfigSchema.optional(),
});

export const ChatVerifyBodySchema = z.object({
  model: NonEmptyString(200).optional(),
  messages: z.array(LLMMessageSchema).min(1).max(MAX_MESSAGES),
  sources: z.array(SourceDocumentSchema).max(MAX_SOURCES).default([]),
  action: NonEmptyString(200),
  resource: NonEmptyString(MAX_RESOURCE_LENGTH),
  agent_token: NonEmptyString(2000).optional(),
  agent_id: NonEmptyString(200).optional(),
  max_tokens: z.number().int().positive().max(1000000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  governance: DocumentGovernanceConfigSchema.optional(),
  output_governance: OutputGovernanceConfigSchema.optional(),
  escalation: EscalationConfigSchema.optional(),
});

export const CreateAgentBodySchema = z.object({
  name: NonEmptyString(MAX_AGENT_NAME),
  scope: NonEmptyString(MAX_SCOPE),
});

const PolicyRuleSchema = z.object({
  action: z.enum(['read', 'write', 'delete', 'execute']),
  resource: NonEmptyString(MAX_RESOURCE_LENGTH),
});

export const PolicyBodySchema = z.object({
  agent: NonEmptyString(MAX_AGENT_NAME),
  allow: z.array(PolicyRuleSchema).min(1).max(MAX_POLICY_RULES),
  deny: z.array(PolicyRuleSchema).max(MAX_POLICY_RULES).optional(),
});

export const EvaluateBodySchema = z.object({
  action: NonEmptyString(200),
  resource: NonEmptyString(MAX_RESOURCE_LENGTH),
  agent_id: NonEmptyString(200),
});

export const VerifyActionBodySchema = z.object({
  token: NonEmptyString(2000),
  action: NonEmptyString(200),
  resource: NonEmptyString(MAX_RESOURCE_LENGTH),
});
