// packages/core/src/analytics/index.ts
// Analytics module barrel export.

export { detectCostSpike, detectAnomaliesInTrend } from './anomaly.js';
export type { CostSpikeResult, CostTrendAnomaly } from './anomaly.js';

export { sanitizeExport, exportToCsv, exportToJson } from './export.js';
export type { ExportOptions } from './export.js';

export { generateExecutiveSummary, buildSummaryFromInput } from './summary.js';
export type { ExecutiveSummary, SummaryInput } from './summary.js';

export { transcribeAudio, isVoiceAvailable, VoiceDependencyUnavailableError } from './voice.js';
export type { TranscribeResult } from './voice.js';