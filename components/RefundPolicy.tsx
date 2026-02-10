import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface RefundPolicyProps {
  lang: 'ko' | 'en';
  onBack: () => void;
}

const EFFECTIVE_DATE = '2026년 2월 10일';

const RefundPolicy: React.FC<RefundPolicyProps> = ({ lang, onBack }) => {
  const isKo = lang === 'ko';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 뒤로가기 */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        {isKo ? '돌아가기' : 'Go Back'}
      </button>

      <article className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {isKo ? '환불 및 취소 규정' : 'Refund & Cancellation Policy'}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-8">
          {isKo ? `시행일자: ${EFFECTIVE_DATE}` : `Effective: ${EFFECTIVE_DATE}`}
        </p>

        {/* ── 서비스 개요 ───────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
            {isKo ? '제1조 (적용 대상)' : 'Article 1 (Scope)'}
          </h2>
          <p>
            {isKo
              ? '본 규정은 유한회사 두리여유(이하 "회사")가 운영하는 "바이더딥 알람" 서비스(이하 "서비스")의 유료 이용권 결제에 대한 환불 및 취소 절차를 규정합니다.'
              : 'This policy governs the refund and cancellation procedures for paid plan purchases of the "Buy The Dip Alarm" service operated by Duriyeoyu LLC.'}
          </p>
        </section>

        {/* ── 청약 철회 (환불) ────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
            {isKo ? '제2조 (청약 철회 및 환불)' : 'Article 2 (Withdrawal & Refund)'}
          </h2>
          <ol className="list-decimal pl-5 space-y-3">
            <li>
              <strong>{isKo ? '전액 환불 가능 조건' : 'Full Refund Conditions'}</strong>
              <br />
              {isKo
                ? '결제일로부터 7일 이내에 유료 서비스(AI 매매 인식, 백테스트, 텔레그램 연동 등)를 1회도 이용하지 않은 경우, 전액 환불이 가능합니다.'
                : 'Full refund is available within 7 days of payment if no paid features (AI trade recognition, backtesting, Telegram integration, etc.) have been used.'}
            </li>
            <li>
              <strong>{isKo ? '환불 제한' : 'Refund Restrictions'}</strong>
              <br />
              {isKo
                ? '유료 서비스를 1회 이상 이용한 경우, 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항 제5호에 따라 청약철회가 제한됩니다. 이는 디지털 콘텐츠의 특성상 제공과 동시에 소비가 이루어지는 것으로 간주되기 때문입니다.'
                : 'If paid features have been used even once, withdrawal is restricted in accordance with Article 17(2)(5) of the Consumer Protection Act for E-Commerce, as digital content is deemed consumed upon delivery.'}
            </li>
            <li>
              <strong>{isKo ? '환불 처리 기간' : 'Refund Processing Time'}</strong>
              <br />
              {isKo
                ? '환불 승인 후 결제 수단에 따라 3~7영업일 이내에 환불 금액이 반영됩니다.'
                : 'Refunds are processed within 3-7 business days after approval, depending on the payment method.'}
            </li>
          </ol>
        </section>

        {/* ── 이용 기간 및 만료 ──────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
            {isKo ? '제3조 (이용 기간 및 만료)' : 'Article 3 (Service Period & Expiry)'}
          </h2>
          <ol className="list-decimal pl-5 space-y-3">
            <li>
              {isKo
                ? '본 서비스는 단발성 결제 방식이며, 자동 갱신(정기 구독)은 적용되지 않습니다.'
                : 'This service uses one-time payments. There is no automatic renewal or recurring subscription.'}
            </li>
            <li>
              {isKo
                ? '이용권은 결제일로부터 30일간 유효하며, 만료 후에는 무료(FREE) 플랜으로 자동 전환됩니다.'
                : 'Each plan is valid for 30 days from the date of purchase and reverts to the FREE plan upon expiry.'}
            </li>
            <li>
              {isKo
                ? '환불이 불가한 경우에도 이용 기간 만료 시까지 유료 서비스를 계속 이용할 수 있습니다.'
                : 'Even if a refund is not eligible, paid features remain accessible until the service period expires.'}
            </li>
          </ol>
        </section>

        {/* ── 환불 절차 ──────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
            {isKo ? '제4조 (환불 절차)' : 'Article 4 (Refund Procedure)'}
          </h2>
          <ol className="list-decimal pl-5 space-y-3">
            <li>
              {isKo
                ? '앱 내 [프로필] → [환불 요청] 버튼을 통해 환불을 신청할 수 있습니다.'
                : 'Refund requests can be made via the [Profile] → [Request Refund] button in the app.'}
            </li>
            <li>
              {isKo
                ? '자동 환불 처리가 불가능한 경우, 아래 이메일로 환불을 요청하실 수 있습니다.'
                : 'If automatic refund is not possible, you may contact us via email below.'}
            </li>
          </ol>
        </section>

        {/* ── 면책 사항 ──────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
            {isKo ? '제5조 (면책 사항)' : 'Article 5 (Disclaimer)'}
          </h2>
          <p>
            {isKo
              ? '본 서비스는 투자 정보 제공 목적이며, 투자 손실에 대한 책임은 이용자에게 있습니다. 서비스 제공 과정에서 발생한 기술적 장애로 인한 손해는 회사의 고의 또는 중과실이 없는 한 책임을 지지 않습니다.'
              : 'This service provides investment information only. The user bears responsibility for investment decisions. The company is not liable for damages from technical issues unless caused by willful misconduct or gross negligence.'}
          </p>
        </section>

        {/* ── 문의처 ─────────────────────────────────────── */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
            {isKo ? '제6조 (문의처)' : 'Article 6 (Contact)'}
          </h2>
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-white/5 text-sm space-y-1">
            <p><strong>{isKo ? '상호' : 'Company'}:</strong> 유한회사 두리여유</p>
            <p><strong>{isKo ? '대표자' : 'CEO'}:</strong> 여태영</p>
            <p><strong>{isKo ? '사업자등록번호' : 'Business No.'}:</strong> 344-87-02345</p>
            <p><strong>{isKo ? '환불 문의 이메일' : 'Refund Email'}:</strong> grrrvv@naver.com</p>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10 my-6" />
        <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
          {isKo
            ? `본 규정은 ${EFFECTIVE_DATE}부터 시행됩니다.`
            : `This policy takes effect from ${EFFECTIVE_DATE}.`}
        </p>
      </article>
    </div>
  );
};

export default RefundPolicy;
