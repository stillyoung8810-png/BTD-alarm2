export const DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME =
  'h-[96px] min-h-[96px]';

export type DashboardBannerPlacement =
  | 'hidden'
  | 'after-header-before-dashboard-content';

export interface DashboardBannerDecisionInput {
  isInTossApp: boolean;
  shouldShowAds: boolean;
}

export interface DashboardBannerDecision {
  shouldRender: boolean;
  placement: DashboardBannerPlacement;
  adGroupIdSource: 'history-inline-banner';
  containerClassName: string;
  variant: 'card';
}

export function resolveDashboardBannerDecision(
  input: DashboardBannerDecisionInput,
): DashboardBannerDecision {
  const shouldRender = input.isInTossApp && input.shouldShowAds;

  if (!shouldRender) {
    return {
      shouldRender: false,
      placement: 'hidden',
      adGroupIdSource: 'history-inline-banner',
      containerClassName: DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME,
      variant: 'card',
    };
  }

  return {
    shouldRender: true,
    placement: 'after-header-before-dashboard-content',
    adGroupIdSource: 'history-inline-banner',
    containerClassName: DASHBOARD_INLINE_BANNER_CONTAINER_CLASS_NAME,
    variant: 'card',
  };
}
