# 식단 달력

날짜별 섭취 칼로리를 기록하는 달력. https://namyikim.github.io/diet

- 달력의 각 날짜에 아침·점심·저녁·간식 칼로리와 하루 합계가 표시됩니다.
- 날짜를 누르면 바로 칼로리 입력 칸에 커서가 놓입니다. 칼로리와 먹은 것을 적으면 입력하는 즉시 저장됩니다.
- `+` 로 한 끼에 여러 줄을 추가할 수 있습니다(간식 여러 번 등). Enter 로 다음 칸 이동.

## 저장 방식

서버 없이 브라우저 `localStorage`(`diet.v1`)에 저장합니다. 기기·브라우저마다 따로 저장되므로,
옮기거나 보관하려면 페이지 하단의 **백업 파일 저장 / 백업 불러오기**를 사용하세요.

## 구조

정적 파일 3개 — `index.html`, `style.css`, `app.js`. 빌드 과정 없음.

## 배포

GitHub → Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `(root)`.
