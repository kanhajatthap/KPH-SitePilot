import { RISK_ORDER, lookupTool, type ToolRisk } from './catalog.js';

/**
 * Risk Policy Engine (E3-03).
 *
 * Enforces monotonic risk floors (`R0`–`R3`), detects public-facing (`R2`) and
 * destructive (`R3`) steps, determines the required human confirmation ritual,
 * and emits honest staging advice when running higher-risk plans on production.
 */

export type ConfirmationKind = 'none' | 'word' | 'plan-id';

export interface RiskStepInput {
  tool: string;
  risk?: ToolRisk;
}

export interface EvaluatedStepRisk {
  tool: string;
  floor: ToolRisk;
  effectiveRisk: ToolRisk;
  shipped: boolean;
  reversible: boolean;
}

export interface RiskPolicyDecision {
  overallRisk: ToolRisk;
  isWrite: boolean;
  isPublicFacing: boolean;
  isDestructive: boolean;
  confirmationKind: ConfirmationKind;
  requiresConfirmation: boolean;
  stagingAdvice: string | null;
  steps: EvaluatedStepRisk[];
}

export function compareRisk(a: ToolRisk, b: ToolRisk): number {
  return RISK_ORDER.indexOf(a) - RISK_ORDER.indexOf(b);
}

export function hardenToolRisk(toolName: string, claimed?: ToolRisk): ToolRisk {
  const spec = lookupTool(toolName);
  const floor: ToolRisk = spec?.risk ?? 'R3';
  if (!claimed) return floor;
  return compareRisk(claimed, floor) > 0 ? claimed : floor;
}

function isDestructiveToolName(toolName: string): boolean {
  return /\.(?:delete|trash|purge|drop|wipe|write)$/i.test(toolName);
}

export function evaluateRiskPolicy(input: {
  steps: readonly RiskStepInput[];
  environment?: string;
}): RiskPolicyDecision {
  const evaluatedSteps: EvaluatedStepRisk[] = input.steps.map((step) => {
    const spec = lookupTool(step.tool);
    const floor: ToolRisk = spec?.risk ?? 'R3';
    const effectiveRisk = hardenToolRisk(step.tool, step.risk);
    return {
      tool: step.tool,
      floor,
      effectiveRisk,
      shipped: Boolean(spec?.shipped),
      reversible: Boolean(spec?.reversible),
    };
  });

  const anyDestructive = evaluatedSteps.some(
    (step) => step.effectiveRisk === 'R3' || isDestructiveToolName(step.tool)
  );

  const stepHighest = evaluatedSteps.reduce<ToolRisk>(
    (worst, step) => (compareRisk(step.effectiveRisk, worst) > 0 ? step.effectiveRisk : worst),
    'R0'
  );
  const overallRisk: ToolRisk =
    anyDestructive && compareRisk('R3', stepHighest) > 0 ? 'R3' : stepHighest;

  const confirmationKind: ConfirmationKind =
    overallRisk === 'R3' ? 'plan-id' : overallRisk === 'R2' ? 'word' : 'none';

  const isProd = (input.environment ?? '').trim().toLowerCase() === 'production';
  let stagingAdvice: string | null = null;
  if (overallRisk === 'R3') {
    stagingAdvice = isProd
      ? 'High-risk operation on a production site: test on a staging copy and verify recent backups before confirming.'
      : 'High-risk operation: review every step carefully and confirm the plan ID prefix before running.';
  } else if (overallRisk === 'R2' && isProd) {
    stagingAdvice =
      'This plan makes changes immediately visible to visitors on production. Preview the draft first if unsure.';
  }

  return {
    overallRisk,
    isWrite: compareRisk(overallRisk, 'R0') > 0,
    isPublicFacing: compareRisk(overallRisk, 'R1') > 0,
    isDestructive: anyDestructive || overallRisk === 'R3',
    confirmationKind,
    requiresConfirmation: confirmationKind !== 'none',
    stagingAdvice,
    steps: evaluatedSteps,
  };
}

export function verifyRiskConfirmation(input: {
  confirmationKind: ConfirmationKind;
  planId: string;
  provided?: string | null;
}): boolean {
  if (input.confirmationKind === 'none') return true;
  const trimmed = (input.provided ?? '').trim();
  if (!trimmed) return false;

  if (input.confirmationKind === 'word') {
    return trimmed.toUpperCase() === 'CONFIRM';
  }

  const prefix = input.planId.slice(0, 8);
  return prefix.length === 8 && trimmed.toUpperCase() === prefix.toUpperCase();
}
