'use client';

import React from 'react';
import type { AppLang, VrBandStrategyParams } from '../types';
import { VR_BADGE_CONFIG } from '../constants/vrMessages';

export type VrMode = VrBandStrategyParams['vrMode'];

export interface VrBadgeProps {
  mode: VrMode;
  lang: AppLang;
}

export default function VrBadge({ mode, lang }: VrBadgeProps) {
  const config = VR_BADGE_CONFIG[mode];
  const label = lang === 'ko' ? config.textKo : config.textEn;
  return <span className={config.classes}>{label}</span>;
}
