import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isTossApp, loadWebFramework } from './tossAppBridge';
import { requestTossNotificationAgreement } from './tossNotificationAgreementService';
import { readTossNotificationAgreementTemplateCode } from '../utils/viteImportMetaEnv';

vi.mock('./tossAppBridge', () => ({
  isTossApp: vi.fn(),
  loadWebFramework: vi.fn(),
}));

vi.mock('../utils/viteImportMetaEnv', () => ({
  readTossNotificationAgreementTemplateCode: vi.fn(),
}));

type LoadedWebFramework = NonNullable<Awaited<ReturnType<typeof loadWebFramework>>>;
type RequestNotificationAgreement =
  NonNullable<LoadedWebFramework['requestNotificationAgreement']>;

const mockedIsTossApp = vi.mocked(isTossApp);
const mockedLoadWebFramework = vi.mocked(loadWebFramework);
const mockedReadTemplateCode = vi.mocked(readTossNotificationAgreementTemplateCode);

describe('requestTossNotificationAgreement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsTossApp.mockReturnValue(true);
    mockedReadTemplateCode.mockReturnValue('template-code');
  });

  it('토스 앱 환경이 아니면 SDK를 로드하지 않습니다', async () => {
    mockedIsTossApp.mockReturnValue(false);

    const result = await requestTossNotificationAgreement();

    expect(result).toEqual({ type: 'unsupportedEnvironment' });
    expect(mockedReadTemplateCode).not.toHaveBeenCalled();
    expect(mockedLoadWebFramework).not.toHaveBeenCalled();
  });

  it('templateCode가 비어 있으면 SDK를 호출하지 않습니다', async () => {
    mockedReadTemplateCode.mockReturnValue('');

    const result = await requestTossNotificationAgreement();

    expect(result).toEqual({ type: 'missingTemplateCode' });
    expect(mockedLoadWebFramework).not.toHaveBeenCalled();
  });

  it('동의 결과를 Promise 결과로 반환하고 cleanup을 한 번만 호출합니다', async () => {
    const cleanup = vi.fn();
    const requestNotificationAgreement = vi.fn<RequestNotificationAgreement>(({ onEvent }) => {
      onEvent({ type: 'newAgreement' });
      return cleanup;
    });
    mockedLoadWebFramework.mockResolvedValue({
      isMinVersionSupported: () => true,
      requestNotificationAgreement,
    });

    const result = await requestTossNotificationAgreement();

    expect(result).toEqual({ type: 'newAgreement' });
    expect(requestNotificationAgreement).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { templateCode: 'template-code' },
      }),
    );
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('SDK 에러를 반환하고 후속 이벤트가 와도 cleanup을 중복 호출하지 않습니다', async () => {
    const cleanup = vi.fn();
    const sdkError = new Error('bridge failed');
    const requestNotificationAgreement = vi.fn<RequestNotificationAgreement>(({
      onError,
      onEvent,
    }) => {
      onError(sdkError);
      onEvent({ type: 'alreadyAgreed' });
      return cleanup;
    });
    mockedLoadWebFramework.mockResolvedValue({
      isMinVersionSupported: () => true,
      requestNotificationAgreement,
    });

    const result = await requestTossNotificationAgreement();

    expect(result.type).toBe('sdkError');
    if (result.type === 'sdkError') {
      expect(result.message).toBe('bridge failed');
      expect(result.error).toBe(sdkError);
    }
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('지원 버전이 아니면 SDK 요청 함수를 호출하지 않습니다', async () => {
    const requestNotificationAgreement = vi.fn<RequestNotificationAgreement>();
    mockedLoadWebFramework.mockResolvedValue({
      isMinVersionSupported: () => false,
      requestNotificationAgreement,
    });

    const result = await requestTossNotificationAgreement();

    expect(result).toEqual({ type: 'unsupportedEnvironment' });
    expect(requestNotificationAgreement).not.toHaveBeenCalled();
  });
});
