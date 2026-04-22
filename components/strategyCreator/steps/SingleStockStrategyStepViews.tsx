import React from 'react';
import { DraftNumberInput } from '@/components/common/DraftNumberInput';
import CustomDropdown from '@/components/CustomDropdown';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  MultiSplitConfigStepViewProps,
  NoStopMultiSplitConfigStepViewProps,
  PresetChipOption,
  StrategyMetaStepViewProps,
} from '../types/ui';

const MICROCOPY_TEXT_CLASS_NAME =
  'mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400';

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

function ReadOnlyValueField(props: {
  label: string;
  value: number;
}): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
      <span className={STRATEGY_CREATOR_STYLES.fieldLabel}>{props.label}</span>
      <div className="rounded-3xl border border-slate-200 bg-slate-100/50 px-5 py-4 text-base font-black text-slate-900 dark:border-white/10 dark:bg-slate-900/70 dark:text-white">
        {props.value}
      </div>
    </div>
  );
}

function LabeledSliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: string) => number;
}): React.ReactElement {
  const inputId = React.useId();

  return (
    <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className={STRATEGY_CREATOR_STYLES.fieldLabel}>
          {props.label}
        </label>
        <span className="text-sm font-black text-slate-900 dark:text-white">
          {props.value}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={props.min}
        max={props.max}
        step={1}
        value={props.value}
        onChange={(event) => {
          props.onCommit(event.target.value);
        }}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600 dark:bg-slate-800 dark:accent-blue-400"
      />
    </div>
  );
}

