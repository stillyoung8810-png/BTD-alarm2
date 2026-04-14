import React from 'react';
import LaoerCreditBanner from '@/components/strategies/LaoerCreditBanner';
import VrBandStrategyForm from '@/components/strategies/VrBandStrategyForm';
import type { AppLang, Portfolio } from '@/types';
import { StrategyCreatorLayout } from './StrategyCreatorLayout';
import { MaBaseStepView, MaSectionsStepView } from './steps/MaWizardStepViews';
import {
  MultiSplitConfigStepView,
  NoStopMultiSplitConfigStepView,
  StrategyMetaStepView,
} from './steps/SingleStockStrategyStepViews';
import { StrategySelectionStepView } from './steps/StrategySelectionStepView';
import { useStrategyCreatorController } from './useStrategyCreatorController';

interface StrategyCreatorProps {
  lang: AppLang;
  onClose: () => void;
  onSave: (portfolio: Omit<Portfolio, 'id'>) => Promise<void> | void;
  canAccessPaidStocks?: boolean;
  maxPortfolios: number;
  currentPortfolioCount: number;
}

export default function StrategyCreator({
  lang,
  onClose,
  onSave,
  canAccessPaidStocks = false,
  maxPortfolios,
  currentPortfolioCount,
}: StrategyCreatorProps): React.ReactElement {
  const controller = useStrategyCreatorController({
    lang,
    onClose,
    onSave,
    canAccessPaidStocks,
    maxPortfolios,
    currentPortfolioCount,
  });

  const renderCurrentStep = (): React.ReactElement => {
    switch (controller.screen) {
      case 'strategy_select':
        return (
          <StrategySelectionStepView
            lang={lang}
            heading={controller.copy.strategySelection.heading}
            description={controller.copy.strategySelection.description}
            definitions={controller.strategyDefinitions}
            selectedStrategy={controller.selectedStrategy}
            onSelectStrategy={controller.handleSelectStrategy}
          />
        );
      case 'ma_base':
        return (
          <MaBaseStepView
            stockOptions={controller.stockOptions}
            stockPickerHeader={controller.copy.stockPickerHeader}
            dropdownInfoModalLabels={{
              badgeLabel: controller.noticeLabel,
              closeAriaLabel: controller.closeLabel,
              confirmLabel: controller.acknowledgeLabel,
              title: controller.noticeLabel,
              defaultMessage: controller.copy.lockedTickerTooltip,
            }}
            referenceStockLabel={controller.copy.ma.referenceStock}
            shortPeriodLabel={controller.copy.ma.shortPeriod}
            longPeriodLabel={controller.copy.ma.longPeriod}
            rsiEnabledLabel={controller.copy.ma.rsiEnabled}
            alignmentEnabledLabel={controller.copy.ma.alignmentEnabled}
            ma0Stock={controller.ma0Stock}
            maShortPeriod={controller.maShortPeriod}
            maLongPeriod={controller.maLongPeriod}
            isRsiEnabled={controller.isRsiEnabled}
            isAlignmentEnabled={controller.isAlignmentEnabled}
            onMa0StockChange={controller.handleMa0StockChange}
            onMaShortPeriodChange={controller.handleMaShortPeriodChange}
            onMaLongPeriodChange={controller.handleMaLongPeriodChange}
            onRsiEnabledChange={controller.handleRsiEnabledChange}
            onAlignmentEnabledChange={controller.handleAlignmentEnabledChange}
          />
        );
      case 'ma_sections':
        return (
          <MaSectionsStepView
            stockPickerHeader={controller.copy.stockPickerHeader}
            dropdownInfoModalLabels={{
              badgeLabel: controller.noticeLabel,
              closeAriaLabel: controller.closeLabel,
              confirmLabel: controller.acknowledgeLabel,
              title: controller.noticeLabel,
              defaultMessage: controller.copy.lockedTickerTooltip,
            }}
            section1Title={controller.copy.ma.section1Title}
            section2Title={controller.copy.ma.section2Title}
            section3Title={controller.copy.ma.section3Title}
            sectionStockLabel={controller.copy.ma.sectionStock}
            rsiThresholdLabel={controller.copy.ma.rsiThreshold}
            takePartialProfitLabel={controller.copy.ma.takePartialProfit}
            partialProfitTargetLabel={controller.copy.ma.partialProfitTargetPct}
            stockOptionsForMa1={controller.stockOptionsForMa1}
            stockOptionsForMa2={controller.stockOptionsForMa2}
            stockOptionsForMa3={controller.stockOptionsForMa3}
            ma1Stock={controller.ma1Stock}
            ma2Stock={controller.ma2Stock}
            ma3Stock={controller.ma3Stock}
            ma1RsiThreshold={controller.ma1RsiThreshold}
            ma2RsiThreshold={controller.ma2RsiThreshold}
            ma3RsiThreshold={controller.ma3RsiThreshold}
            isRsiEnabled={controller.isRsiEnabled}
            isMa1TakePartialProfit={controller.isMa1TakePartialProfit}
            isMa2TakePartialProfit={controller.isMa2TakePartialProfit}
            isMa3TakePartialProfit={controller.isMa3TakePartialProfit}
            ma1PartialProfitTargetPct={controller.ma1PartialProfitTargetPct}
            ma2PartialProfitTargetPct={controller.ma2PartialProfitTargetPct}
            ma3PartialProfitTargetPct={controller.ma3PartialProfitTargetPct}
            onMa1StockChange={controller.handleMa1StockChange}
            onMa2StockChange={controller.handleMa2StockChange}
            onMa3StockChange={controller.handleMa3StockChange}
            onMa1RsiThresholdChange={controller.handleMa1RsiThresholdChange}
            onMa2RsiThresholdChange={controller.handleMa2RsiThresholdChange}
            onMa3RsiThresholdChange={controller.handleMa3RsiThresholdChange}
            onMa1TakePartialProfitChange={
              controller.handleMa1TakePartialProfitChange
            }
            onMa2TakePartialProfitChange={
              controller.handleMa2TakePartialProfitChange
            }
            onMa3TakePartialProfitChange={
              controller.handleMa3TakePartialProfitChange
            }
            onMa1PartialProfitTargetPctChange={
              controller.handleMa1PartialProfitTargetPctChange
            }
            onMa2PartialProfitTargetPctChange={
              controller.handleMa2PartialProfitTargetPctChange
            }
            onMa3PartialProfitTargetPctChange={
              controller.handleMa3PartialProfitTargetPctChange
            }
          />
        );
      case 'multi_split_config':
        return (
          <MultiSplitConfigStepView
            stockPickerHeader={controller.copy.stockPickerHeader}
            dropdownInfoModalLabels={{
              badgeLabel: controller.noticeLabel,
              closeAriaLabel: controller.closeLabel,
              confirmLabel: controller.acknowledgeLabel,
              title: controller.noticeLabel,
              defaultMessage: controller.copy.lockedTickerTooltip,
            }}
            targetStockLabel={controller.copy.multiSplit.targetStock}
            targetReturnRateLabel={controller.copy.multiSplit.targetReturnRate}
            totalSplitCountLabel={controller.copy.multiSplit.totalSplitCount}
            highlightedHint={controller.copy.multiSplit.leveragedRecommended}
            stockOptions={controller.stockOptions}
            targetStock={controller.multiSplitTargetStock}
            targetReturnRate={controller.multiSplitTargetReturnRate}
            totalSplitCount={controller.multiSplitTotalSplitCount}
            onTargetStockChange={controller.handleMultiSplitTargetStockChange}
            onTargetReturnRateChange={controller.handleTargetReturnRateChange}
            onTotalSplitCountChange={controller.handleMultiSplitTotalCountChange}
          />
        );
      case 'no_stop_multi_split_config':
        return (
          <NoStopMultiSplitConfigStepView
            stockPickerHeader={controller.copy.stockPickerHeader}
            dropdownInfoModalLabels={{
              badgeLabel: controller.noticeLabel,
              closeAriaLabel: controller.closeLabel,
              confirmLabel: controller.acknowledgeLabel,
              title: controller.noticeLabel,
              defaultMessage: controller.copy.lockedTickerTooltip,
            }}
            targetStockLabel={controller.copy.noStopMultiSplit.targetStock}
            lowLocBudgetRatioLabel={
              controller.copy.noStopMultiSplit.lowLocBudgetRatio
            }
            highLocPremiumPctLabel={
              controller.copy.noStopMultiSplit.highLocPremiumPct
            }
            takeProfitPctLabel={controller.copy.noStopMultiSplit.takeProfitPct}
            totalSplitCountLabel={
              controller.copy.noStopMultiSplit.totalSplitCount
            }
            stockOptions={controller.stockOptions}
            targetStock={controller.noStopTargetStock}
            lowLocBudgetRatio={controller.noStopLowLocBudgetRatio}
            highLocPremiumPct={controller.noStopHighLocPremiumPct}
            takeProfitPct={controller.noStopTakeProfitPct}
            totalSplitCount={controller.noStopTotalSplitCount}
            onTargetStockChange={controller.handleNoStopTargetStockChange}
            onLowLocBudgetRatioChange={
              controller.handleNoStopLowLocBudgetRatioChange
            }
            onHighLocPremiumPctChange={
              controller.handleNoStopHighLocPremiumPctChange
            }
            onTakeProfitPctChange={controller.handleNoStopTakeProfitPctChange}
            onTotalSplitCountChange={
              controller.handleNoStopTotalSplitCountChange
            }
          />
        );
      case 'vr_band_config':
        return (
          <VrBandStrategyForm
            lang={lang}
            showErrors={controller.vrShowErrors}
            vrMode={controller.vrMode}
            onVrModeChange={controller.handleVrModeChange}
            vrInitialCapital={controller.vrInitialCapital}
            onVrInitialCapitalChange={controller.handleVrInitialCapitalChange}
            vrInitialV={controller.vrInitialV}
            onVrInitialVChange={controller.handleVrInitialVChange}
            vrMinOrderQty={controller.vrMinOrderQty}
            onVrMinOrderQtyChange={controller.handleVrMinOrderQtyChange}
            vrBandUpperPct={controller.vrBandUpperPct}
            onVrBandUpperPctChange={controller.handleVrBandUpperPctChange}
            vrBandLowerPct={controller.vrBandLowerPct}
            onVrBandLowerPctChange={controller.handleVrBandLowerPctChange}
            vrG={controller.vrG}
            onVrGChange={controller.handleVrGChange}
            vrPoolUsagePct={controller.vrPoolUsagePct}
            onVrPoolUsagePctChange={controller.handleVrPoolUsagePctChange}
            vrDeltaCash={controller.vrDeltaCash}
            onVrDeltaCashChange={controller.handleVrDeltaCashChange}
            vrCycleWeeks={controller.vrCycleWeeks}
            onVrCycleWeeksChange={controller.handleVrCycleWeeksChange}
          />
        );
      case 'strategy_meta':
        return (
          <StrategyMetaStepView
            metaLabels={controller.copy.meta}
            meta={controller.meta}
            isVrStrategy={controller.selectedStrategy === 'vr_band'}
            onNameChange={controller.handleNameChange}
            onDailyBuyAmountChange={controller.handleDailyBuyAmountChange}
            onStartDateChange={controller.handleStartDateChange}
            onFeeRatePercentChange={controller.handleFeeRatePercentChange}
          />
        );
      default: {
        const exhaustiveCheck: never = controller.screen;
        return exhaustiveCheck;
      }
    }
  };

  return (
    <>
      <StrategyCreatorLayout
        title={controller.title}
        closeAriaLabel={controller.closeLabel}
        cancelLabel={controller.copy.actions.cancel}
        backLabel={controller.copy.actions.back}
        primaryActionLabel={controller.primaryActionLabel}
        processingLabel={controller.processingLabel}
        errorMessage={controller.errorMessage}
        isSaving={controller.isSaving}
        isPrimaryDisabled={controller.isPrimaryDisabled}
        canGoBack={controller.canGoBack}
        onClose={controller.handleClose}
        onBack={controller.handleBack}
        onPrimaryAction={controller.handlePrimaryButtonClick}
      >
        {renderCurrentStep()}
        {controller.shouldShowLaoerCreditBanner && (
          <LaoerCreditBanner lang={lang} />
        )}
      </StrategyCreatorLayout>
    </>
  );
}