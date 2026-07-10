export type ReviewStatus = 'pass' | 'fail' | 'needs-changes';

export interface ReviewParams {
  featureId: string;
  prompt: string;
  changedFiles: string[];
  commandsRun?: string[];
  metadata?: Record<string, unknown>;
}

export interface ReviewFinding {
  severity: 'info' | 'warning' | 'error';
  message: string;
  file?: string;
  line?: number;
  ruleId?: string;
}

export interface SandboxApproval {
  approved: boolean;
  reason: string;
  requiredCommands?: string[];
}

export interface McpScore {
  score: number;
  maxScore: number;
  normalized: number;
}

export interface RawPlanStep {
  id: string;
  text: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export interface RawPlan {
  steps: RawPlanStep[];
  notes?: string;
}

export interface ReviewResult {
  status: ReviewStatus;
  summary: string;
  findings: ReviewFinding[];
  confidenceScore: number;
  sandboxApproval: SandboxApproval;
  mcpScore: McpScore;
  rawPlan?: RawPlan;
  rawOutput?: string;
  metadata?: Record<string, unknown>;
}

export interface IVerifier {
  readonly id: string;
  review(params: ReviewParams): Promise<ReviewResult>;
}
