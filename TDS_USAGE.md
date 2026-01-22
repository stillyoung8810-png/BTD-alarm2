# 토스 TDS 시스템 사용 가이드

이 프로젝트는 토스 앱 환경에서만 TDS (Toss Design System) 스타일을 적용하고, 일반 웹 환경에서는 기존 디자인을 유지합니다.

## 구조

- **일반 웹 환경**: 기존 Tailwind CSS 스타일 유지
- **토스 앱 환경**: TDS 색상 및 Typography 시스템 적용

## 사용 방법

### 1. 토스 앱 환경 확인

컴포넌트에서 `useTossApp` 훅을 사용하여 토스 앱 환경인지 확인할 수 있습니다:

```typescript
import { useTossApp } from './contexts/TossAppContext';

const MyComponent = () => {
  const { isInTossApp } = useTossApp();
  
  return (
    <div>
      {isInTossApp ? '토스 앱 환경' : '일반 웹 환경'}
    </div>
  );
};
```

### 2. 조건부 Typography 스타일 적용

```typescript
import { useTossApp } from './contexts/TossAppContext';
import { getConditionalTypographyStyle } from './utils/tossStyleHelpers';

const MyComponent = () => {
  const { isInTossApp } = useTossApp();
  
  // 토스 앱일 때만 Typography 스타일 적용
  const typographyStyle = getConditionalTypographyStyle(
    isInTossApp,
    'Typography5',
    'Regular'
  );
  
  return (
    <p style={typographyStyle || undefined}>
      {/* 일반 웹 환경에서는 기존 Tailwind 클래스 사용 */}
      <span className={!isInTossApp ? 'text-base' : ''}>
        텍스트 내용
      </span>
    </p>
  );
};
```

### 3. 조건부 색상 적용

```typescript
import { useTossApp } from './contexts/TossAppContext';
import { getConditionalColor } from './utils/tossStyleHelpers';

const MyComponent = () => {
  const { isInTossApp } = useTossApp();
  
  // 토스 앱일 때만 TDS 색상 사용
  const primaryColor = getConditionalColor(isInTossApp, 'primary');
  
  return (
    <button
      style={{
        backgroundColor: primaryColor || undefined,
      }}
      className={!isInTossApp ? 'bg-blue-600' : ''}
    >
      버튼
    </button>
  );
};
```

### 4. 직접 TDS 스타일 사용 (토스 앱 환경에서만)

```typescript
import { useTossApp } from './contexts/TossAppContext';
import { getTypographyStyle } from './utils/tossTypography';
import { tossColors } from './utils/tossColors';

const MyComponent = () => {
  const { isInTossApp } = useTossApp();
  
  if (!isInTossApp) {
    // 일반 웹 환경: 기존 Tailwind 스타일 사용
    return (
      <div className="text-base text-blue-600">
        일반 웹 환경
      </div>
    );
  }
  
  // 토스 앱 환경: TDS 스타일 사용
  return (
    <div
      style={{
        ...getTypographyStyle('Typography5', 'Regular'),
        color: tossColors.primary,
      }}
    >
      토스 앱 환경
    </div>
  );
};
```

## 주요 파일

- `contexts/TossAppContext.tsx`: 토스 앱 환경 확인 Context
- `utils/tossStyleHelpers.ts`: 조건부 스타일 적용 헬퍼 함수
- `utils/tossTypography.ts`: TDS Typography 시스템
- `utils/tossColors.ts`: TDS 색상 시스템
- `services/tossAppBridge.ts`: 토스 앱 브릿지 및 환경 확인

## 주의사항

1. **기존 디자인 유지**: 일반 웹 환경에서는 기존 Tailwind CSS 클래스를 그대로 사용합니다.
2. **조건부 적용**: TDS 스타일은 토스 앱 환경에서만 적용되도록 조건문을 사용하세요.
3. **스타일 병합**: `mergeTossStyles` 함수를 사용하여 기존 스타일과 TDS 스타일을 병합할 수 있습니다.
