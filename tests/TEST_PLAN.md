# 테스트 계획 (QT Note v1)

- 단위 테스트: `node --test tests/unit` (Node 내장 테스트 러너, 외부 패키지 없음)
- 화면 테스트(E2E): `node --test tests/e2e` (Playwright + Chromium, 로컬 정적 서버)

## 요구사항 ↔ 테스트 대응

| PRD 요구사항 | 테스트 |
|---|---|
| 노트 3종 (묵상·예배·자유) | unit `schema` 전체 / e2e `devotion…`, `worship and free…` |
| 입력 → A4 미리보기 반영 | e2e `devotion note: typed text appears on the A4 sheet` |
| 날짜 → 요일 자동 표시 | e2e 같은 테스트 (2026-11-08 = 일요일) |
| 체크박스 (예배 유형·실천) | e2e `worship and free notes render their fields` |
| 인쇄 (A4 1쪽, 앱 UI 숨김) | e2e `print layout…` |
| PDF 바로 다운로드 | unit `pdfFileName` / e2e `PDF download…` (A4 1쪽, 3MB 미만) |
| 저장 방식 선택 (기기 보관 / 저장 안 함) | unit `store` 전체 / e2e `first run…`, `none mode…` |
| 여러 줄 칸은 늘어나고 잘리지 않음, 한 줄 칸은 경고 | unit `snapCut` / e2e `long multi-line text grows…` |
| 넘치면 다음 장으로 (인쇄·PDF 쪽수 = 미리보기 쪽수, 글자 누락 없음) | e2e `very long devotion continues…` |
| 자유 노트 자동 페이지 추가·쪽 번호 | e2e `free note adds pages…` |
| 미리보기는 버튼을 눌렀을 때만 | e2e `PC: the preview appears only…` |
| 자유 노트 사진: 넣기·끌어 옮기기·크기 조절(비율 유지)·장 이동·새로고침 후 유지·인쇄/PDF 포함·빼기 | unit `images`, `normalizeNote` / e2e `free note photos…` |
| 하단 저작권 문구 | e2e `devotion…` (문구 확인) |
| 4개 언어 화면 | unit `i18n` (모든 언어 키 일치) / e2e `language switch…` |
| 벚꽃 양 그림 (PDF에서도 색 유지) | unit `sheep` (var() 미사용, 테마별 색) |
| 홈 화면 추가 (PWA) | e2e `manifest and icons…` |
| 오프라인 사용 | unit `sw` (사전 캐시 파일 존재) / e2e `offline…` |
| 스마트폰·PC 모두 사용 | e2e `mobile viewport…` |
| 노트 삭제 | unit `store` / e2e `delete note…` |
| 서버로 전송 없음 | e2e `no network requests to other origins` |

## 경계값·이상 상황

- 저장소 사용 불가(시크릿 모드 등) → '저장 안 함'으로 동작 (unit)
- 저장 데이터 손상 → 백업 후 새로 시작 (unit)
- 용량 초과 → 오류 표시, 앱은 계속 동작 (unit)
- '기기 보관' → '저장 안 함' 전환 시 기기에 저장된 노트 삭제 (unit)
- 넘침: 짧은 글 → 경고 없음, 긴 글 → 경고, 다시 줄이면 사라짐 (e2e)
