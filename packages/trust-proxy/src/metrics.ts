import type { AuditStore } from '@trust-layer/audit-store';

export interface MetricCollector {
  requestCount: number;
  hallucinationTotal: number;
  policyViolations: number;
  escalationBlocks: number;
  recentHallucinationScores: number[];
  getUptime(): number;
  auditStore?: AuditStore;
  groundingEnabled: boolean;
  guardEnabled: boolean;
  auditEnabled: boolean;
  targetLlmName: string;
  licenseTier: string;
  remainingVerifications: number;
}

export function formatPrometheusMetrics(c: MetricCollector): string {
  const lines: string[] = [];
  const uptime = Math.floor(c.getUptime());
  const avgHallucination = c.recentHallucinationScores.length > 0
    ? c.recentHallucinationScores.reduce((a, b) => a + b, 0) / c.recentHallucinationScores.length
    : 0;
  const auditCount = c.auditStore ? c.auditStore.count({}) : 0;

  lines.push('# HELP groundkeeps_uptime_seconds Server uptime in seconds');
  lines.push('# TYPE groundkeeps_uptime_seconds gauge');
  lines.push(`groundkeeps_uptime_seconds ${uptime}`);

  lines.push('# HELP groundkeeps_requests_total Total requests processed');
  lines.push('# TYPE groundkeeps_requests_total counter');
  lines.push(`groundkeeps_requests_total ${c.requestCount}`);

  lines.push('# HELP groundkeeps_audit_entries_total Total audit log entries');
  lines.push('# TYPE groundkeeps_audit_entries_total gauge');
  lines.push(`groundkeeps_audit_entries_total ${auditCount}`);

  lines.push('# HELP groundkeeps_policy_violations_total Total policy violations');
  lines.push('# TYPE groundkeeps_policy_violations_total counter');
  lines.push(`groundkeeps_policy_violations_total ${c.policyViolations}`);

  lines.push('# HELP groundkeeps_escalation_blocks_total Total escalation blocks');
  lines.push('# TYPE groundkeeps_escalation_blocks_total counter');
  lines.push(`groundkeeps_escalation_blocks_total ${c.escalationBlocks}`);

  lines.push('# HELP groundkeeps_hallucination_score_avg Average hallucination score over recent verifications');
  lines.push('# TYPE groundkeeps_hallucination_score_avg gauge');
  lines.push(`groundkeeps_hallucination_score_avg ${avgHallucination.toFixed(4)}`);

  lines.push('# HELP groundkeeps_engine_status Engine enabled status (1=enabled, 0=disabled)');
  lines.push('# TYPE groundkeeps_engine_status gauge');
  lines.push(`groundkeeps_engine_status{engine="grounding"} ${c.groundingEnabled ? 1 : 0}`);
  lines.push(`groundkeeps_engine_status{engine="guard"} ${c.guardEnabled ? 1 : 0}`);
  lines.push(`groundkeeps_engine_status{engine="audit"} ${c.auditEnabled ? 1 : 0}`);

  lines.push('# HELP groundkeeps_target_llm Target LLM provider name');
  lines.push('# TYPE groundkeeps_target_llm gauge');
  lines.push(`groundkeeps_target_llm{provider="${c.targetLlmName}"} 1`);

  lines.push('# HELP groundkeeps_version Proxy version info');
  lines.push('# TYPE groundkeeps_version gauge');
  lines.push('groundkeeps_version{version="0.1.0"} 1');

  lines.push('# HELP groundkeeps_license_tier License tier (free=0, pro=1)');
  lines.push('# TYPE groundkeeps_license_tier gauge');
  lines.push(`groundkeeps_license_tier{tier="${c.licenseTier}"} ${c.licenseTier === 'pro' ? 1 : 0}`);

  lines.push('# HELP groundkeeps_remaining_verifications Remaining verifications this month');
  lines.push('# TYPE groundkeeps_remaining_verifications gauge');
  lines.push(`groundkeeps_remaining_verifications ${c.remainingVerifications}`);

  lines.push('');
  return lines.join('\n');
}
