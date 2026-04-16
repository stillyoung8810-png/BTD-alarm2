import React from 'react';
import { DraftNumberInput } from '@/components/common/DraftNumberInput';
import CustomDropdown from '@/components/CustomDropdown';
import { STRATEGY_CREATOR_STYLES } from '../styles';
import type {
  MaBaseStepViewProps,
  MaSectionsStepViewProps,
} from '../types/ui';

const MICROCOPY_TEXT_CLASS_NAME =
  'mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400';

function FieldHeader({
  id,
  label,
  helperText,
}: {
  id?: string;
  label: string;
  helperText?: string;
}): React.ReactElement {
  return (
    <div>
      {id ? (
        <label htmlFor={id} className={STRATEGY_CREATOR_STYLES.fieldLabel}>
          {label}
        </label>
      ) : (
        <span className={STRATEGY_CREATOR_STYLES.fieldLabel}>{label}</span>
      )}
      {helperText ? (
        <p className={MICROCOPY_TEXT_CLASS_NAME}>{helperText}</p>
      ) : null}
    </div>
  );
}

function ToggleField({
  label,
  helperText,
  isChecked,
  onChange,
}: {
  label: string;
  helperText?: string;
  isChecked: boolean;
  onChange: (value: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-900/70">
      <div className="pr-4">
        <span className="text-sm font-black text-slate-900 dark:text-white">
          {label}
        </span>
        {helperText ? (
          <p className={MICROCOPY_TEXT_CLASS_NAME}>{helperText}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onChange(!isChecked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-all ${
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
  idPrefix: string;
  label: string;
  targetLabel: string;
  isEnabled: boolean;
  targetValue: number;
  onEnabledChange: (value: boolean) => void;
  onTargetValueChange: (value: string) => number;
}): React.ReactElement {
  const inputId = `${props.idPrefix}-partial-profit-target`;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/60">
      <ToggleField
        label={props.label}
        helperText={undefined}
        isChecked={props.isEnabled}
        onChange={props.onEnabledChange}
      />
      {props.isEnabled && (
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <FieldHeader id={inputId} label={props.targetLabel} />
          <DraftNumberInput
            id={inputId}
            value={props.targetValue}
            onCommit={props.onTargetValueChange}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>
      )}
    </div>
  );
}

function SectionCard(props: {
  sectionId: string;
  title: string;
  titleHelper: string;
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
  onRsiThresholdChange: (value: string) => number;
  onTakePartialProfitChange: (value: boolean) => void;
  onPartialProfitTargetPctChange: (value: string) => number;
}): React.ReactElement {
  const rsiInputId = `${props.sectionId}-rsi-threshold`;

  return (
    <div className={STRATEGY_CREATOR_STYLES.sectionCard}>
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white">
            {props.title}
          </h3>
          <p className={MICROCOPY_TEXT_CLASS_NAME}>{props.titleHelper}</p>
        </div>
        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <FieldHeader label={props.stockLabel} />
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
            <FieldHeader id={rsiInputId} label={props.rsiThresholdLabel} />
            <DraftNumberInput
              id={rsiInputId}
              value={props.rsiThreshold}
              onCommit={props.onRsiThresholdChange}
              className={STRATEGY_CREATOR_STYLES.textInput}
            />
          </div>
        )}

        <PartialProfitField
          idPrefix={props.sectionId}
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
  referenceStockHelper,
  shortPeriodLabel,
  longPeriodLabel,
  rsiEnabledLabel,
  rsiEnabledHelper,
  alignmentEnabledLabel,
  alignmentEnabledHelper,
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
          <FieldHeader
            label={referenceStockLabel}
            helperText={referenceStockHelper}
          />
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
          <FieldHeader id="ma-short-period" label={shortPeriodLabel} />
          <DraftNumberInput
            id="ma-short-period"
            value={maShortPeriod}
            onCommit={onMaShortPeriodChange}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>

        <div className={STRATEGY_CREATOR_STYLES.fieldStack}>
          <FieldHeader id="ma-long-period" label={longPeriodLabel} />
          <DraftNumberInput
            id="ma-long-period"
            value={maLongPeriod}
            onCommit={onMaLongPeriodChange}
            className={STRATEGY_CREATOR_STYLES.textInput}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ToggleField
          label={rsiEnabledLabel}
          helperText={rsiEnabledHelper}
          isChecked={isRsiEnabled}
          onChange={onRsiEnabledChange}
        />
        <ToggleField
          label={alignmentEnabledLabel}
          helperText={alignmentEnabledHelper}
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
        sectionId="ma1"
        title={props.section1Title}
        titleHelper={props.section1Helper}
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
        sectionId="ma2"
        title={props.section2Title}
        titleHelper={props.section2Helper}
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
        sectionId="ma3"
        title={props.section3Title}
        titleHelper={props.section3Helper}
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