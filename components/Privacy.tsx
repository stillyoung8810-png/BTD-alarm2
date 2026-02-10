import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface PrivacyProps {
  lang: 'ko' | 'en';
  onBack: () => void;
}

const EFFECTIVE_DATE = '2026년 2월 10일';

const Privacy: React.FC<PrivacyProps> = ({ lang, onBack }) => {
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
          유한회사 두리여유 개인정보 처리방침
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-8">시행일자: {EFFECTIVE_DATE}</p>

        {/* 서문 */}
        <p>
          유한회사 두리여유(이하 &lsquo;회사&rsquo;)는 「바이더딥 알람」 서비스(이하 &lsquo;서비스&rsquo;)를 제공함에 있어
          정보주체의 자유와 권리 보호를 위해 「개인정보 보호법」 및 관계 법령이 정한 바를 준수하여,
          적법하게 개인정보를 처리하고 안전하게 관리하고 있습니다.
          이에 「개인정보 보호법」 제30조에 따라 정보주체에게 개인정보의 처리와 보호에 관한
          절차 및 기준을 안내하고, 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록
          다음과 같이 개인정보 처리방침을 수립·공개합니다.
        </p>

        {/* 목차 */}
        <nav className="bg-slate-50 dark:bg-white/5 rounded-2xl p-5 my-8 border border-slate-200 dark:border-white/5">
          <p className="font-bold text-slate-900 dark:text-white mb-3 text-sm">목차</p>
          <ol className="list-decimal list-inside space-y-1 text-[13px]">
            <li><a href="#pp-1" className="underline underline-offset-2">개인정보의 처리 목적</a></li>
            <li><a href="#pp-2" className="underline underline-offset-2">처리하는 개인정보의 항목</a></li>
            <li><a href="#pp-3" className="underline underline-offset-2">개인정보의 처리 및 보유 기간</a></li>
            <li><a href="#pp-4" className="underline underline-offset-2">개인정보의 파기 절차 및 방법</a></li>
            <li><a href="#pp-5" className="underline underline-offset-2">개인정보의 제3자 제공에 관한 사항</a></li>
            <li><a href="#pp-6" className="underline underline-offset-2">개인정보 처리업무의 위탁에 관한 사항</a></li>
            <li><a href="#pp-7" className="underline underline-offset-2">개인정보의 국외 이전에 관한 사항</a></li>
            <li><a href="#pp-8" className="underline underline-offset-2">개인정보 자동 수집 장치의 설치·운영 및 거부에 관한 사항</a></li>
            <li><a href="#pp-9" className="underline underline-offset-2">정보주체와 법정대리인의 권리·의무 및 행사방법</a></li>
            <li><a href="#pp-10" className="underline underline-offset-2">개인정보의 안전성 확보 조치</a></li>
            <li><a href="#pp-11" className="underline underline-offset-2">개인정보 보호책임자 및 담당부서</a></li>
            <li><a href="#pp-12" className="underline underline-offset-2">정보주체의 권익침해에 대한 구제방법</a></li>
            <li><a href="#pp-13" className="underline underline-offset-2">개인정보 처리방침의 변경</a></li>
          </ol>
        </nav>

        {/* ================================================================ */}
        {/* 1. 개인정보의 처리 목적 */}
        {/* ================================================================ */}
        <Section id="pp-1" num={1} title="개인정보의 처리 목적">
          <p>
            회사는 다음의 목적을 위하여 개인정보를 처리합니다.
            처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며,
            이용 목적이 변경되는 경우에는 「개인정보 보호법」 제18조에 따라 별도의 동의를 받는 등
            필요한 조치를 이행할 예정입니다.
          </p>
          <ol className="list-decimal list-inside space-y-2 mt-4">
            <li>
              <strong>회원 가입 및 관리</strong>
              <p className="ml-5 text-[13px]">회원 가입 의사 확인, 회원제 서비스 제공에 따른 본인 식별·인증, 회원자격 유지·관리, 서비스 부정이용 방지, 각종 고지·통지, 고충 처리 목적으로 개인정보를 처리합니다.</p>
            </li>
            <li>
              <strong>서비스 제공</strong>
              <p className="ml-5 text-[13px]">투자 포트폴리오 관리, 다분할 매매 전략 시뮬레이션, 일일 매매 실행 요약 생성, 시세 정보 제공, AI 전략 분석, 백테스트 기능 제공의 목적으로 개인정보를 처리합니다.</p>
            </li>
            <li>
              <strong>알림 서비스 제공</strong>
              <p className="ml-5 text-[13px]">사용자가 설정한 시간에 맞춤형 매매 알림을 푸시 알림(FCM) 또는 텔레그램 메시지로 발송하기 위하여 개인정보를 처리합니다.</p>
            </li>
            <li>
              <strong>구독 및 결제 관리</strong>
              <p className="ml-5 text-[13px]">유료 구독 서비스 제공, 결제 처리, 구독 상태 관리의 목적으로 개인정보를 처리합니다.</p>
            </li>
            <li>
              <strong>서비스 개선</strong>
              <p className="ml-5 text-[13px]">서비스 이용 현황 분석, 오류 진단, 기능 개선의 목적으로 개인정보를 처리합니다.</p>
            </li>
          </ol>
        </Section>

        {/* ================================================================ */}
        {/* 2. 처리하는 개인정보의 항목 */}
        {/* ================================================================ */}
        <Section id="pp-2" num={2} title="처리하는 개인정보의 항목">
          <p>회사는 다음의 개인정보 항목을 처리하고 있습니다.</p>

          <h4 className="font-bold mt-5 mb-2 text-slate-800 dark:text-slate-200">가. 정보주체의 동의를 받지 않고 처리하는 개인정보 항목</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse border border-slate-300 dark:border-slate-600 mt-2">
              <thead>
                <tr className="bg-slate-100 dark:bg-white/10">
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">법적 근거</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">구분</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">수집·이용 목적</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">개인정보 항목</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제15조제1항제4호 (계약 체결·이행)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">회원 서비스 운영</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">회원 가입, 본인 식별·인증, 회원자격 유지·관리</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">이메일 주소, 비밀번호(암호화 저장), 사용자 고유 식별자(UUID)</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제15조제1항제4호 (계약 체결·이행)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">서비스 제공</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">포트폴리오 관리, 매매 전략 시뮬레이션, 일일 실행 요약 생성</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">포트폴리오 설정 정보(포트폴리오명, 매매 금액, 수수료율), 매매 전략 설정값, 매매 기록(매수·매도 일자, 가격, 수량)</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제15조제1항제4호 (계약 체결·이행)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">알림 서비스</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">매매 알림 발송(푸시/텔레그램)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">알람 설정 시간, 타임존, FCM 기기 토큰, 기기명, 브라우저 User-Agent, 텔레그램 Chat ID, 알림 발송 이력(발송 시각, 채널, 성공 여부)</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제15조제1항제4호 (계약 체결·이행)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">구독 및 결제</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">구독 상태 관리, 결제 처리</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">
                    구독 등급, 구독 상태, 구독 시작·만료일,
                    결제 수단 정보(카드사명, 카드번호 일부 등),
                    결제 기록(결제 일시, 결제 금액, 승인·취소·환불 이력 등 결제 이행에 필요한 정보)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 className="font-bold mt-5 mb-2 text-slate-800 dark:text-slate-200">나. 소셜 로그인 시 제3자로부터 제공받는 개인정보</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse border border-slate-300 dark:border-slate-600 mt-2">
              <thead>
                <tr className="bg-slate-100 dark:bg-white/10">
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">제공자</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">법적 근거</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">수집 항목</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">Google</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제15조제1항제4호 (계약 체결·이행)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">이메일 주소, 프로필 이름, 프로필 이미지 URL</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">GitHub</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제15조제1항제4호 (계약 체결·이행)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">이메일 주소, 프로필 이름, 프로필 이미지 URL</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">카카오</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제15조제1항제4호 (계약 체결·이행)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">이메일 주소, 프로필 닉네임, 프로필 이미지 URL</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 className="font-bold mt-5 mb-2 text-slate-800 dark:text-slate-200">다. 서비스 이용 과정에서 자동으로 생성·수집되는 정보</h4>
          <ul className="list-disc list-inside space-y-1 text-[13px]">
            <li>브라우저 User-Agent 정보 (기기명 파싱 목적)</li>
            <li>서비스 이용 기록 (접속 일시, 이용 기능)</li>
            <li>타임존 정보 (알람 시간 계산 목적, 브라우저에서 자동 감지)</li>
          </ul>

          <p className="mt-4 text-[12px] text-slate-500 dark:text-slate-400">
            ※ 회사는 위 항목 외에 주민등록번호, 여권번호, 운전면허번호 등 고유식별정보 및 건강정보, 사상·신념 등 민감정보를 수집하지 않습니다.
          </p>
        </Section>

        {/* ================================================================ */}
        {/* 3. 개인정보의 처리 및 보유 기간 */}
        {/* ================================================================ */}
        <Section id="pp-3" num={3} title="개인정보의 처리 및 보유 기간">
          <p>
            회사는 법령에 따른 개인정보 보유·이용 기간 또는 정보주체로부터 개인정보를 수집 시에
            동의받은 개인정보 보유·이용 기간 내에서 개인정보를 처리·보유합니다.
            각각의 개인정보 처리 및 보유 기간은 다음과 같습니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse border border-slate-300 dark:border-slate-600 mt-4">
              <thead>
                <tr className="bg-slate-100 dark:bg-white/10">
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">구분</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">보유 기간</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">관련 항목</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">회원 가입 및 관리</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2"><strong>회원 탈퇴 시까지</strong></td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">이메일, 비밀번호(해시), 사용자 ID, 프로필 정보</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">서비스 제공 (포트폴리오·매매 기록)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2"><strong>회원 탈퇴 시까지</strong></td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">포트폴리오 설정, 매매 전략, 매매 기록, 일일 실행 요약</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">알림 서비스</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2"><strong>회원 탈퇴 시 또는 알림 비활성화 시까지</strong></td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">FCM 토큰, 텔레그램 Chat ID, 기기 정보, 알림 발송 이력</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">구독 및 결제</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2"><strong>회원 탈퇴 시까지</strong> (단, 법령에 따라 보존이 필요한 경우 해당 기간까지)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">구독 등급, 구독 상태, Stripe 고객 ID</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4">다만, 다음의 사유에 해당하는 경우에는 해당 사유 종료 시까지 보관합니다.</p>
          <ul className="list-disc list-inside space-y-1 text-[13px] mt-2">
            <li>관계 법령 위반에 따른 수사·조사 등이 진행 중인 경우: 해당 수사·조사 종료 시까지</li>
            <li>서비스 이용에 따른 채권·채무관계 잔존 시: 해당 채권·채무관계 정산 시까지</li>
            <li>「전자상거래 등에서의 소비자보호에 관한 법률」에 따른 보존:
              <ul className="list-disc list-inside ml-5 mt-1 space-y-0.5">
                <li>계약 또는 청약철회 등에 관한 기록: 5년</li>
                <li>대금결제 및 재화 등의 공급에 관한 기록: 5년</li>
                <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년</li>
                <li>표시·광고에 관한 기록: 6개월</li>
              </ul>
            </li>
            <li>「통신비밀보호법」 제15조의2에 따른 통신사실확인자료 보관:
              <ul className="list-disc list-inside ml-5 mt-1">
                <li>로그인 기록: 3개월</li>
              </ul>
            </li>
          </ul>
        </Section>

        {/* ================================================================ */}
        {/* 4. 개인정보의 파기 절차 및 방법 */}
        {/* ================================================================ */}
        <Section id="pp-4" num={4} title="개인정보의 파기 절차 및 방법">
          <p>
            회사는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는
            지체없이 해당 개인정보를 파기합니다.
          </p>
          <p className="mt-3">
            정보주체로부터 동의받은 개인정보 보유기간이 경과하거나 처리목적이 달성되었음에도 불구하고
            다른 법령에 따라 개인정보를 계속 보존하여야 하는 경우에는,
            해당 개인정보를 별도의 데이터베이스(DB)로 옮기거나 보관장소를 달리하여 보존합니다.
          </p>
          <ol className="list-decimal list-inside space-y-2 mt-4">
            <li>
              <strong>파기 절차</strong>
              <p className="ml-5 text-[13px]">회사는 파기 사유가 발생한 개인정보를 선정하고, 회사의 개인정보 보호책임자의 승인을 받아 개인정보를 파기합니다.</p>
            </li>
            <li>
              <strong>파기 방법</strong>
              <ul className="list-disc list-inside ml-5 text-[13px] mt-1">
                <li>전자적 파일 형태로 기록·저장된 개인정보: 기록을 재생할 수 없도록 기술적 방법을 사용하여 완전 삭제</li>
                <li>종이 문서에 기록·저장된 개인정보: 분쇄기로 분쇄하거나 소각하여 파기</li>
              </ul>
            </li>
          </ol>
        </Section>

        {/* ================================================================ */}
        {/* 5. 개인정보의 제3자 제공 */}
        {/* ================================================================ */}
        <Section id="pp-5" num={5} title="개인정보의 제3자 제공에 관한 사항">
          <p>
            회사는 원칙적으로 정보주체의 개인정보를 제3자에게 제공하지 않습니다.
            다만, 다음의 경우에는 예외로 합니다.
          </p>
          <ul className="list-disc list-inside space-y-1 text-[13px] mt-3">
            <li>정보주체로부터 별도의 동의를 받은 경우</li>
            <li>다른 법률에 특별한 규정이 있는 경우</li>
            <li>명백히 정보주체 또는 제3자의 급박한 생명, 신체, 재산의 이익을 위하여 필요하다고 인정되는 경우</li>
          </ul>
          <p className="mt-3 text-[13px]">
            ※ 개인정보의 국외 이전(처리위탁·보관)이 발생하는 경우, 해당 사항은 아래 제7조 「개인정보의 국외 이전에 관한 사항」에서 안내합니다.
          </p>
        </Section>

        {/* ================================================================ */}
        {/* 6. 개인정보 처리업무의 위탁 */}
        {/* ================================================================ */}
        <Section id="pp-6" num={6} title="개인정보 처리업무의 위탁에 관한 사항">
          <p>회사는 원활한 서비스 제공을 위하여 다음과 같이 개인정보 처리 업무를 위탁하고 있습니다.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse border border-slate-300 dark:border-slate-600 mt-4">
              <thead>
                <tr className="bg-slate-100 dark:bg-white/10">
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">수탁자</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">위탁 업무</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">Stripe, Inc.</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">구독 결제 처리 및 결제 정보 관리</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">주식회사 코리아포트원 (포트원)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">
                    결제 정보 전달 및 결제 연동 서비스 제공<br />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      (위탁 기간: 서비스 회원 탈퇴 시 또는 위탁 계약 종료 시까지)
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13px]">
            회사는 위탁계약 체결 시 「개인정보 보호법」 제26조에 따라 위탁업무 수행목적 외 개인정보 처리금지,
            기술적·관리적 보호조치, 재위탁 제한, 수탁자에 대한 관리·감독, 손해배상 등 책임에 관한 사항을
            계약서 등 문서에 명시하고, 수탁자가 개인정보를 안전하게 처리하는지를 감독하고 있습니다.
          </p>
          <p className="mt-2 text-[13px]">
            위탁업무의 내용이나 수탁자가 변경될 경우에는 지체없이 본 개인정보 처리방침을 통하여 공개하도록 하겠습니다.
          </p>
          <p className="mt-2 text-[13px]">
            ※ 국외에 소재한 수탁자에 대한 사항은 아래 제7조 「개인정보의 국외 이전에 관한 사항」에서 안내합니다.
          </p>
        </Section>

        {/* ================================================================ */}
        {/* 7. 국외 이전 */}
        {/* ================================================================ */}
        <Section id="pp-7" num={7} title="개인정보의 국외 이전에 관한 사항">
          <p>
            회사는 서비스 제공을 위하여 아래와 같이 개인정보를 국외에 이전하고 있으며,
            「개인정보 보호법」 제28조의8제2항에 따라 다음과 같이 안내합니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse border border-slate-300 dark:border-slate-600 mt-4">
              <thead>
                <tr className="bg-slate-100 dark:bg-white/10">
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">이전받는 자</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">이전 국가</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">이전 항목</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">이용 목적</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">보유·이용 기간</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">법적 근거</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">
                    Supabase, Inc.<br />
                    <span className="text-[11px] text-slate-400">(support@supabase.io)</span>
                  </td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">미국</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">회원 정보, 포트폴리오 데이터, 알림 설정, 매매 기록, 일일 실행 요약</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">클라우드 데이터베이스 호스팅 및 서버리스 함수 실행 (처리위탁·보관)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">회원 탈퇴 시까지</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제28조의8제1항제3호 (계약 이행을 위한 국외 처리위탁·보관)</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">
                    Google LLC (Firebase Cloud Messaging)<br />
                    <span className="text-[11px] text-slate-400">(firebase-support@google.com)</span>
                  </td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">미국</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">FCM 기기 토큰, 알림 내용(제목, 본문)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">웹 푸시 알림 발송 (처리위탁)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">알림 발송 완료 시까지</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제28조의8제1항제3호</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">
                    Google LLC (Gemini API)<br />
                    <span className="text-[11px] text-slate-400">(cloud-support@google.com)</span>
                  </td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">미국</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">전략 설명 텍스트, 매매 스크린샷 이미지</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">AI 전략 분석 서비스 제공 (처리위탁)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">API 응답 완료 시까지</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제28조의8제1항제3호</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">
                    Telegram FZ-LLC<br />
                    <span className="text-[11px] text-slate-400">(privacy@telegram.org)</span>
                  </td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">아랍에미리트(두바이)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">텔레그램 Chat ID, 알림 메시지 내용</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">텔레그램 메시지 알림 발송 (처리위탁)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">메시지 발송 완료 시까지</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제28조의8제1항제3호</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">
                    Stripe, Inc.<br />
                    <span className="text-[11px] text-slate-400">(privacy@stripe.com)</span>
                  </td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">미국</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">Stripe 고객 ID, 결제 처리 정보</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">구독 결제 처리 (처리위탁)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">구독 해지 및 정산 완료 시까지</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">「개인정보 보호법」 제28조의8제1항제3호</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[13px]">
            <strong>국외 이전 거부 방법:</strong> 정보주체는 위 국외 이전을 거부할 수 있습니다.
            다만, 국외 이전을 거부하는 경우 서비스 이용이 제한될 수 있습니다.
            국외 이전을 원하지 않는 경우 서비스 내 프로필 설정에서 회원 탈퇴를 진행하거나,
            개인정보 보호책임자(grrrvv@naver.com)에게 이메일로 요청할 수 있습니다.
          </p>
        </Section>

        {/* ================================================================ */}
        {/* 8. 자동 수집 장치 */}
        {/* ================================================================ */}
        <Section id="pp-8" num={8} title="개인정보 자동 수집 장치의 설치·운영 및 거부에 관한 사항">
          <p>
            회사는 쿠키(Cookie)를 사용하지 않습니다.
            다만, 서비스 이용을 위하여 브라우저의 로컬 저장소(localStorage)에 다음의 정보를 저장합니다.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse border border-slate-300 dark:border-slate-600 mt-4">
              <thead>
                <tr className="bg-slate-100 dark:bg-white/10">
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">저장 항목</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">목적</th>
                  <th className="border border-slate-300 dark:border-slate-600 px-3 py-2 text-left">삭제 방법</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">인증 세션 토큰 (Supabase)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">로그인 상태 유지</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">로그아웃 시 자동 삭제 또는 브라우저 설정에서 수동 삭제</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">포트폴리오 캐시 데이터</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">화면 로딩 속도 개선</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">로그아웃 시 자동 삭제 또는 브라우저 설정에서 수동 삭제</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">시세 캐시 데이터 (IndexedDB)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">주식 시세 로딩 속도 개선 (비개인정보)</td>
                  <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">브라우저 설정에서 수동 삭제</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13px]">
            정보주체는 브라우저 설정을 통해 언제든지 위 저장소 데이터를 삭제할 수 있습니다.
            다만, 인증 세션 토큰을 삭제하는 경우 재로그인이 필요합니다.
          </p>
        </Section>

        {/* ================================================================ */}
        {/* 9. 정보주체의 권리·의무 및 행사방법 */}
        {/* ================================================================ */}
        <Section id="pp-9" num={9} title="정보주체와 법정대리인의 권리·의무 및 행사방법">
          <p>
            정보주체는 회사에 대해 언제든지 다음 각 호의 개인정보 보호 관련 권리를 행사할 수 있습니다.
          </p>
          <ol className="list-decimal list-inside space-y-1 text-[13px] mt-3">
            <li>개인정보 열람 요구</li>
            <li>오류 등이 있을 경우 정정 요구</li>
            <li>삭제 요구</li>
            <li>처리정지 요구</li>
          </ol>
          <p className="mt-3">
            위 권리 행사는 회사에 대해 서면, 전자우편(grrrvv@naver.com)을 통하여 할 수 있으며,
            회사는 이에 대해 지체없이 조치하겠습니다.
          </p>
          <p className="mt-2">
            정보주체가 개인정보의 오류 등에 대한 정정 또는 삭제를 요구한 경우에는
            회사는 정정 또는 삭제를 완료할 때까지 당해 개인정보를 이용하거나 제공하지 않습니다.
          </p>
          <p className="mt-2">
            위 권리 행사는 정보주체의 법정대리인이나 위임을 받은 자 등 대리인을 통하여 할 수 있습니다.
            이 경우 「개인정보 보호법 시행규칙」 별지 제11호 서식에 따른 위임장을 제출하여야 합니다.
          </p>
          <p className="mt-2">
            정보주체는 「개인정보 보호법」 등 관계 법령을 위반하여 회사가 처리하고 있는
            정보주체 본인이나 타인의 개인정보 및 사생활을 침해하여서는 아니 됩니다.
          </p>
        </Section>

        {/* ================================================================ */}
        {/* 10. 안전성 확보 조치 */}
        {/* ================================================================ */}
        <Section id="pp-10" num={10} title="개인정보의 안전성 확보 조치">
          <p>
            회사는 「개인정보 보호법」 제29조에 따라 다음과 같이 안전성 확보에 필요한 기술적·관리적 및 물리적 조치를 하고 있습니다.
          </p>
          <ol className="list-decimal list-inside space-y-2 mt-4 text-[13px]">
            <li>
              <strong>개인정보 취급 직원의 최소화 및 교육</strong>
              <p className="ml-5">개인정보를 취급하는 직원을 지정하고 최소화하여 개인정보를 관리하는 대책을 시행하고 있습니다.</p>
            </li>
            <li>
              <strong>개인정보에 대한 접근 제한</strong>
              <p className="ml-5">개인정보를 처리하는 데이터베이스 시스템에 대한 접근권한의 부여, 변경, 말소를 통하여 개인정보에 대한 접근통제를 위하여 필요한 조치를 하고 있습니다.</p>
            </li>
            <li>
              <strong>개인정보의 암호화</strong>
              <p className="ml-5">이용자의 비밀번호는 암호화되어 저장 및 관리되고 있으며, 중요한 데이터는 별도의 보안기능(SSL/TLS 암호화 통신)을 사용하고 있습니다.</p>
            </li>
            <li>
              <strong>접속기록의 보관 및 위변조 방지</strong>
              <p className="ml-5">개인정보 처리시스템에 접속한 기록을 최소 1년 이상 보관·관리하고 있습니다.</p>
            </li>
            <li>
              <strong>보안프로그램 설치 및 갱신</strong>
              <p className="ml-5">해킹이나 컴퓨터 바이러스 등에 의한 개인정보 유출 및 훼손을 막기 위하여 보안프로그램을 설치하고 주기적으로 갱신·점검하고 있습니다.</p>
            </li>
          </ol>
        </Section>

        {/* ================================================================ */}
        {/* 11. 개인정보 보호책임자 */}
        {/* ================================================================ */}
        <Section id="pp-11" num={11} title="개인정보 보호책임자 및 담당부서">
          <p>
            회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고,
            개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여
            아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
          </p>
          <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 mt-4 border border-slate-200 dark:border-white/5 text-[13px]">
            <p className="font-bold text-slate-900 dark:text-white">개인정보 보호책임자</p>
            <ul className="mt-2 space-y-1">
              <li>성명: 여태영</li>
              <li>직책: 대표</li>
              <li>연락처: grrrvv@naver.com</li>
            </ul>
          </div>
          <p className="mt-3 text-[13px]">
            정보주체는 회사의 서비스를 이용하면서 발생한 모든 개인정보 보호 관련 문의, 불만처리,
            피해구제 등에 관한 사항을 개인정보 보호책임자에게 문의하실 수 있습니다.
            회사는 정보주체의 문의에 대해 지체없이 답변 및 처리해 드리겠습니다.
          </p>
        </Section>

        {/* ================================================================ */}
        {/* 12. 권익침해 구제방법 */}
        {/* ================================================================ */}
        <Section id="pp-12" num={12} title="정보주체의 권익침해에 대한 구제방법">
          <p>
            정보주체는 아래의 기관에 대해 개인정보 침해에 대한 피해구제, 상담 등을 문의하실 수 있습니다.
          </p>
          <div className="space-y-3 mt-4 text-[13px]">
            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-200 dark:border-white/5">
              <p className="font-bold">개인정보 침해신고센터 (한국인터넷진흥원 운영)</p>
              <p>소관 업무: 개인정보 침해사실 신고, 상담 신청</p>
              <p>홈페이지: <a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener noreferrer" className="underline">privacy.kisa.or.kr</a></p>
              <p>전화: (국번없이) 118</p>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-200 dark:border-white/5">
              <p className="font-bold">개인정보 분쟁조정위원회</p>
              <p>소관 업무: 개인정보 분쟁조정신청, 집단분쟁조정 (민사적 해결)</p>
              <p>홈페이지: <a href="https://www.kopico.go.kr" target="_blank" rel="noopener noreferrer" className="underline">www.kopico.go.kr</a></p>
              <p>전화: (국번없이) 1833-6972</p>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-200 dark:border-white/5">
              <p className="font-bold">대검찰청 사이버수사과</p>
              <p>전화: (국번없이) 1301</p>
              <p>홈페이지: <a href="https://www.spo.go.kr" target="_blank" rel="noopener noreferrer" className="underline">www.spo.go.kr</a></p>
            </div>
            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-200 dark:border-white/5">
              <p className="font-bold">경찰청 사이버수사국</p>
              <p>전화: (국번없이) 182</p>
              <p>홈페이지: <a href="https://ecrm.cyber.go.kr" target="_blank" rel="noopener noreferrer" className="underline">ecrm.cyber.go.kr</a></p>
            </div>
          </div>
        </Section>

        {/* ================================================================ */}
        {/* 13. 처리방침 변경 */}
        {/* ================================================================ */}
        <Section id="pp-13" num={13} title="개인정보 처리방침의 변경">
          <p>이 개인정보 처리방침은 {EFFECTIVE_DATE}부터 적용됩니다.</p>
          <p className="mt-2">
            이전의 개인정보 처리방침은 아래에서 확인하실 수 있습니다.
          </p>
          <ul className="list-disc list-inside text-[13px] mt-2">
            <li>{EFFECTIVE_DATE} 시행 (현재)</li>
          </ul>
          <p className="mt-3 text-[13px]">
            개인정보 처리방침이 변경되는 경우 변경 사항을 서비스 내 공지사항을 통해 안내하겠습니다.
          </p>
        </Section>

        {/* 시행일자 강조 */}
        <div className="mt-12 pt-6 border-t border-slate-200 dark:border-white/10 text-center">
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
const Section: React.FC<{ id: string; num: number; title: string; children: React.ReactNode }> = ({ id, num, title, children }) => (
  <section id={id} className="mt-10 scroll-mt-20">
    <h2 className="text-lg font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-white/10 pb-2 mb-4">
      {num}. {title}
    </h2>
    {children}
  </section>
);

export default Privacy;
