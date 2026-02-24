/**
 * TDS Menu 훅 — 토스 앱 환경에서만 @toss/tds-mobile Menu 반환
 * R2 롤백: require('@toss/tds-mobile') 제거. 항상 { Menu: null }. 원포인트 재적용 시 복구.
 */

import React, { useMemo } from 'react';
import { useTossApp } from '../../contexts/TossAppContext';

export interface TDSMenuComponent {
  (props: {
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
    placement?: string;
    children: React.ReactNode;
  }): React.ReactElement | null;
  Trigger: React.FC<{ children: React.ReactNode }>;
  Dropdown: React.FC<{ children: React.ReactNode }>;
  Header: React.FC<{ children: React.ReactNode }>;
  DropdownCheckItem: React.FC<{
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    children: React.ReactNode;
  }>;
}

export function useTDSMenu(): { Menu: TDSMenuComponent | null } {
  const { isInTossApp } = useTossApp();
  /* R2 롤백: getTDSMenu() 및 require('@toss/tds-mobile') 제거. 항상 null 반환. */
  return useMemo(() => ({ Menu: null }), [isInTossApp]);
}
