/**
 * TDS Menu 훅 — 토스 앱 환경에서만 @toss/tds-mobile Menu 반환
 * AlarmModal, StrategyCreator 등에서 require('@toss/tds-mobile') 중복 제거 (DRY, Anti-pattern 정리)
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

let cachedMenu: TDSMenuComponent | null | false = null;

function getTDSMenu(): TDSMenuComponent | null {
  if (cachedMenu !== null) return cachedMenu === false ? null : cachedMenu;
  try {
    const { Menu } = require('@toss/tds-mobile');
    cachedMenu = Menu as TDSMenuComponent;
    return cachedMenu;
  } catch {
    cachedMenu = false;
    return null;
  }
}

export function useTDSMenu(): { Menu: TDSMenuComponent | null } {
  const { isInTossApp } = useTossApp();
  return useMemo(() => {
    if (!isInTossApp) return { Menu: null };
    return { Menu: getTDSMenu() };
  }, [isInTossApp]);
}
