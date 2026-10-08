#!/usr/bin/env python3
"""한국도로교통공단 사망교통사고정보 API -> data/accidents.json

인증키는 코드에 적지 않고 환경변수 KOROAD_KEY 로만 읽습니다.
(GitHub 저장소 Settings > Secrets and variables > Actions 에 등록)

주의: 이 스크립트는 공공데이터포털 명세를 기준으로 작성했지만, 인증키 없이는
실제 호출을 시험하지 못했습니다. 첫 실행 로그에 응답 필드명이 출력되니,
아래 [설정] 값과 다르면 그 부분만 고치면 됩니다.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

# ---------------- [설정] ----------------
ENDPOINT = "https://apis.data.go.kr/B552061/AccidentDeath/getRestTrafficAccidentDeath"
PARAM_YEAR = "searchYear"      # 연도 파라미터 이름 (명세서 확인)
PARAM_SIDO = "siDo"            # 시도 코드 파라미터 이름
NUM_OF_ROWS = 1000

# 시도 코드는 API 명세서의 코드표와 같은지 확인하세요.
SIDO = {
    "11": "서울", "26": "부산", "27": "대구", "28": "인천", "29": "광주",
    "30": "대전", "31": "울산", "36": "세종", "41": "경기", "42": "강원",
    "43": "충북", "44": "충남", "45": "전북", "46": "전남", "47": "경북",
    "48": "경남", "49": "제주",
}

# 응답 필드명 (여러 후보 중 먼저 있는 것을 사용)
F_DATETIME = ["occrrnc_dt", "occrrnc_date"]
F_DEATHS = ["dth_dnv_cnt"]
F_INJURIES = ["injpsn_cnt"]
F_INJURY_PARTS = ["serinjpsn_cnt", "slinjpsn_cnt", "wndpsn_cnt"]  # injpsn_cnt가 없을 때 합산
F_TYPE = ["acc_ty_lclas_nm", "acc_ty_nm"]
# ----------------------------------------

OUT = Path(__file__).resolve().parent.parent / "data" / "accidents.json"


def first(rec, keys, default=None):
    for k in keys:
        if k in rec and rec[k] not in (None, ""):
            return rec[k]
    return default


def to_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def call(key, year, sido, page):
    q = {
        "serviceKey": key,
        PARAM_YEAR: year,
        PARAM_SIDO: sido,
        "type": "json",
        "numOfRows": NUM_OF_ROWS,
        "pageNo": page,
    }
    url = ENDPOINT + "?" + urllib.parse.urlencode(q)
    with urllib.request.urlopen(url, timeout=60) as r:
        body = r.read().decode("utf-8")
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        sys.exit("JSON이 아닌 응답을 받았습니다 (인증키/파라미터 확인):\n" + body[:500])


def items_of(payload):
    resp = payload.get("response", payload)
    header = resp.get("header", {})
    code = str(header.get("resultCode", "00"))
    if code not in ("00", "0", "INFO-000"):
        sys.exit("API 오류: %s %s" % (code, header.get("resultMsg", "")))
    body = resp.get("body", {})
    items = body.get("items", [])
    if isinstance(items, dict):
        items = items.get("item", [])
    if isinstance(items, dict):
        items = [items]
    return items or [], to_int(body.get("totalCount", 0))


def collect(key, year):
    for code, name in SIDO.items():
        page = 1
        while True:
            items, total = items_of(call(key, year, code, page))
            for rec in items:
                yield name, rec
            if page * NUM_OF_ROWS >= total or not items:
                break
            page += 1


def blank():
    return {"accidents": 0, "deaths": 0, "injuries": 0}


def add(bucket, deaths, injuries):
    bucket["accidents"] += 1
    bucket["deaths"] += deaths
    bucket["injuries"] += injuries


def main():
    key_raw = os.environ.get("KOROAD_KEY", "").strip()
    if not key_raw:
        sys.exit("환경변수 KOROAD_KEY 가 비어 있습니다. GitHub Secrets에 인증키를 등록하세요.")
    key = urllib.parse.unquote(key_raw)  # Encoding 키를 넣어도 이중 인코딩되지 않게

    this_year = date.today().year
    years = [int(y) for y in os.environ.get("YEARS", "").split(",") if y.strip()] \
        or list(range(this_year - 4, this_year))

    result = {}
    printed_keys = False
    for year in years:
        region = defaultdict(blank)
        month = [blank() for _ in range(12)]
        hour = [blank() for _ in range(24)]
        types = defaultdict(blank)
        total = blank()
        n = 0
        for name, rec in collect(key, year):
            if not printed_keys:
                print("응답 필드:", sorted(rec.keys()))
                printed_keys = True
            deaths = to_int(first(rec, F_DEATHS, 0))
            inj = first(rec, F_INJURIES)
            injuries = to_int(inj) if inj is not None else sum(to_int(rec.get(k)) for k in F_INJURY_PARTS)
            dt = str(first(rec, F_DATETIME, ""))
            tname = first(rec, F_TYPE, "기타")
            add(total, deaths, injuries)
            add(region[name], deaths, injuries)
            add(types[tname], deaths, injuries)
            if len(dt) >= 6 and dt[4:6].isdigit() and 1 <= int(dt[4:6]) <= 12:
                add(month[int(dt[4:6]) - 1], deaths, injuries)
            if len(dt) >= 10 and dt[8:10].isdigit() and int(dt[8:10]) < 24:
                add(hour[int(dt[8:10])], deaths, injuries)
            n += 1
        print("%d년: %d건 수집" % (year, n))
        if n == 0:
            continue  # 아직 공개되지 않은 연도
        result[str(year)] = {
            "total": total,
            "region": [dict(name=k, **v) for k, v in region.items()],
            "month": [dict(label="%d월" % (i + 1), **v) for i, v in enumerate(month)],
            "hour": [dict(label="%d시" % i, **v) for i, v in enumerate(hour)],
            "type": [dict(name=k, **v) for k, v in types.items()],
        }

    if not result:
        sys.exit("수집된 데이터가 없습니다. 기존 파일을 그대로 둡니다.")

    kst = timezone(timedelta(hours=9))
    out = {
        "meta": {
            "source": "한국도로교통공단 사망교통사고정보 (공공데이터포털)",
            "scope": "집계 기준: 사망자가 발생한 교통사고(한국도로교통공단)",
            "updated": datetime.now(kst).strftime("%Y-%m-%d"),
            "sample": False,
        },
        "years": result,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("저장:", OUT)


if __name__ == "__main__":
    main()
