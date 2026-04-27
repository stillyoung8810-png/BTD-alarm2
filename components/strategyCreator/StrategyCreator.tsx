import React from 'react';
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
            referenceStockHelper={controller.copy.ma.referenceStockHelper}
            shortPeriodLabel={controller.copy.ma.shortPeriod}
            longPeriodLabel={controller.copy.ma.longPeriod}
            rsiEnabledLabel={controller.copy.ma.rsiEnabled}
            rsiEnabledHelper={controller.copy.ma.rsiEnabledHelper}
            alignmentEnabledLabel={controller.copy.ma.alignmentEnabled}
            alignmentEnabledHelper={controller.copy.ma.alignmentEnabledHelper}
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
            section1Helper={controller.copy.ma.section1Helper}
            section2Title={controller.copy.ma.section2Title}
            section2Helper={controller.copy.ma.section2Helper}
            section3Title={controller.copy.ma.section3Title}
            section3Helper={controller.copy.ma.section3Helper}
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
            intermediateReturnRateLabel={
              controller.copy.multiSplit.intermediateReturnRate
            }
            totalSplitCountLabel={controller.copy.multiSplit.totalSplitCount}
            baseLocRatioLabel={controller.copy.multiSplit.baseLocRatio}
            mainTakeProfitRatioPctLabel={
              controller.copy.multiSplit.mainTakeProfitRatioPct
            }
            intermediateTakeProfitRatioPctLabel={
              controller.copy.multiSplit.intermediateTakeProfitRatioPct
            }
            riskCutRatioPctLabel={controller.copy.multiSplit.riskCutRatioPct}
            riskCutRatioPctHelper={
              controller.copy.multiSplit.riskCutRatioPctHelper
            }
            rsiConditionLabel={controller.copy.multiSplit.rsiConditionLabel}
            rsiConditionHelper={controller.copy.multiSplit.rsiConditionHelper}
            alignmentConditionLabel={
              controller.copy.multiSplit.alignmentConditionLabel
            }
            alignmentConditionHelper={
              controller.copy.multiSplit.alignmentConditionHelper
            }
            criterionGroupLabel={controller.copy.multiSplit.criterionGroupLabel}
            budgetGroupLabel={controller.copy.multiSplit.budgetGroupLabel}
            highlightedHint={controller.copy.multiSplit.leveragedRecommended}
            rsiCriterionOptions={controller.multiSplitRsiCriterionOptions}
            alignmentCriterionOptions={
              controller.multiSplitAlignmentCriterionOptions
            }
            budgetOptions={controller.multiSplitBudgetOptions}
            stockOptions={controller.stockOptions}
            targetStock={controller.multiSplitTargetStock}
            targetReturnRate={controller.multiSplitTargetReturnRate}
            intermediateReturnRate={
              controller.multiSplitIntermediateReturnRate
            }
            totalSplitCount={controller.multiSplitTotalSplitCount}
            baseLocRatio={controller.multiSplitBaseLocRatio}
            mainTakeProfitRatioPct={controller.multiSplitMainTakeProfitRatioPct}
            intermediateTakeProfitRatioPct={
              controller.multiSplitIntermediateTakeProfitRatioPct
            }
            riskCutRatioPct={controller.multiSplitRiskCutRatioPct}
            isRsiConditionEnabled={controller.isMultiSplitRsiConditionEnabled}
            selectedRsiCriterionPreset={
              controller.selectedMultiSplitRsiCriterionPreset
            }
            selectedRsiBudgetPreset={controller.selectedMultiSplitRsiBudgetPreset}
            isAlignmentConditionEnabled={
              controller.isMultiSplitAlignmentConditionEnabled
            }
            selectedAlignmentCriterionPreset={
              controller.selectedMultiSplitAlignmentCriterionPreset
            }
            selectedAlignmentBudgetPreset={
              controller.selectedMultiSplitAlignmentBudgetPreset
            }
            onTargetStockChange={controller.handleMultiSplitTargetStockChange}
            onTargetReturnRateChange={controller.handleTargetReturnRateChange}
            onIntermediateReturnRateChange={
              controller.handleMultiSplitIntermediateReturnRateChange
            }
            onTotalSplitCountChange={controller.handleMultiSplitTotalCountChange}
            onBaseLocRatioChange={controller.handleMultiSplitBaseLocRatioChange}
            onMainTakeProfitRatioPctChange={
              controller.handleMultiSplitMainTakeProfitRatioPctChange
            }
            onRiskCutRatioPctChange={controller.handleMultiSplitRiskCutRatioPctChange}
            onRsiConditionEnabledChange={
              controller.handleMultiSplitRsiConditionEnabledChange
            }
            onRsiCriterionPresetChange={
              controller.handleMultiSplitRsiCriterionPresetChange
            }
            onRsiBudgetPresetChange={
              controller.handleMultiSplitRsiBudgetPresetChange
            }
            onAlignmentConditionEnabledChange={
              controller.handleMultiSplitAlignmentConditionEnabledChange
            }
            onAlignmentCriterionPresetChange={
              controller.handleMultiSplitAlignmentCriterionPresetChange
            }
            onAlignmentBudgetPresetChange={
              controller.handleMultiSplitAlignmentBudgetPresetChange
            }
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
            baseLocRatioLabel={controller.copy.noStopMultiSplit.baseLocRatio}
            takeProfitPctLabel={controller.copy.noStopMultiSplit.takeProfitPct}
            totalSplitCountLabel={
              controller.copy.noStopMultiSplit.totalSplitCount
            }
            rsiConditionLabel={
              controller.copy.noStopMultiSplit.rsiConditionLabel
            }
            rsiConditionHelper={
              controller.copy.noStopMultiSplit.rsiConditionHelper
            }
            alignmentConditionLabel={
              controller.copy.noStopMultiSplit.alignmentConditionLabel
            }
            alignmentConditionHelper={
              controller.copy.noStopMultiSplit.alignmentConditionHelper
            }
            criterionGroupLabel={
              controller.copy.noStopMultiSplit.criterionGroupLabel
            }
            budgetGroupLabel={controller.copy.noStopMultiSplit.budgetGroupLabel}
            rsiCriterionOptions={controller.noStopRsiCriterionOptions}
            alignmentCriterionOptions={
              controller.noStopAlignmentCriterionOptions
            }
            budgetOptions={controller.noStopBudgetOptions}
            stockOptions={controller.stockOptions}
            targetStock={controller.noStopTargetStock}
            baseLocRatio={controller.noStopBaseLocRatio}
            takeProfitPct={controller.noStopTakeProfitPct}
            totalSplitCount={controller.noStopTotalSplitCount}
            isRsiConditionEnabled={controller.isNoStopRsiConditionEnabled}
            selectedRsiCriterionPreset={
              controller.selectedNoStopRsiCriterionPreset
            }
            selectedRsiBudgetPreset={controller.selectedNoStopRsiBudgetPreset}
            isAlignmentConditionEnabled={
              controller.isNoStopAlignmentConditionEnabled
            }
            selectedAlignmentCriterionPreset={
              controller.selectedNoStopAlignmentCriterionPreset
            }
            selectedAlignmentBudgetPreset={
              controller.selectedNoStopAlignmentBudgetPreset
            }
            onTargetStockChange={controller.handleNoStopTargetStockChange}
            onBaseLocRatioChange={controller.handleNoStopBaseLocRatioChange}
            onTakeProfitPctChange={controller.handleNoStopTakeProfitPctChange}
            onTotalSplitCountChange={
              controller.handleNoStopTotalSplitCountChange
            }
            onRsiConditionEnabledChange={
              controller.handleNoStopRsiConditionEnabledChange
            }
            onRsiCriterionPresetChange={
              controller.handleNoStopRsiCriterionPresetChange
            }
            onRsiBudgetPresetChange={
              controller.handleNoStopRsiBudgetPresetChange
            }
            onAlignmentConditionEnabledChange={
              controller.handleNoStopAlignmentConditionEnabledChange
            }
            onAlignmentCriterionPresetChange={
              controller.handleNoStopAlignmentCriterionPresetChange
            }
            onAlignmentBudgetPresetChange={
              controller.handleNoStopAlignmentBudgetPresetChange
            }
          />
        );
      case 'vr_band_config':
        return (
          <VrBandStrategyForm
            lang={lang}
            showErrors={controller.vrShowErrors}
            initialTHelper={controller.copy.vrBand.initialTHelper}
            baseGrowthRatePctHelper={
              controller.copy.vrBand.baseGrowthRatePctHelper
            }
            poolUsagePctHelper={controller.copy.vrBand.poolUsagePctHelper}
            smartBrakeThresholdPctHelper={
              controller.copy.vrBand.smartBrakeThresholdPctHelper
            }
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
            vrBaseGrowthRatePct={controller.vrBaseGrowthRatePct}
            onVrBaseGrowthRatePctChange={
              controller.handleVrBaseGrowthRatePctChange
            }
            vrSmartBrakeThresholdPct={controller.vrSmartBrakeThresholdPct}
            onVrSmartBrakeThresholdPctChange={
              controller.handleVrSmartBrakeThresholdPctChange
            }
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
      </StrategyCreatorLayout>
    </>
  );
}