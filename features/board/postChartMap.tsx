/**
 * 게시판 글 ID → 차트 컴포넌트 매핑.
 * 단일 소스로 유지보수·추가 시 인지 복잡도 감소.
 */

import React from 'react';
import { AgingPopulationCharts } from './AgingPopulationCharts';
import { SKHynixCharts } from './SKHynixCharts';
import { CloudThreeCharts } from './CloudThreeCharts';
import { NvidiaAmdCharts } from './NvidiaAmdCharts';
import { YieldSpreadCharts } from './YieldSpreadCharts';
import { InflationExpectationsChart } from './InflationExpectationsChart';
import { PrivateDebtToGdpCharts } from './PrivateDebtToGdpCharts';
import { AlphabetCharts } from './AlphabetCharts';
import { CarbonEmissionsChart } from './CarbonEmissionsChart';
import { OilProductionChart } from './OilProductionChart';
import { FedMbsChart } from './FedMbsChart';
import { VixChart } from './VixChart';
import { SofrChart } from './SofrChart';
import { HanwhaAerospaceChart } from './HanwhaAerospaceChart';
import { SamsungSdiCharts } from './SamsungSdiCharts';

export const POST_CHART_MAP: Record<string, React.FC> = {
  '5': CloudThreeCharts,
  '6': SKHynixCharts,
  '9': OilProductionChart,
  '12': NvidiaAmdCharts,
  '17': InflationExpectationsChart,
  '20': AlphabetCharts,
  '22': PrivateDebtToGdpCharts,
  '27': YieldSpreadCharts,
  '28': CarbonEmissionsChart,
  '30': AgingPopulationCharts,
  '31': FedMbsChart,
  '33': VixChart,
  '34': SofrChart,
  '35': HanwhaAerospaceChart,
  '36': SamsungSdiCharts,
};
