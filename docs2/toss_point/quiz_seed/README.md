# 혜택 탭 퀴즈 문제은행 Seed

이 폴더는 제품 DB 반영 전 검수용 JSONL 문제은행입니다.

- 총 600문항: 주식 기초 200, ETF 기초 200, 경제 기초 200
- 모든 문항은 `review_status: "draft"` 상태입니다.
- 서비스 노출 전 사람 검수 후 DB seed 또는 migration으로 변환해야 합니다.
- `choices`는 2지선다 또는 O/X만 사용합니다.
- `correct_choice_id`는 반드시 `choices[].id` 중 하나여야 합니다.
- DB 이관 시 검수용 필드(`human_id`, `review_status`, `source_note`, `topic`)는 운영 정책에 따라 별도 보관하거나 제외할 수 있습니다.
