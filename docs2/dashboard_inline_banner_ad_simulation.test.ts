import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME,
  resolveDashboardBannerDecision,
  type DashboardBannerDecisionInput,
} from './dashboard_inline_banner_ad_simulation_snippets';

describe('dashboard inline banner ad simulation', () => {
  it('renders the banner after the dashboard header for Toss users with ads enabled', () => {
    const decision = resolveDashboardBannerDecision({
      isInTossApp: true,
      shouldShowAds: true,
    });

    expect(decision).toEqual({
      shouldRender: true,
      placement: 'after-header-before-dashboard-content',
      adGroupIdSource: 'history-inline-banner',
      containerClassName: DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME,
      variant: 'card',
    });
  });

  it.each<DashboardBannerDecisionInput>([
    {
      isInTossApp: false,
      shouldShowAds: true,
    },
    {
      isInTossApp: true,
      shouldShowAds: false,
    },
  ])('keeps the banner hidden for unsupported state %#', (input) => {
    const decision = resolveDashboardBannerDecision(input);

    expect(decision).toEqual({
      shouldRender: false,
      placement: 'hidden',
      adGroupIdSource: 'history-inline-banner',
      containerClassName: DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME,
      variant: 'card',
    });
  });
});
