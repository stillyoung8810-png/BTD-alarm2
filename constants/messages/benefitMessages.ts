import type { AppLang } from '@/types';

export interface BenefitWalletBoardItemCopy {
  readonly id: 'balance' | 'lifetime' | 'redeemable' | 'pending';
  readonly label: string;
  readonly value: string;
}

export interface BenefitMessages {
  readonly navLabel: string;
  readonly pageTitle: string;
  readonly pageSubtitle: string;
  readonly actionLoadingLabel: string;
  readonly retryCta: string;
  readonly moneyUnit: string;
  readonly tossPointUnit: string;
  readonly walletTitle: string;
  readonly walletSubtitle: string;
  readonly walletSkeletonLabel: string;
  readonly walletItems: readonly BenefitWalletBoardItemCopy[];
  readonly guestLockedStatus: string;
  readonly guestNoticeMessage: string;
  readonly summaryLoadError: string;
  readonly authRequiredMessage: string;
  readonly networkErrorMessage: string;
  readonly genericActionError: string;
  readonly attendanceTitle: string;
  readonly attendanceRewardLabel: string;
  readonly attendanceSubtitle: string;
  readonly attendanceCta: string;
  readonly attendanceStatus: string;
  readonly attendanceReadyStatus: string;
  readonly attendanceCompletedStatus: string;
  readonly attendanceSuccessMessage: string;
  readonly attendanceStreakSuccessMessage: string;
  readonly predictionTitle: string;
  readonly predictionRewardLabel: string;
  readonly predictionSubtitle: string;
  readonly predictionCta: string;
  readonly predictionStatus: string;
  readonly predictionReadyStatus: string;
  readonly predictionUnavailableStatus: string;
  readonly predictionCompletedStatus: string;
  readonly predictionQuestionLoadCta: string;
  readonly predictionUnlockCta: string;
  readonly predictionUpCta: string;
  readonly predictionDownCta: string;
  readonly predictionBasePriceLabel: string;
  readonly predictionNoQuestionMessage: string;
  readonly predictionSubmitSuccessMessage: string;
  readonly predictionPendingResultMessage: string;
  readonly predictionLastAccuracyLabel: string;
  readonly predictionLastAccuracyEmptyLabel: string;
  readonly quizTitle: string;
  readonly quizRewardLabel: string;
  readonly quizSubtitle: string;
  readonly quizCta: string;
  readonly quizStatus: string;
  readonly quizReadyStatus: string;
  readonly quizUnavailableStatus: string;
  readonly quizCompletedStatus: string;
  readonly quizQuestionLoadCta: string;
  readonly quizUnlockCta: string;
  readonly quizChoiceAriaPrefix: string;
  readonly quizNoQuestionMessage: string;
  readonly quizCorrectMessage: string;
  readonly quizIncorrectMessage: string;
  readonly tossPointTitle: string;
  readonly tossPointSubtitle: string;
  readonly tossPointCta: string;
  readonly tossPointStatus: string;
  readonly tossPointReadyStatus: string;
  readonly tossPointPendingStatus: string;
  readonly tossPointNotEnoughMessage: string;
  readonly tossPointPendingMessage: string;
  readonly tossPointMockPendingMessage: string;
  readonly tossPointSuccessMessage: string;
  readonly tossPointPreparingMessage: string;
  readonly tossPointUnavailableMessage: string;
  readonly tossPointBudgetRetryMessage: string;
  readonly tossPointKeyRetryMessage: string;
  readonly tossPointResultMissingMessage: string;
  readonly tossPointRequestLimitMessage: string;
  readonly tossPointRestoreCompletedMessage: string;
  readonly missionNotUnlockedMessage: string;
  readonly missionQuestionUnavailableMessage: string;
  readonly missionInvalidAttemptMessage: string;
  readonly missionSubmitInterstitialNotice: string;
  readonly benefitApiSetupMessage: string;
  readonly benefitApiRouteMissingMessage: string;
  readonly benefitServerErrorMessage: string;
  readonly rewardAdNotCompletedMessage: string;
  readonly rewardAdUnlockSuccessMessage: string;
  readonly attemptLimitReachedMessage: string;
  readonly unlockLimitReachedMessage: string;
  readonly apiPendingNotice: string;
}

