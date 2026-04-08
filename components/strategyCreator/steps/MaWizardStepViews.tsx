import React from 'react';
import CustomDropdown from '@/components/CustomDropdown';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  MaBaseStepViewProps,
  MaSectionsStepViewProps,
} from '../types/ui';

function ToggleField({
  label,
  isChecked,
  onChange,
}: {
  label: string;
  isChecked: boolean;
  onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
      <span className="text-sm font-black text-slate-900 dark:text-white">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!isChecked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${
          isChecked ? 'bg-blue-500' : 'bg-slate-500'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            isChecked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function PartialProfitField(props: {
  label: string;
  targetLabel: string;
  isEnabled: boolean;
  targetValue: number;
  onEnabledChange: (value: boolean) => void;
  onTargetValueChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/60">
      <ToggleField
        label={props.label}
        isChecked={props.isEnabled}
        onChange={props.onEnabledChange}
      />
      {props.isEnabled && (
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {props.targetLabel}
          </label>
          <input
            type="number"
            value={props.targetValue}
            onChange={(event) => props.onTargetValueChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>
      )}
    </div>
  );
}

function SectionCard(props: {
  title: string;
  stockPickerHeader: string;
  dropdownInfoModalLabels: MaSectionsStepViewProps['dropdownInfoModalLabels'];
  stockLabel: string;
  rsiThresholdLabel: string;
  takePartialProfitLabel: string;
  partialProfitTargetLabel: string;
  stockOptions: MaSectionsStepViewProps['stockOptionsForMa1'];
  stock: string;
  rsiThreshold: number;
  isRsiEnabled: boolean;
  isTakePartialProfit: boolean;
  partialProfitTargetPct: number;
  onStockChange: (value: string) => void;
  onRsiThresholdChange: (value: string) => void;
  onTakePartialProfitChange: (value: boolean) => void;
  onPartialProfitTargetPctChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="space-y-4">
        <h3 className="text-base font-black text-slate-900 dark:text-white">
          {props.title}
        </h3>
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {props.stockLabel}
          </label>
          <CustomDropdown
            value={props.stock}
            options={props.stockOptions}
            onChange={props.onStockChange}
            header={props.stockPickerHeader}
            infoModalBadgeLabel={props.dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={props.dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={props.dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={props.dropdownInfoModalLabels.title}
            infoModalDefaultMessage={props.dropdownInfoModalLabels.defaultMessage}
          />
        </div>

        {props.isRsiEnabled && (
          <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
            <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
              {props.rsiThresholdLabel}
            </label>
            <input
              type="number"
              value={props.rsiThreshold}
              onChange={(event) => props.onRsiThresholdChange(event.target.value)}
              className={STRATEGY_CREATOR_STYLES.textInput}
            />
          </div>
        )}

        <PartialProfitField
          label={props.takePartialProfitLabel}
          targetLabel={props.partialProfitTargetLabel}
          isEnabled={props.isTakePartialProfit}
          targetValue={props.partialProfitTargetPct}
          onEnabledChange={props.onTakePartialProfitChange}
          onTargetValueChange={props.onPartialProfitTargetPctChange}
        />
      </div>
    </div>
  );
}

export function MaBaseStepView({
  stockOptions,
  stockPickerHeader,
  dropdownInfoModalLabels,
  referenceStockLabel,
  shortPeriodLabel,
  longPeriodLabel,
  rsiEnabledLabel,
  alignmentEnabledLabel,
  ma0Stock,
  maShortPeriod,
  maLongPeriod,
  isRsiEnabled,
  isAlignmentEnabled,
  onMa0StockChange,
  onMaShortPeriodChange,
  onMaLongPeriodChange,
  onRsiEnabledChange,
  onAlignmentEnabledChange,
}: MaBaseStepViewProps): React.ReactElement {
  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {referenceStockLabel}
          </label>
          <CustomDropdown
            value={ma0Stock}
            options={stockOptions}
            onChange={onMa0StockChange}
            header={stockPickerHeader}
            infoModalBadgeLabel={dropdownInfoModalLabels.badgeLabel}
            infoModalCloseAriaLabel={dropdownInfoModalLabels.closeAriaLabel}
            infoModalConfirmLabel={dropdownInfoModalLabels.confirmLabel}
            infoModalTitle={dropdownInfoModalLabels.title}
            infoModalDefaultMessage={dropdownInfoModalLabels.defaultMessage}
          />
        </div>

        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {shortPeriodLabel}
          </label>
          <input
            type="number"
            value={maShortPeriod}
            onChange={(event) => onMaShortPeriodChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>

        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <label className={STRATEGY_CREATOR_STYLES.fieldLabel}>
            {longPeriodLabel}
          </label>
          <input
            type="number"
            value={maLongPeriod}
            onChange={(event) => onMaLongPeriodChange(event.target.value)}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ToggleField
          label={rsiEnabledLabel}
          isChecked={isRsiEnabled}
          onChange={onRsiEnabledChange}
        />
        <ToggleField
          label={alignmentEnabledLabel}
          isChecked={isAlignmentEnabled}
          onChange={onAlignmentEnabledChange}
        />
      </div>
    </div>
  );
}

export function MaSectionsStepView(
  props: MaSectionsStepViewProps,
): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <SectionCard
        title={props.section1Title}
        stockPickerHeader={props.stockPickerHeader}
        dropdownInfoModalLabels={props.dropdownInfoModalLabels}
        stockLabel={props.sectionStockLabel}
        rsiThresholdLabel={props.rsiThresholdLabel}
        takePartialProfitLabel={props.takePartialProfitLabel}
        partialProfitTargetLabel={props.partialProfitTargetLabel}
        stockOptions={props.stockOptionsForMa1}
        stock={props.ma1Stock}
        rsiThreshold={props.ma1RsiThreshold}
        isRsiEnabled={props.isRsiEnabled}
        isTakePartialProfit={props.isMa1TakePartialProfit}
        partialProfitTargetPct={props.ma1PartialProfitTargetPct}
        onStockChange={props.onMa1StockChange}
        onRsiThresholdChange={props.onMa1RsiThresholdChange}
        onTakePartialProfitChange={props.onMa1TakePartialProfitChange}
        onPartialProfitTargetPctChange={props.onMa1PartialProfitTargetPctChange}
      />
      <SectionCard
        title={props.section2Title}
        stockPickerHeader={props.stockPickerHeader}
        dropdownInfoModalLabels={props.dropdownInfoModalLabels}
        stockLabel={props.sectionStockLabel}
        rsiThresholdLabel={props.rsiThresholdLabel}
        takePartialProfitLabel={props.takePartialProfitLabel}
        partialProfitTargetLabel={props.partialProfitTargetLabel}
        stockOptions={props.stockOptionsForMa2}
        stock={props.ma2Stock}
        rsiThreshold={props.ma2RsiThreshold}
        isRsiEnabled={props.isRsiEnabled}
        isTakePartialProfit={props.isMa2TakePartialProfit}
        partialProfitTargetPct={props.ma2PartialProfitTargetPct}
        onStockChange={props.onMa2StockChange}
        onRsiThresholdChange={props.onMa2RsiThresholdChange}
        onTakePartialProfitChange={props.onMa2TakePartialProfitChange}
        onPartialProfitTargetPctChange={props.onMa2PartialProfitTargetPctChange}
      />
      <SectionCard
        title={props.section3Title}
        stockPickerHeader={props.stockPickerHeader}
        dropdownInfoModalLabels={props.dropdownInfoModalLabels}
        stockLabel={props.sectionStockLabel}
        rsiThresholdLabel={props.rsiThresholdLabel}
        takePartialProfitLabel={props.takePartialProfitLabel}
        partialProfitTargetLabel={props.partialProfitTargetLabel}
        stockOptions={props.stockOptionsForMa3}
        stock={props.ma3Stock}
        rsiThreshold={props.ma3RsiThreshold}
        isRsiEnabled={props.isRsiEnabled}
        isTakePartialProfit={props.isMa3TakePartialProfit}
        partialProfitTargetPct={props.ma3PartialProfitTargetPct}
        onStockChange={props.onMa3StockChange}
        onRsiThresholdChange={props.onMa3RsiThresholdChange}
        onTakePartialProfitChange={props.onMa3TakePartialProfitChange}
        onPartialProfitTargetPctChange={props.onMa3PartialProfitTargetPctChange}
      />
    </div>
  );
}