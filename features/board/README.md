# 게시판 (애드센스 심사용) — 웹 전용

- **노출**: 웹에서만 표시되며, 토스 미니앱에는 노출되지 않습니다.
- **목적**: 애드센스 심사 통과를 위한 줄글 게시판. 로그인 없이 누구나 열람 가능.
- **분리/제거**: 아래 항목만 제거하면 서비스와 완전 분리됩니다.

## 제거 시 삭제할 항목

1. **라우트**: `index.tsx`에서 `/posts`, `/posts/:id` Route 2줄 및 import
2. **네비**: `App.tsx`에서 `!isInTossApp && ( ... 게시판 링크 ... )` 블록 및 `FileText` import
3. **폴더**: `features/board/` 전체
4. **(선택)** `public/data/posts.json`, `public/images/` 내 게시판용 이미지

## 데이터

- **글 목록**: `public/data/posts.json` (배열)
- **이미지**: `public/images/` 에 저장 후 `imageUrl`: `"/images/파일명.jpg"`, `imageAlt`: 설명 텍스트

각 글 객체: `id`, `title`, `date`, `content`, `imageUrl`(선택), `imageAlt`(선택)