export const BENEFIT_MESSAGES: Record<AppLang, BenefitMessages> = {
  ko: {
    navLabel: '혜택',
    pageTitle: '혜택',
    pageSubtitle: '출석·예측·퀴즈 이벤트는 7월 6일까지 진행됩니다.',
    actionLoadingLabel: '처리 중',
    retryCta: '다시 시도',
    moneyUnit: '머니',
    tossPointUnit: 'P',
    walletTitle: '내 혜택 지갑',
    walletSubtitle: '미션 보상과 토스 포인트 지급 대기 상태를 실시간으로 동기화합니다.',
    walletSkeletonLabel: '혜택 지갑 정보를 불러오는 중',
    walletItems: [
      { id: 'balance', label: '현재 머니', value: '0머니' },
      { id: 'lifetime', label: '누적 적립', value: '0머니' },
      { id: 'redeemable', label: '받을 수 있는 토스 포인트', value: '0P' },
      { id: 'pending', label: '처리 중인 포인트', value: '0P' },
    ],
    guestLockedStatus: '로그인 후 이용 가능',
    guestNoticeMessage: '로그인하면 출석, 예측, 퀴즈와 토스 포인트 받기를 이용할 수 있습니다.',
    summaryLoadError: '혜택 지갑 정보를 불러오지 못했습니다.',
    authRequiredMessage: '로그인 세션을 확인한 뒤 다시 시도해 주세요.',
    networkErrorMessage: '네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
    genericActionError: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    attendanceTitle: '출석체크',
    attendanceRewardLabel: '참여 보상 5머니',
    attendanceSubtitle: '하루 한 번 출석하고 연속 출석 보너스를 준비합니다.',
    attendanceCta: '출석체크하기',
    attendanceStatus: '상태 확인 중',
    attendanceReadyStatus: '오늘 출석 가능',
    attendanceCompletedStatus: '오늘 출석 완료',
    attendanceSuccessMessage: '출석 보상이 지갑에 반영되었습니다.',
    attendanceStreakSuccessMessage: '출석 보상과 연속 출석 보너스가 지갑에 반영되었습니다.',
    predictionTitle: '주식 가격 예측',
    predictionRewardLabel: '참여 보상 10머니',
    predictionSubtitle: '서비스 지원 종목의 다음 영업일 종가 상승/하락을 예측합니다.',
    predictionCta: '예측 문제 보기',
    predictionStatus: '상태 확인 중',
    predictionReadyStatus: '예측 참여 가능',
    predictionUnavailableStatus: '예측 준비 중',
    predictionCompletedStatus: '오늘 예측 완료',
    predictionQuestionLoadCta: '예측 문제 새로고침',
    predictionUnlockCta: '광고 보고 추가 예측',
    predictionUpCta: '상승',
    predictionDownCta: '하락',
    predictionBasePriceLabel: '기준가',
    predictionNoQuestionMessage: '지금 참여 가능한 예측 문제가 없습니다.',
    predictionSubmitSuccessMessage: '예측 보상이 지갑에 반영되었습니다.',
    predictionPendingResultMessage: '예측 참여 보상이 지갑에 반영되었습니다. 정답 판정은 정산 시 확정됩니다.',
    predictionLastAccuracyLabel: '직전 정답률',
    predictionLastAccuracyEmptyLabel: '직전 정답률 없음',
    quizTitle: '주식 상식 퀴즈',
    quizRewardLabel: '참여 보상 10머니',
    quizSubtitle: '쉬운 주식·ETF·경제 상식 문제를 풉니다.',
    quizCta: '퀴즈 시작하기',
    quizStatus: '상태 확인 중',
    quizReadyStatus: '퀴즈 참여 가능',
    quizUnavailableStatus: '퀴즈 준비 중',
    quizCompletedStatus: '오늘 퀴즈 완료',
    quizQuestionLoadCta: '퀴즈 문제 새로고침',
    quizUnlockCta: '광고 보고 추가 퀴즈',
    quizChoiceAriaPrefix: '퀴즈 선택지',
    quizNoQuestionMessage: '지금 풀 수 있는 퀴즈 문제가 없습니다.',
    quizCorrectMessage: '정답입니다. 퀴즈 보상이 지갑에 반영되었습니다.',
    quizIncorrectMessage: '참여 보상이 지갑에 반영되었습니다.',
    tossPointTitle: '토스 포인트 받기',
    tossPointSubtitle: '1,000머니 단위로 토스 포인트 지급 요청을 준비합니다.',
    tossPointCta: '토스 포인트 받기',
    tossPointStatus: '상태 확인 중',
    tossPointReadyStatus: '지급 요청 가능',
    tossPointPendingStatus: '지급 대기 중',
    tossPointNotEnoughMessage: '토스 포인트를 받으려면 1,000머니 이상이 필요합니다.',
    tossPointPendingMessage: '이미 지급 대기 중인 토스 포인트가 있습니다.',
    tossPointMockPendingMessage: '토스 포인트 지급 요청이 대기 상태로 생성되었습니다.',
    tossPointSuccessMessage: '토스 포인트 지급 요청이 완료되었습니다.',
    tossPointPreparingMessage: '토스 포인트 혜택 준비가 아직 완료되지 않았습니다.',
    tossPointUnavailableMessage: '현재 받을 수 없는 토스 포인트 혜택입니다.',
    tossPointBudgetRetryMessage: '프로모션 예산 확인 후 다시 받을 수 있습니다.',
    tossPointKeyRetryMessage: '지급 키를 다시 확인하고 있습니다. 잠시 후 다시 시도해 주세요.',
    tossPointResultMissingMessage: '지급 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    tossPointRequestLimitMessage: '1회 최대 5,000P까지만 받을 수 있습니다.',
    tossPointRestoreCompletedMessage: '토스 포인트 지급이 실패해 차감된 머니를 복구했습니다.',
    missionNotUnlockedMessage: '광고 시청으로 추가 문제를 먼저 해금해 주세요.',
    missionQuestionUnavailableMessage: '지금은 참여 가능한 문제가 없습니다. 잠시 후 다시 확인해 주세요.',
    missionInvalidAttemptMessage: '미션 상태가 바뀌었습니다. 새로고침 후 다시 시도해 주세요.',
    missionSubmitInterstitialNotice:
      '제출 후 짧은 광고가 나올 수 있어요. 보상은 그대로 지급됩니다.',
    benefitApiSetupMessage: '혜택 API 설정을 확인한 뒤 다시 시도해 주세요.',
    benefitApiRouteMissingMessage: '혜택 API 경로를 찾지 못했습니다. 앱을 새로고침해 주세요.',
    benefitServerErrorMessage: '혜택 서버가 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    rewardAdNotCompletedMessage: '광고 시청이 완료되지 않아 추가 문제가 해금되지 않았습니다.',
    rewardAdUnlockSuccessMessage: '추가 문제가 해금되었습니다.',
    attemptLimitReachedMessage: '오늘 참여 가능한 횟수를 모두 사용했습니다.',
    unlockLimitReachedMessage: '오늘 광고 해금 가능 횟수를 모두 사용했습니다.',
    apiPendingNotice:
      '혜택 API와 연결되었습니다. 문제가 보이지 않으면 잠시 후 다시 시도해 주세요.',
  },
  en: {
    navLabel: 'Benefits',
    pageTitle: 'Benefits',
    pageSubtitle: 'Attendance, prediction, and quiz events run through July 6.',
    actionLoadingLabel: 'Processing',
    retryCta: 'Retry',
    moneyUnit: 'money',
    tossPointUnit: 'P',
    walletTitle: 'Benefit Wallet',
    walletSubtitle: 'Mission rewards and pending Toss Point payouts stay in sync.',
    walletSkeletonLabel: 'Loading benefit wallet',
    walletItems: [
      { id: 'balance', label: 'Current Money', value: '0 money' },
      { id: 'lifetime', label: 'Lifetime Earned', value: '0 money' },
      { id: 'redeemable', label: 'Redeemable Toss Points', value: '0P' },
      { id: 'pending', label: 'Processing Points', value: '0P' },
    ],
    guestLockedStatus: 'Available after login',
    guestNoticeMessage: 'Log in to use attendance, predictions, quizzes, and Toss Point redemption.',
    summaryLoadError: 'Could not load your benefit wallet.',
    authRequiredMessage: 'Please check your login session and try again.',
    networkErrorMessage: 'Please check your network connection and try again.',
    genericActionError: 'We could not process the request. Please try again later.',
    attendanceTitle: 'Attendance',
    attendanceRewardLabel: 'Participation reward 5 money',
    attendanceSubtitle: 'Check in once a day and prepare streak bonuses.',
    attendanceCta: 'Check In',
    attendanceStatus: 'Checking status',
    attendanceReadyStatus: 'Ready today',
    attendanceCompletedStatus: 'Checked in today',
    attendanceSuccessMessage: 'Attendance reward has been added to your wallet.',
    attendanceStreakSuccessMessage: 'Attendance and streak bonus rewards have been added to your wallet.',
    predictionTitle: 'Stock Price Prediction',
    predictionRewardLabel: 'Participation reward 10 money',
    predictionSubtitle: 'Predict whether a supported symbol closes up or down on the next trading day.',
    predictionCta: 'View Prediction',
    predictionStatus: 'Checking status',
    predictionReadyStatus: 'Prediction ready',
    predictionUnavailableStatus: 'Prediction pending',
    predictionCompletedStatus: 'Prediction complete today',
    predictionQuestionLoadCta: 'Refresh Prediction',
    predictionUnlockCta: 'Watch Ad for More',
    predictionUpCta: 'Up',
    predictionDownCta: 'Down',
    predictionBasePriceLabel: 'Base price',
    predictionNoQuestionMessage: 'No prediction is available to join right now.',
    predictionSubmitSuccessMessage: 'Prediction reward has been added to your wallet.',
    predictionPendingResultMessage: 'Participation reward has been added. The final result will be settled later.',
    predictionLastAccuracyLabel: 'Last accuracy',
    predictionLastAccuracyEmptyLabel: 'No settled accuracy yet',
    quizTitle: 'Stock Basics Quiz',
    quizRewardLabel: 'Participation reward 10 money',
    quizSubtitle: 'Answer easy stock, ETF, and economy basics questions.',
    quizCta: 'Start Quiz',
    quizStatus: 'Checking status',
    quizReadyStatus: 'Quiz ready',
    quizUnavailableStatus: 'Quiz pending',
    quizCompletedStatus: 'Quiz complete today',
    quizQuestionLoadCta: 'Refresh Quiz',
    quizUnlockCta: 'Watch Ad for More',
    quizChoiceAriaPrefix: 'Quiz choice',
    quizNoQuestionMessage: 'No quiz is available right now.',
    quizCorrectMessage: 'Correct. The quiz reward has been added to your wallet.',
    quizIncorrectMessage: 'Participation reward has been added to your wallet.',
    tossPointTitle: 'Receive Toss Points',
    tossPointSubtitle: 'Prepare requests in 1,000 money bundles.',
    tossPointCta: 'Receive Toss Points',
    tossPointStatus: 'Checking status',
    tossPointReadyStatus: 'Ready to request',
    tossPointPendingStatus: 'Payout pending',
    tossPointNotEnoughMessage: 'You need at least 1,000 money to receive Toss Points.',
    tossPointPendingMessage: 'You already have Toss Points pending payout.',
    tossPointMockPendingMessage: 'Your Toss Point payout request is pending.',
    tossPointSuccessMessage: 'Your Toss Point payout request has been completed.',
    tossPointPreparingMessage: 'This Toss Point benefit is not ready yet.',
    tossPointUnavailableMessage: 'This Toss Point benefit is not available right now.',
    tossPointBudgetRetryMessage: 'You can try again after the promotion budget is checked.',
    tossPointKeyRetryMessage: 'We are checking the payout key. Please try again shortly.',
    tossPointResultMissingMessage: 'We could not verify the payout result. Please try again shortly.',
    tossPointRequestLimitMessage: 'You can receive up to 5,000P per request.',
    tossPointRestoreCompletedMessage: 'The Toss Point payout failed, so your money was restored.',
    missionNotUnlockedMessage: 'Please unlock an extra question by watching an ad first.',
    missionQuestionUnavailableMessage: 'No mission question is available right now. Please check again later.',
    missionInvalidAttemptMessage: 'Mission status has changed. Please refresh and try again.',
    missionSubmitInterstitialNotice:
      'A short full-screen ad may appear after you submit. Your participation reward is still granted.',
    benefitApiSetupMessage: 'Please check the Benefits API setup and try again.',
    benefitApiRouteMissingMessage: 'The Benefits API route was not found. Please refresh the app.',
    benefitServerErrorMessage: 'The Benefits server could not process the request. Please try again later.',
    rewardAdNotCompletedMessage: 'The ad was not completed, so the extra question was not unlocked.',
    rewardAdUnlockSuccessMessage: 'An extra question has been unlocked.',
    attemptLimitReachedMessage: 'You have used all attempts available today.',
    unlockLimitReachedMessage: 'You have used all ad unlocks available today.',
    apiPendingNotice:
      'Benefits API is connected. If no question appears, please try again shortly.',
  },
} as const;

export function getBenefitMessages(lang: AppLang): BenefitMessages {
  return BENEFIT_MESSAGES[lang];
}
