export const BTD_TOSS_SMART_MESSAGE_TEMPLATE_CODE = 'btdalarm-push_msg';
export const BTD_TOSS_SMART_MESSAGE_SCREEN_NAME = 'markets';

export interface TossSmartMessageContext {
  date: string;
  screenName: typeof BTD_TOSS_SMART_MESSAGE_SCREEN_NAME;
}

interface TossSmartMessageInput {
  local_date?: string | null;
  time_local?: string | null;
  time_kst?: string | null;
}

function getCurrentKSTDateString(): string {
  const nowUtc = new Date();
  const kstTime = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  const year = kstTime.getUTCFullYear();
  const month = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kstTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildBtdTossSmartMessageContext(
  input?: TossSmartMessageInput
): TossSmartMessageContext {
  const localDate = input?.local_date?.trim();
  const localTime = input?.time_local?.trim();
  const timeKst = input?.time_kst?.trim();

  return {
    date:
      localDate && localTime
        ? `${localDate} ${localTime}`
        : localTime || timeKst || getCurrentKSTDateString(),
    screenName: BTD_TOSS_SMART_MESSAGE_SCREEN_NAME,
  };
}
