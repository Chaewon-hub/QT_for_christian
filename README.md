# QT Note — 묵상·예배 노트 웹앱

교인이 스마트폰이나 PC로 **묵상 노트 · 예배 노트 · 자유 노트**를 쓰고, A4 디자인 그대로 **인쇄하거나 PDF로 저장**하는 웹앱입니다.
서버와 로그인이 없는 정적 파일이라 GitHub Pages에 올리기만 하면 됩니다.

## 기능

- 노트 3종: 데일리 묵상 노트, 예배 노트, 자유 노트(줄)
- [미리보기] 버튼을 누르면 A4 결과를 전체 화면으로 확인 (여러 장이면 모두 표시, 화면 위에 'A4 n쪽' 표시)
- 여러 줄 칸은 글이 많으면 **그 칸만 늘어나고 잘리지 않음**. 먼저 같은 장의 여백 칸('오늘의 말씀'·'설교 내용')을 줄여 한 장에 맞추고,
  그래도 넘치면 다음 장으로 이어짐(제목에 '(계속)'). 자유 노트는 분량만큼 장이 늘어남. 한 줄 칸(본문·찬양 등)만 넘치면 경고
- 날짜를 고르면 요일 동그라미 자동 표시, 체크박스(예배 유형·실천 항목)
- **자유 노트 사진** (v1.3): '내용' 칸 안에서 글과 함께 넣습니다. [사진 넣기](휴대폰은 촬영/앨범)는 커서 자리에, 사진 파일을 칸에 끌어다 놓으면 놓은 자리에 들어갑니다.
  사진을 누르면 ↑·↓로 순서 이동(PC는 끌어서 이동도 가능), 오른쪽 아래 동그라미로 크기 조절. 미리보기·인쇄·PDF에 같은 순서·크기로 들어가고, 쪽에 다 안 들어가면 다음 쪽으로 넘어갑니다. '+ 쪽 추가'로 빈 장 추가.
  v1.2에서 넣은 사진은 처음 열 때 글 맨 뒤로 옮겨집니다.
  사진은 기기 안(IndexedDB)에만 저장되고, 긴 변 1600px JPEG로 줄여서 보관
- **PDF 저장**: 버튼 하나로 A4 PDF 다운로드 (스마트폰은 공유 창 → '파일에 저장'·LINE 등)
- **인쇄**: 흰 배경 인쇄용 A4 (인쇄 창에서 'PDF로 저장'을 고르면 고화질 PDF)
- 저장 방식은 처음 쓸 때 선택: **이 기기에 보관**(날짜별 목록) / **저장 안 함**(공용 PC용)
- 한국어 · 日本語 · English · 中文(简体), 스타일 A(테라코타) / B(네이비·머스터드)
- 홈 화면에 추가(앱처럼 사용), 한 번 연 뒤에는 오프라인에서도 사용 가능
- 입력 내용은 기기 밖으로 보내지 않음 (외부 서버·CDN 호출 없음)

## 폴더 구조

```
index.html              앱 화면
manifest.webmanifest    홈 화면 추가 정보
sw.js                   오프라인 캐시 (새 버전을 올릴 때 CACHE 번호를 올릴 것)
css/  app.css (앱 화면), sheet.css (A4 노트 디자인)
js/   main.js (화면 전환) · schema.js (칸 정의) · i18n.js (4개 언어 문구) · store.js (저장)
      form.js (입력 폼) · sheet.js (A4 페이지 나누기) · rich.js (글+사진 편집 칸) · richbody.js (저장 형식) · images.js (사진 저장) · sheep.js (양 그림) · pdf.js (PDF)
assets/ fonts (글꼴) · vendor (html2canvas, jsPDF) · icons (앱 아이콘)
tests/  unit (단위 테스트) · e2e (화면 테스트) · TEST_PLAN.md
tools/  make-icons.mjs (양 그림으로 앱 아이콘 다시 만들기)
```

자주 바꿀 곳:
- 문구(4개 언어): `js/i18n.js`
- 양 그림: `js/sheep.js`의 `sheepSVG` (바꾼 뒤 `node tools/make-icons.mjs`로 아이콘도 갱신)
- 칸 구성: `js/schema.js` + `js/sheet.js`

## GitHub Pages에 올리기

### 방법 A: GitHub Desktop (명령어 없이)
1. GitHub에서 새 저장소 `qt-note` 만들기 (Public)
2. GitHub Desktop → File → Clone repository → `qt-note`
3. 이 폴더의 파일을 전부 복사해 넣고 → Commit → Push
4. 저장소 **Settings → Pages → Build and deployment**: Source `Deploy from a branch`, Branch `main` / `(root)` → Save
5. 1~2분 뒤 `https://<사용자이름>.github.io/qt-note/` 에서 열림

### 방법 B: PowerShell
```powershell
cd $HOME\Downloads\qt-note
git init
git add .
git commit -m "QT Note v1.0.0"
git branch -M main
git remote add origin https://github.com/<사용자이름>/qt-note.git
git push -u origin main
```
그다음 위 4번(Settings → Pages)을 설정합니다.

### 새 버전을 올릴 때
`sw.js` 맨 위의 `const CACHE = 'qtnote-v1.3.0';` 숫자를 올려야(예: `v1.3.1`) 이미 설치한 사람의 앱도 새 파일로 바뀝니다.

## 교회 홈페이지에 넣기

어떤 홈페이지 서비스든 **링크 버튼**이 가장 확실합니다.

```html
<a href="https://<사용자이름>.github.io/qt-note/" target="_blank" rel="noopener">✎ 묵상 노트 쓰기</a>
```

'HTML 삽입' 기능이 있으면 화면 안에 넣을 수도 있습니다. 단, 다른 사이트 안(iframe)에서는 브라우저에 따라
'이 기기에 보관'이 막히거나 인쇄가 불안정할 수 있어 링크 버튼을 추천합니다.

```html
<iframe src="https://<사용자이름>.github.io/qt-note/" title="QT Note" style="width:100%;height:900px;border:0"></iframe>
```

## 내 PC에서 실행·테스트 (선택)

Node.js 20 이상이 필요합니다.

```powershell
cd $HOME\Downloads\qt-note
npm run serve          # 표시되는 주소를 브라우저로 열기
npm test               # 단위 테스트
npm install --no-save playwright; npx playwright install chromium
npm run test:e2e       # 화면 테스트 (Playwright)
```

## 저작권

© 2026 All rights reserved. 본 양식의 무단 복제 및 사용을 금합니다.
함께 들어 있는 글꼴과 라이브러리의 라이선스는 [LICENSES.md](LICENSES.md)를 보세요.
