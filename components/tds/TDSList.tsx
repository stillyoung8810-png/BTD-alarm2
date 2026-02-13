/**
 * TDS List / ListRow 래퍼 (Phase 2 — Dashboard)
 * - 토스 앱: @toss/tds-mobile List, ListRow 사용
 * - 웹: 미사용 (Dashboard에서 isInTossApp 분기로 section grid 유지)
 */

import React from 'react';
import { useTossApp } from '../../contexts/TossAppContext';

export interface TDSListProps {
  children: React.ReactNode;
  className?: string;
}

export interface TDSListRowProps {
  children: React.ReactNode;
  /** ListRow 구분선 스타일 (토스만) */
  border?: 'indented' | 'none';
  /** 상하 여백 (토스만) */
  verticalPadding?: 'small' | 'medium' | 'large' | 'xlarge';
  /** 터치 시 시각 효과 (토스만) */
  withTouchEffect?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * 토스 환경에서만 List(ul) 렌더, 웹에서는 children을 그대로 감싸지 않음 (부모가 section 등으로 감쌈).
 * Dashboard에서는 isInTossApp일 때만 TDSList로 감싸므로, 웹 경로에서는 TDSList를 사용하지 않음.
 */
export const TDSList: React.FC<TDSListProps> = ({ children, className }) => {
  const { isInTossApp } = useTossApp();
  if (!isInTossApp) {
    return <>{children}</>;
  }
  try {
    const { List } = require('@toss/tds-mobile');
    return <List className={className}>{children}</List>;
  } catch {
    return <ul className={className}>{children}</ul>;
  }
};

/**
 * 토스 환경에서만 ListRow(li) 렌더, 웹에서는 div로 감싸서 grid 아이템으로 사용 가능.
 * Dashboard에서 isInTossApp일 때 ListRow, 웹일 때는 grid 내 카드이므로 이 컴포넌트는 토스 리스트에서만 사용.
 */
export const TDSListRow: React.FC<TDSListRowProps> = ({
  children,
  border = 'none',
  verticalPadding = 'medium',
  withTouchEffect = false,
  onClick,
  className,
}) => {
  const { isInTossApp } = useTossApp();
  if (!isInTossApp) {
    return <div className={className}>{children}</div>;
  }
  try {
    const { ListRow } = require('@toss/tds-mobile');
    return (
      <ListRow
        border={border}
        verticalPadding={verticalPadding}
        withTouchEffect={withTouchEffect}
        onClick={onClick}
        className={className}
      >
        {children}
      </ListRow>
    );
  } catch {
    return <li className={className}>{children}</li>;
  }
};
