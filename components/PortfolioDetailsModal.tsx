
import React from 'react';
import type { Portfolio } from '../types';
import { PortfolioDetailsView } from './portfolioDetails/PortfolioDetailsView';
import { usePortfolioDetailsController } from './portfolioDetails/usePortfolioDetailsController';

interface PortfolioDetailsModalProps {
  lang: 'ko' | 'en';
  portfolio: Portfolio;
  onClose: () => void;
  onDeleteTrade: (tradeId: string) => Promise<void> | void;
  isHistory?: boolean;
}

const PortfolioDetailsModal: React.FC<PortfolioDetailsModalProps> = ({
  lang,
  portfolio,
  onClose,
  onDeleteTrade,
  isHistory,
}) => {
  const controller = usePortfolioDetailsController({
    lang,
    portfolio,
    isHistory,
    onDeleteTrade,
  });

  return (
    <PortfolioDetailsView
      portfolioName={portfolio.name}
      controller={controller}
      onClose={onClose}
    />
  );
};

export default PortfolioDetailsModal;