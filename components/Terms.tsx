import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface TermsProps {
  lang: 'ko' | 'en';
  onBack: () => void;
}

const EFFECTIVE_DATE = '2026년 2월 10일';

const Terms: React.FC<TermsProps> = ({ lang, onBack }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 뒤로가기 */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        {lang === 'ko' ? '돌아가기' : 'Go Back'}
      </button>

      <article className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          바이더딥 알람 이용약관
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-8">시행일자: {EFFECTIVE_DATE}</p>

        {/* 제1조 */}
        <Section num={1} title="목적">
          <p>
            이 약관은 유한회사 두리여유(이하 &lsquo;회사&rsquo;)가 제공하는 &lsquo;바이더딥 알람&rsquo; 서비스(이하 &lsquo;서비스&rsquo;)의
            이용조건 및 절차, 회사와 이용자의 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
          </p>
        </Section>

        {/* 제2조 */}
        <Section num={2} title="정의">
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li>&lsquo;서비스&rsquo;란 회사가 제공하는 투자 포트폴리오 관리, 매매 전략 시뮬레이션, 알림 발송, 시세 정보 제공, AI 전략 분석, 백테스트 등 관련 부가 서비스 일체를 의미합니다.</li>
            <li>&lsquo;이용자&rsquo;란 이 약관에 따라 회사와 이용계약을 체결하고 서비스를 이용하는 자를 의미합니다.</li>
            <li>&lsquo;회원&rsquo;이란 회사에 개인정보를 제공하여 회원등록을 한 자로서, 회사가 제공하는 서비스를 계속적으로 이용할 수 있는 자를 의미합니다.</li>
            <li>&lsquo;콘텐츠&rsquo;란 서비스를 통해 제공되는 매매 전략 시뮬레이션 결과, 일일 실행 요약, 시세 정보, AI 분석 결과 등 일체의 정보를 의미합니다.</li>
          </ol>
        </Section>

        {/* 제3조 */}
        <Section num={3} title="약관의 게시와 개정">
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li>회사는 이 약관의 내용을 이용자가 쉽게 알 수 있도록 서비스 내에 게시합니다.</li>
            <li>회사는 「약관의 규제에 관한 법률」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등 관련법을 위배하지 않는 범위에서 이 약관을 개정할 수 있습니다.</li>
            <li>회사가 약관을 개정할 경우에는 적용일자 및 개정사유를 명시하여 현행약관과 함께 서비스 내에 그 적용일자 7일 전부터 적용일자 전일까지 공지합니다. 다만, 이용자에게 불리한 약관의 개정의 경우에는 30일 전부터 공지합니다.</li>
            <li>이용자가 개정약관의 적용에 동의하지 않는 경우 이용계약을 해지할 수 있습니다.</li>
          </ol>
        </Section>

        {/* 제4조 */}
        <Section num={4} title="이용계약의 체결">
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li>이용계약은 이용자가 약관의 내용에 동의한 후 회원가입 신청을 하고, 회사가 이를 승낙함으로써 체결됩니다.</li>
            <li>회사는 다음 각 호에 해당하는 경우 이용계약의 승낙을 거부하거나 사후에 이용계약을 해지할 수 있습니다.
              <ul className="list-disc list-inside ml-5 mt-1 space-y-0.5">
                <li>가입신청자가 이 약관에 의하여 이전에 회원자격을 상실한 경우</li>
                <li>타인의 명의를 이용한 경우</li>
                <li>허위의 정보를 기재하거나 회사가 요구하는 내용을 기재하지 않은 경우</li>
                <li>기타 이용계약을 체결하는 것이 기술상 현저히 지장이 있는 경우</li>
              </ul>
            </li>
          </ol>
        </Section>

        {/* 제5조 */}
        <Section num={5} title="서비스의 제공 및 변경">
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li>회사는 다음과 같은 서비스를 제공합니다.
              <ul className="list-disc list-inside ml-5 mt-1 space-y-0.5">
                <li>투자 포트폴리오 생성 및 관리</li>
                <li>다분할 매매 전략 시뮬레이션 및 일일 매매 실행 요약</li>
                <li>주식 시세 정보 제공 및 기술적 지표 분석</li>
                <li>사용자 설정 시간 기반 푸시 알림(FCM) 및 텔레그램 알림</li>
                <li>AI 기반 전략 분석</li>
                <li>백테스트 기능</li>
                <li>기타 회사가 추가 개발하는 서비스</li>
              </ul>
            </li>
            <li>회사는 서비스의 내용을 변경할 수 있으며, 변경 시에는 변경 내용을 서비스 내에 공지합니다.</li>
          </ol>
        </Section>

        {/* 제6조 */}
        <Section num={6} title="서비스의 중단">
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li>회사는 정보통신설비의 보수점검, 교체 및 고장, 통신의 두절 등의 사유가 발생한 경우에는 서비스의 제공을 일시적으로 중단할 수 있습니다.</li>
            <li>회사는 제1항의 사유로 서비스 제공이 일시적으로 중단됨으로 인하여 이용자 또는 제3자가 입은 손해에 대하여 배상합니다. 다만, 회사가 고의 또는 과실이 없음을 입증하는 경우에는 그러하지 아니합니다.</li>
          </ol>
        </Section>

        {/* 제7조 */}
        <Section num={7} title="회원의 의무">
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li>회원은 관련 법령, 이 약관의 규정, 이용안내 및 서비스와 관련하여 공지한 주의사항을 준수하여야 합니다.</li>
            <li>회원은 다음 행위를 하여서는 안 됩니다.
              <ul className="list-disc list-inside ml-5 mt-1 space-y-0.5">
                <li>신청 또는 변경 시 허위 내용의 등록</li>
                <li>타인의 정보 도용</li>
                <li>회사가 게시한 정보의 변경</li>
                <li>회사가 정한 정보 이외의 정보(컴퓨터 프로그램 등)의 송신 또는 게시</li>
                <li>회사 또는 제3자의 저작권 등 지적재산권에 대한 침해</li>
                <li>회사 또는 제3자의 명예를 손상시키거나 업무를 방해하는 행위</li>
                <li>외설 또는 폭력적인 메시지, 화상, 음성, 기타 공서양속에 반하는 정보를 서비스에 공개 또는 게시하는 행위</li>
                <li>서비스를 이용하여 부당한 이익을 취하는 행위</li>
              </ul>
            </li>
          </ol>
        </Section>

        {/* 제8조 */}
        <Section num={8} title="투자 관련 면책">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-xl p-4 text-[13px] space-y-2">
            <ol className="list-decimal list-inside space-y-2">
              <li>서비스에서 제공하는 모든 콘텐츠(매매 전략 시뮬레이션 결과, 일일 실행 요약, AI 분석 결과, 시세 정보 등)는 <strong>투자 권유가 아니며, 참고용 정보</strong>에 해당합니다.</li>
              <li>이용자의 투자 판단은 전적으로 이용자 본인의 책임이며, 서비스에서 제공하는 정보를 바탕으로 한 투자 손실에 대하여 회사는 어떠한 법적 책임도 부담하지 않습니다.</li>
              <li>서비스에서 제공되는 매매 전략 시뮬레이션은 과거 데이터 기반 가상 시뮬레이션이며, <strong>미래의 수익을 보장하지 않습니다</strong>.</li>
              <li>시세 정보는 실시간 정보가 아닐 수 있으며, 지연이나 오류가 발생할 수 있습니다. 회사는 시세 정보의 정확성을 보증하지 않습니다.</li>
            </ol>
          </div>
        </Section>

        {/* 제9조 */}
        <Section num={9} title="유료 서비스 및 결제">
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li>회사는 무료 서비스 외에 유료 구독 서비스(PRO, PREMIUM 등)를 제공할 수 있습니다.</li>
            <li>유료 서비스의 이용 요금 및 결제 방법은 서비스 내 해당 페이지에 명시합니다.</li>
            <li>결제는 Stripe, Inc.를 통해 처리되며, 결제에 관한 사항은 해당 결제 서비스의 이용약관을 따릅니다.</li>
            <li>구독 해지 시 이미 결제된 구독 기간에 대한 환불은 관련 법령 및 회사의 환불 정책에 따릅니다.</li>
          </ol>
        </Section>

        {/* 제10조 */}
        <Section num={10} title="지적재산권">
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li>서비스 내 회사가 작성한 저작물에 대한 저작권 기타 지적재산권은 회사에 귀속합니다.</li>
            <li>이용자는 서비스를 이용함으로써 얻은 정보를 회사의 사전 승낙 없이 복제, 송신, 출판, 배포, 방송 기타 방법에 의하여 영리 목적으로 이용하거나 제3자에게 이용하게 하여서는 안 됩니다.</li>
          </ol>
        </Section>

        {/* 제11조 */}
        <Section num={11} title="이용계약의 해지">
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li>회원은 언제든지 서비스 내 프로필 설정에서 이용계약 해지(회원 탈퇴)를 신청할 수 있으며, 회사는 즉시 회원탈퇴를 처리합니다.</li>
            <li>회원 탈퇴 시 관련 법령 및 개인정보 처리방침에 따라 회사가 회원정보를 보유하는 경우를 제외하고는 회원의 데이터는 지체없이 파기됩니다.</li>
          </ol>
        </Section>

        {/* 제12조 */}
        <Section num={12} title="손해배상">
          <p className="text-[13px]">
            회사는 무료로 제공하는 서비스와 관련하여 이용자에게 어떠한 손해가 발생하더라도 회사의 고의 또는 중대한 과실에 의한 경우를 제외하고 이에 대하여 책임을 지지 않습니다.
          </p>
        </Section>

        {/* 제13조 */}
        <Section num={13} title="분쟁 해결">
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li>이 약관에 명시되지 않은 사항은 「전자상거래 등에서의 소비자보호에 관한 법률」, 「약관의 규제에 관한 법률」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 등 관련 법령의 규정에 따릅니다.</li>
            <li>서비스 이용과 관련하여 분쟁이 발생한 경우 대한민국 법을 적용하며, 회사의 본점 소재지를 관할하는 법원을 전속 관할법원으로 합니다.</li>
          </ol>
        </Section>

        {/* 제14조 */}
        <Section num={14} title="토스 미니앱 이용 관련 특칙">
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li>토스 앱 내에서 서비스를 이용하는 경우, 토스(주식회사 비바리퍼블리카)의 미니앱 이용약관이 추가로 적용될 수 있습니다.</li>
            <li>토스 앱을 통해 전달받은 이용자 정보는 서비스 제공 목적으로만 처리하며, 별도의 개인정보 처리방침에 따릅니다.</li>
            <li>토스 미니앱 관련 고객 지원은 토스 미니앱 고객센터 또는 회사에 문의하실 수 있습니다.</li>
          </ol>
        </Section>

        {/* 부칙 */}
        <div className="mt-12 pt-6 border-t border-slate-200 dark:border-white/10">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3">부칙</h2>
          <p className="text-[13px]">이 약관은 {EFFECTIVE_DATE}부터 시행합니다.</p>
        </div>

        {/* 시행일자 강조 */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/10 text-center">
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">시행일자: {EFFECTIVE_DATE}</p>
          <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-1">유한회사 두리여유 대표 여태영</p>
        </div>
      </article>
    </div>
  );
};

/* ----------------------------------------------------------------------- */
/* 공통 섹션 wrapper                                                       */
/* ----------------------------------------------------------------------- */
const Section: React.FC<{ num: number; title: string; children: React.ReactNode }> = ({ num, title, children }) => (
  <section className="mt-8 scroll-mt-20">
    <h2 className="text-lg font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-white/10 pb-2 mb-4">
      제{num}조 ({title})
    </h2>
    {children}
  </section>
);

export default Terms;
