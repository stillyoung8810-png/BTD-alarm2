import React from 'react';
import { DraftNumberInput } from '@/components/common/DraftNumberInput';
import CustomDropdown from '@/components/CustomDropdown';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  MultiSplitConfigStepViewProps,
  NoStopMultiSplitConfigStepViewProps,
  StrategyMetaStepViewProps,
} from '../types/ui';

function LabeledNumberField(props: {
  label: string;
  value: number;
  onCommit: (value: string) => number;
  allowDecimal?: boolean;
}): React.ReactElement {
  const inputId = React.useId();

  return (
    <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
      <label htmlFor={inputId} className={STRATEGY_CREATOR_STYLES.fieldLabel}>
        {props.label}
      </label>
      <DraftNumberInput
        id={inputId}
        value={props.value}
        onCommit={props.onCommit}
        allowDecimal={props.allowDecimal}
        className={STRATEGY_CREATOR_STYLES.textInput}
      />
    </div>
  );
}

export function MultiSplitConfigStepView({
  stockPickerHeader,
  dropdownInfoModalLabels,
  targetStockLabel,
  targetReturnRateLabel,
  totalSplitCountLabel,
  highlightedHint,
  stockOptions,
  targetStock,
  targetReturnRate,
  totalSplitCount,
  onTargetStockChange,
  onTargetReturnRateChange,
  onTotalSplitCountChange,
}: MultiSplitConfigStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="space-y-6">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {targetStockLabel}
          </label>
          <CustomDropdown
            value={targetStock}
            options={stockOptions}
            onChange={onTargetStockChange}
            header={stockPickerHeader}
            infoModalBadgeLabel={dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={dropdownInfoModalLabels.title}
            infoModalDefaultMessage={dropdownInfoModalLabels.defaultMessage}
          />
          <p className={STRATEGY_CREATOR_STYLES.helperText}>{highlightedHint}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <LabeledNumberField
            label={targetReturnRateLabel}
            value={targetReturnRate}
            onCommit={onTargetReturnRateChange}
          />
          <LabeledNumberField
            label={totalSplitCountLabel}
            value={totalSplitCount}
            onCommit={onTotalSplitCountChange}
          />
        </div>
      </div>
    </div>
  );
}

export function NoStopMultiSplitConfigStepView({
  stockPickerHeader,
  dropdownInfoModalLabels,
  targetStockLabel,
  lowLocBudgetRatioLabel,
  highLocPremiumPctLabel,
  takeProfitPctLabel,
  totalSplitCountLabel,
  stockOptions,
  targetStock,
  lowLocBudgetRatio,
  highLocPremiumPct,
  takeProfitPct,
  totalSplitCount,
  onTargetStockChange,
  onLowLocBudgetRatioChange,
  onHighLocPremiumPctChange,
  onTakeProfitPctChange,
  onTotalSplitCountChange,
}: NoStopMultiSplitConfigStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="space-y-6">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {targetStockLabel}
          </label>
          <CustomDropdown
            value={targetStock}
            options={stockOptions}
            onChange={onTargetStockChange}
            header={stockPickerHeader}
            infoModalBadgeLabel={dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={dropdownInfoModalLabels.title}
            infoModalDefaultMessage={dropdownInfoModalLabels.defaultMessage}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <LabeledNumberField
            label={lowLocBudgetRatioLabel}
            value={lowLocBudgetRatio}
            onCommit={onLowLocBudgetRatioChange}
          />
          <LabeledNumberField
            label={highLocPremiumPctLabel}
            value={highLocPremiumPct}
            onCommit={onHighLocPremiumPctChange}
          />
          <LabeledNumberField
            label={takeProfitPctLabel}
            value={takeProfitPct}
            onCommit={onTakeProfitPctChange}
          />
          <LabeledNumberField
            label={totalSplitCountLabel}
            value={totalSplitCount}
            onCommit={onTotalSplitCountChange}
          />
        </div>
      </div>
    </div>
  );
}

export function StrategyMetaStepView({
  metaLabels,
  meta,
  isVrStrategy,
  onNameChange,
  onDailyBuyAmountChange,
  onStartDateChange,
  onFeeRatePercentChange,
}: StrategyMetaStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {metaLabels.portfolioName}
          </label>
          <input
            type="text"
            value={meta.name ?? ''}
            onChange={(event) => onNameChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>

        {!isVrStrategy && (
          <LabeledNumberField
            label={metaLabels.dailyBuyAmount}
            value={
              typeof meta.dailyBuyAmount === 'number' ? meta.dailyBuyAmount : 0
            }
            onCommit={onDailyBuyAmountChange}
          />
        )}

        <div
          className={`${STRATEGY_CREATOR_STYLES.fieldStack} min-w-0`}
        >
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {metaLabels.startDate}
          </label>
          <input
            type="date"
            value={meta.startDate ?? ''}
            onChange={(event) => onStartDateChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>

        <LabeledNumberField
          label={metaLabels.feeRatePercent}
          value={typeof meta.feeRatePercent === 'number' ? meta.feeRatePercent : 0}
          onCommit={onFeeRatePercentChange}
          allowDecimal
        />
      </div>
    </div>
  );
}