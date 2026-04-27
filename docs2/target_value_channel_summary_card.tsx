import React from 'react';
import {
  TARGET_VALUE_CHANNEL_FATAL_FALLBACK,
  TARGET_VALUE_CHANNEL_MESSAGES,
  type TargetValueChannelMessagesContract,
} from './target_value_channel_messages';
import {
  buildStrategyCreatorSummaryViewModel,
  type TargetValueChannelPersistedConfig,
} from './target_value_channel_simulation';
import type {
  AppLang,
  StrategyCreatorSummaryRowViewModel,
  StrategyCreatorSummaryViewModel,
} from './target_value_channel_summary_contract';

interface TargetValueChannelSummaryCardProps {
  lang: AppLang;
  config: TargetValueChannelPersistedConfig;
}

function getRowDescription(
  row: StrategyCreatorSummaryRowViewModel,
  viewModel: StrategyCreatorSummaryViewModel,
  messages: TargetValueChannelMessagesContract,
): string {
  if (row.id === 'initialTargetValue') {
    return messages.summaryCard.initialTargetValueDerivedFrom(
      viewModel.initialCapitalDisplay,
      viewModel.initialAllocationPct,
    );
  }

  return messages.summaryCard.rowDescriptions[row.id];
}

export function TargetValueChannelSummaryCard(
  props: TargetValueChannelSummaryCardProps,
): React.ReactElement {
  const messages =
    TARGET_VALUE_CHANNEL_MESSAGES[props.lang] ??
    TARGET_VALUE_CHANNEL_MESSAGES.ko ??
    null;

  // Why: 메인 메시지 map 조회가 실패해도 같은 i18n 모듈의 별도 fallback 상수로
  // 화면을 지켜야 SSOT와 WSoD 방어를 동시에 만족할 수 있습니다.
  if (messages == null) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 font-bold text-red-500">
        {TARGET_VALUE_CHANNEL_FATAL_FALLBACK[props.lang] ??
          TARGET_VALUE_CHANNEL_FATAL_FALLBACK.en}
      </div>
    );
  }

  const viewModel = buildStrategyCreatorSummaryViewModel(props.config);
  const summaryMessages = messages.summaryCard;

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="text-base font-black text-slate-900">
        {summaryMessages.title}
      </h3>
      <p className="text-xs leading-relaxed text-slate-500">
        {summaryMessages.helper}
      </p>
      <ul className="space-y-3">
        {viewModel.rows.map((row) => {
          const formula =
            row.formulaId != null
              ? summaryMessages.formulas[row.formulaId]
              : null;

          return (
            <li
              key={row.id}
              className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-black text-slate-900">
                  {summaryMessages.rowLabels[row.id]}
                </span>
                {row.value != null ? (
                  <span className="text-sm font-bold text-blue-600">
                    {row.value}
                  </span>
                ) : null}
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                {getRowDescription(row, viewModel, messages)}
              </p>
              {formula != null ? (
                <p className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-mono text-slate-700">
                  {summaryMessages.formulaLabel}: {formula}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default TargetValueChannelSummaryCard;
