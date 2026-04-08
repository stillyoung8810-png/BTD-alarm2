
import React from 'react';
import type { AlarmConfig, Portfolio } from '../types';
import { AlarmModalView } from './alarm/AlarmModalView';
import { useAlarmModalController } from './alarm/useAlarmModalController';

interface AlarmModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onSave: (config: AlarmConfig) => Promise<void> | void;
  maxAlarms: number;
}

const AlarmModal: React.FC<AlarmModalProps> = ({
  lang,
  portfolio,
  onClose,
  onSave,
  maxAlarms,
}) => {
  const controller = useAlarmModalController({
    lang,
    portfolio,
    maxAlarms,
    onSave,
  });

  return (
    <AlarmModalView
      lang={lang}
      maxAlarms={maxAlarms}
      onClose={onClose}
      controller={controller}
    />
  );
};

export default AlarmModal;