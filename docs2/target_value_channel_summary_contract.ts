import type { AppLang } from '../types';

export type SummaryRowId =
  | 'initialTargetValue'
  | 'initialAvailableCash'
  | 'baseGrowthRate'
  | 'smartBrakeThreshold'
  | 'safetyMode'
  | 'normalMode';

export type SummaryFormulaId = 'safetyMode' | 'normalMode';

export interface StrategyCreatorSummaryRowViewModel {
  id: SummaryRowId;
  value?: string;
  formulaId?: SummaryFormulaId;
}

export interface StrategyCreatorSummaryViewModel {
  initialCapitalDisplay: string;
  initialAllocationPct: number;
  rows: StrategyCreatorSummaryRowViewModel[];
}