function ToggleCard(props: {
  label: string;
  helperText: string;
  isEnabled: boolean;
  onToggle: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
      <div className="pr-4">
        <span className="text-sm font-black text-slate-900 dark:text-white">
          {props.label}
        </span>
        <p className={MICROCOPY_TEXT_CLASS_NAME}>{props.helperText}</p>
      </div>
      <button
        type="button"
        aria-pressed={props.isEnabled}
        onClick={() => props.onToggle(!props.isEnabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all ${
          props.isEnabled ? 'bg-blue-500' : 'bg-slate-500'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            props.isEnabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function PresetChipGroup<TId extends string>(props: {
  label: string;
  options: readonly PresetChipOption<TId>[];
  selectedId: TId;
  onSelect: (value: TId) => void;
}): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
      <span className={STRATEGY_CREATOR_STYLES.fieldLabel}>{props.label}</span>
      <div className="flex flex-wrap gap-3">
        {props.options.map((option) => {
          const isSelected = option.id === props.selectedId;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => props.onSelect(option.id)}
              className={`rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
                isSelected
                  ? 'border-blue-500 bg-blue-500 text-white shadow-[0_8px_24px_rgba(59,130,246,0.25)]'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-blue-400'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConditionalPresetSection<TCriterionId extends string, TBudgetId extends string>(
  props: {
  title: string;
  helperText: string;
  isEnabled: boolean;
  onEnabledChange: (value: boolean) => void;
  criterionLabel: string;
  budgetLabel: string;
  criterionOptions: readonly PresetChipOption<TCriterionId>[];
  selectedCriterionId: TCriterionId;
  onCriterionChange: (value: TCriterionId) => void;
  budgetOptions: readonly PresetChipOption<TBudgetId>[];
  selectedBudgetId: TBudgetId;
  onBudgetChange: (value: TBudgetId) => void;
}): React.ReactElement {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/60">
      <ToggleCard
        label={props.title}
        helperText={props.helperText}
        isEnabled={props.isEnabled}
        onToggle={props.onEnabledChange}
      />
      {props.isEnabled ? (
        <div className="space-y-4">
          <PresetChipGroup
            label={props.criterionLabel}
            options={props.criterionOptions}
            selectedId={props.selectedCriterionId}
            onSelect={props.onCriterionChange}
          />
          <PresetChipGroup
            label={props.budgetLabel}
            options={props.budgetOptions}
            selectedId={props.selectedBudgetId}
            onSelect={props.onBudgetChange}
          />
        </div>
      ) : null}
    </div>
  );
}

export function MultiSplitConfigStepView({
  stockPickerHeader,
  dropdownInfoModalLabels,
  targetStockLabel,
  targetReturnRateLabel,
  totalSplitCountLabel,
  baseLocRatioLabel,
  mainTakeProfitRatioPctLabel,
  intermediateTakeProfitRatioPctLabel,
  riskCutRatioPctLabel,
  rsiConditionLabel,
  rsiConditionHelper,
  alignmentConditionLabel,
  alignmentConditionHelper,
  criterionGroupLabel,
  budgetGroupLabel,
  highlightedHint,
  rsiCriterionOptions,
  alignmentCriterionOptions,
  budgetOptions,
  stockOptions,
  targetStock,
  targetReturnRate,
  totalSplitCount,
  baseLocRatio,
  mainTakeProfitRatioPct,
  intermediateTakeProfitRatioPct,
  riskCutRatioPct,
  isRsiConditionEnabled,
  selectedRsiCriterionPreset,
  selectedRsiBudgetPreset,
  isAlignmentConditionEnabled,
  selectedAlignmentCriterionPreset,
  selectedAlignmentBudgetPreset,
  onTargetStockChange,
  onTargetReturnRateChange,
  onTotalSplitCountChange,
  onBaseLocRatioChange,
  onMainTakeProfitRatioPctChange,
  onRiskCutRatioPctChange,
  onRsiConditionEnabledChange,
  onRsiCriterionPresetChange,
  onRsiBudgetPresetChange,
  onAlignmentConditionEnabledChange,
  onAlignmentCriterionPresetChange,
  onAlignmentBudgetPresetChange,
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
          <LabeledNumberField
            label={baseLocRatioLabel}
            value={baseLocRatio}
            onCommit={onBaseLocRatioChange}
          />
          <LabeledNumberField
            label={riskCutRatioPctLabel}
            value={riskCutRatioPct}
            onCommit={onRiskCutRatioPctChange}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <LabeledSliderField
            label={mainTakeProfitRatioPctLabel}
            value={mainTakeProfitRatioPct}
            min={1}
            max={100}
            onCommit={onMainTakeProfitRatioPctChange}
          />
          <ReadOnlyValueField
            label={intermediateTakeProfitRatioPctLabel}
            value={intermediateTakeProfitRatioPct}
          />
        </div>

        <div className="space-y-4">
          <ConditionalPresetSection
            title={rsiConditionLabel}
            helperText={rsiConditionHelper}
            isEnabled={isRsiConditionEnabled}
            onEnabledChange={onRsiConditionEnabledChange}
            criterionLabel={criterionGroupLabel}
            budgetLabel={budgetGroupLabel}
            criterionOptions={rsiCriterionOptions}
            selectedCriterionId={selectedRsiCriterionPreset}
            onCriterionChange={onRsiCriterionPresetChange}
            budgetOptions={budgetOptions}
            selectedBudgetId={selectedRsiBudgetPreset}
            onBudgetChange={onRsiBudgetPresetChange}
          />
          <ConditionalPresetSection
            title={alignmentConditionLabel}
            helperText={alignmentConditionHelper}
            isEnabled={isAlignmentConditionEnabled}
            onEnabledChange={onAlignmentConditionEnabledChange}
            criterionLabel={criterionGroupLabel}
            budgetLabel={budgetGroupLabel}
            criterionOptions={alignmentCriterionOptions}
            selectedCriterionId={selectedAlignmentCriterionPreset}
            onCriterionChange={onAlignmentCriterionPresetChange}
            budgetOptions={budgetOptions}
            selectedBudgetId={selectedAlignmentBudgetPreset}
            onBudgetChange={onAlignmentBudgetPresetChange}
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
  baseLocRatioLabel,
  takeProfitPctLabel,
  totalSplitCountLabel,
  rsiConditionLabel,
  rsiConditionHelper,
  alignmentConditionLabel,
  alignmentConditionHelper,
  criterionGroupLabel,
  budgetGroupLabel,
  rsiCriterionOptions,
  alignmentCriterionOptions,
  budgetOptions,
  stockOptions,
  targetStock,
  baseLocRatio,
  takeProfitPct,
  totalSplitCount,
  isRsiConditionEnabled,
  selectedRsiCriterionPreset,
  selectedRsiBudgetPreset,
  isAlignmentConditionEnabled,
  selectedAlignmentCriterionPreset,
  selectedAlignmentBudgetPreset,
  onTargetStockChange,
  onBaseLocRatioChange,
  onTakeProfitPctChange,
  onTotalSplitCountChange,
  onRsiConditionEnabledChange,
  onRsiCriterionPresetChange,
  onRsiBudgetPresetChange,
  onAlignmentConditionEnabledChange,
  onAlignmentCriterionPresetChange,
  onAlignmentBudgetPresetChange,
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
            label={baseLocRatioLabel}
            value={baseLocRatio}
            onCommit={onBaseLocRatioChange}
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

        <div className="space-y-4">
          <ConditionalPresetSection
            title={rsiConditionLabel}
            helperText={rsiConditionHelper}
            isEnabled={isRsiConditionEnabled}
            onEnabledChange={onRsiConditionEnabledChange}
            criterionLabel={criterionGroupLabel}
            budgetLabel={budgetGroupLabel}
            criterionOptions={rsiCriterionOptions}
            selectedCriterionId={selectedRsiCriterionPreset}
            onCriterionChange={onRsiCriterionPresetChange}
            budgetOptions={budgetOptions}
            selectedBudgetId={selectedRsiBudgetPreset}
            onBudgetChange={onRsiBudgetPresetChange}
          />
          <ConditionalPresetSection
            title={alignmentConditionLabel}
            helperText={alignmentConditionHelper}
            isEnabled={isAlignmentConditionEnabled}
            onEnabledChange={onAlignmentConditionEnabledChange}
            criterionLabel={criterionGroupLabel}
            budgetLabel={budgetGroupLabel}
            criterionOptions={alignmentCriterionOptions}
            selectedCriterionId={selectedAlignmentCriterionPreset}
            onCriterionChange={onAlignmentCriterionPresetChange}
            budgetOptions={budgetOptions}
            selectedBudgetId={selectedAlignmentBudgetPreset}
            onBudgetChange={onAlignmentBudgetPresetChange}
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