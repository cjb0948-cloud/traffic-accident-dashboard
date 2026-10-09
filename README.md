# 교통사고 현황판

한국도로교통공단 「지자체별 대상 교통사고 통계」 API로 만드는 정적 웹 현황판입니다. (GitHub Pages 배포용)
사고 종류(전체·어린이·고령자·보행자·자전거·야간·스쿨존 등) × 시군구 × 연도별로 사고 건수, 사망자, 부상자를 보여줍니다.

## 구성
- `index.html`, `style.css`, `app.js` : 화면
- `data/accidents.json` : 화면이 읽는 데이터 (처음에는 **샘플**, 수집에 성공하면 실제 통계로 교체됨)
- `scripts/fetch_data.py` : API에서 받아 `accidents.json` 생성
- `.github/workflows/update-data.yml` : 매주 월요일 자동 갱신 (수동 실행도 가능)
- `config/regions.csv.example` : 지역 코드 파일 예시 (필요할 때만 사용)

## 설정
1. 저장소 **Settings > Secrets and variables > Actions > Secrets** 에 `KOROAD_KEY` 등록 (인증키)
2. 인증키를 받은 곳에 따라
   - **opendata.koroad.or.kr(도로교통공단 포털)**: 추가 설정 없음 (기본값)
   - **data.go.kr(공공데이터포털)**: **Variables** 탭에 `KOROAD_ENDPOINT`(요청주소), `KOROAD_KEY_PARAM`(`serviceKey`) 등록
3. **Actions > 데이터 갱신 > Run workflow** 실행 후 로그 확인
   - 시도 단위 요청이 거절되면 `config/regions.csv.example` 을 `regions.csv` 로 바꾸고,
     API 화면의 "요청변수 코드" 파일을 보고 `siDo,guGun` 코드를 채웁니다.
4. **Settings > Pages > Branch: main / (root)** 로 배포

## 로컬 미리보기
`python -m http.server` 실행 후 http://localhost:8000
