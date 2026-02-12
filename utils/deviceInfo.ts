/**
 * 디바이스/브라우저 정보 파싱 (FCM 등에서 사용)
 * App.tsx 인지 복잡도 완화를 위해 분리
 */
function getBrowserName(ua: string): string {
  if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('OPR')) return 'Opera';
  return 'Unknown Browser';
}

function getOSName(ua: string): string {
  if (ua.includes('Windows NT 10.0')) return 'Windows 10/11';
  if (ua.includes('Windows NT 6.3')) return 'Windows 8.1';
  if (ua.includes('Windows NT 6.2')) return 'Windows 8';
  if (ua.includes('Windows NT 6.1')) return 'Windows 7';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS X') || ua.includes('Macintosh')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iOS')) return 'iOS';
  return 'Unknown OS';
}

export function parseDeviceInfo(): { deviceName: string; userAgent: string; deviceType: string } {
  if (typeof window === 'undefined' || !navigator) {
    return { deviceName: 'Unknown', userAgent: '', deviceType: 'web' };
  }
  const ua = navigator.userAgent;
  const browserName = getBrowserName(ua);
  const osName = getOSName(ua);
  return {
    deviceName: `${browserName} on ${osName}`,
    userAgent: ua,
    deviceType: 'web',
  };
}
