# 교통사고 현황판

한국도로교통공단 공공데이터로 만드는 정적 웹 현황판입니다. (GitHub Pages 배포용)

## 구성
- `index.html`, `style.css`, `app.js` : 화면
- `data/accidents.json` : 화면이 읽는 데이터 (지금은 **샘플**)
- `scripts/fetch_data.py` : 공공데이터 API에서 받아 `accidents.json` 생성
- `.github/workflows/update-data.yml` : 매주 월요일 자동 갱신

## 배포 순서
1. 이 폴더의 파일을 저장소 루트에 올립니다 (`.github` 폴더 포함).
2. 저장소 **Settings > Secrets and variables > Actions > New repository secret**
   - 이름 `KOROAD_KEY`, 값은 공공데이터포털 인증키 (채팅이나 코드에 적지 마세요)
3. **Actions 탭 > 데이터 갱신 > Run workflow** 로 첫 실행. 로그의 `응답 필드:` 줄을
   `scripts/fetch_data.py` 상단 [설정]과 비교해 다르면 그 부분만 수정합니다.
4. **Settings > Pages > Branch: main / (root)** 로 배포합니다.

## 로컬 미리보기
`python -m http.server` 실행 후 http://localhost:8000
