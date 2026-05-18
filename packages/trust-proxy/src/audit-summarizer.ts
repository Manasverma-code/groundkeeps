import type { LLMProvider } from '@trust-layer/providers';

export interface VerificationRecord {
  timestamp: string;
  type: 'verify' | 'chat/verify';
  verified: boolean;
  hallucination_score: number | null;
  governance_exclusions: number;
  output_governance_passed: boolean | null;
  escalation_action: string | null;
  violations: number;
  audit_id: string | null;
}

export interface AuditSummary {
  generated_at: string;
  total_verifications: number;
  overall_grounded_rate: number;
  total_passed: number;
  total_failed: number;
  avg_hallucination_score: number;
  hallucination_distribution: {
    safe: number;
    moderate: number;
    critical: number;
  };
  governance_exclusions_total: number;
  output_governance_pass_rate: number | null;
  escalation_breakdown: Record<string, number>;
  top_violations_count: number;
  dangerous_example: {
    timestamp: string;
    hallucination_score: number;
    audit_id: string | null;
  } | null;
  narrative: string;
}

function classifyScore(score: number | null): 'safe' | 'moderate' | 'critical' {
  if (score === null) return 'safe';
  if (score < 0.3) return 'safe';
  if (score < 0.6) return 'moderate';
  return 'critical';
}

export function computeSummary(records: VerificationRecord[], llmProvider?: LLMProvider): AuditSummary {
  const total = records.length;
  const passed = records.filter((r) => r.verified).length;
  const failed = records.filter((r) => !r.verified).length;
  const scores = records.map((r) => r.hallucination_score).filter((s): s is number => s !== null);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const hallucinationDist = { safe: 0, moderate: 0, critical: 0 };
  for (const r of records) {
    const cat = classifyScore(r.hallucination_score);
    hallucinationDist[cat]++;
  }

  const govExclusions = records.reduce((sum, r) => sum + r.governance_exclusions, 0);

  const ogPassed = records.filter((r) => r.output_governance_passed === true).length;
  const ogTotal = records.filter((r) => r.output_governance_passed !== null).length;
  const ogRate = ogTotal > 0 ? ogPassed / ogTotal : null;

  const escalationBreakdown: Record<string, number> = {};
  for (const r of records) {
    const action = r.escalation_action ?? 'none';
    escalationBreakdown[action] = (escalationBreakdown[action] ?? 0) + 1;
  }

  const totalViolations = records.reduce((sum, r) => sum + r.violations, 0);

  const worst = [...records]
    .filter((r) => r.hallucination_score !== null)
    .sort((a, b) => (b.hallucination_score ?? 0) - (a.hallucination_score ?? 0))[0] ?? null;

  const groundedRate = total > 0 ? passed / total : 1;

  const narrative = generateNarrative(total, groundedRate, avgScore, hallucinationDist, escalationBreakdown, worst);

  return {
    generated_at: new Date().toISOString(),
    total_verifications: total,
    overall_grounded_rate: Math.round(groundedRate * 10000) / 100,
    total_passed: passed,
    total_failed: failed,
    avg_hallucination_score: Math.round(avgScore * 100) / 100,
    hallucination_distribution: hallucinationDist,
    governance_exclusions_total: govExclusions,
    output_governance_pass_rate: ogRate !== null ? Math.round(ogRate * 10000) / 100 : null,
    escalation_breakdown: escalationBreakdown,
    top_violations_count: totalViolations,
    dangerous_example: worst
      ? { timestamp: worst.timestamp, hallucination_score: worst.hallucination_score!, audit_id: worst.audit_id }
      : null,
    narrative,
  };
}

function generateNarrative(
  total: number,
  groundedRate: number,
  avgScore: number,
  dist: { safe: number; moderate: number; critical: number },
  escalationBreakdown: Record<string, number>,
  worst: VerificationRecord | null,
): string {
  const pct = (groundedRate * 100).toFixed(1);
  const grade = groundedRate >= 0.95 ? 'Excellent' : groundedRate >= 0.85 ? 'Good' : groundedRate >= 0.7 ? 'Fair' : 'Needs Improvement';

  let narrative = `Trust Audit Summary — ${grade}\n\n`;
  narrative += `Over ${total} verification requests, ${pct}% were fully grounded. `;
  narrative += `Average hallucination score: ${avgScore.toFixed(2)}. `;

  if (dist.critical > 0) {
    narrative += `${dist.critical} critical hallucinations were detected and flagged. `;
  }
  if (dist.moderate > 0) {
    narrative += `${dist.moderate} moderate-risk responses required additional scrutiny. `;
  }

  if (escalationBreakdown['block'] && escalationBreakdown['block'] > 0) {
    narrative += `${escalationBreakdown['block']} responses were automatically blocked. `;
  }
  if (escalationBreakdown['correct'] && escalationBreakdown['correct'] > 0) {
    narrative += `${escalationBreakdown['correct']} responses were corrected before delivery. `;
  }

  if (worst) {
    narrative += `\n\n⚠️ Highest risk event: hallucination score ${(worst.hallucination_score ?? 0).toFixed(2)} at ${worst.timestamp}. Audit ID: ${worst.audit_id ?? 'N/A'}.`;
  }

  if (groundedRate < 0.9) {
    narrative += `\n\nRecommendation: Review source document quality and consider tightening verification thresholds.`;
  } else {
    narrative += `\n\nRecommendation: Current performance is within acceptable parameters. Continue monitoring.`;
  }

  return narrative;
}
