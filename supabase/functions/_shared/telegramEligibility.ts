interface TelegramEligibleProfile {
  telegram_enabled?: boolean | null;
  telegram_chat_id?: string | number | null;
}

export function shouldSendTelegram(
  profile: TelegramEligibleProfile | null,
): boolean {
  if (!profile) return false;
  if (profile.telegram_enabled !== true) return false;

  const chatId = profile.telegram_chat_id;
  return chatId != null && String(chatId).trim().length > 0;
}
