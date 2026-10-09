#!/usr/bin/env python3
"""한국도로교통공단 '지자체별 대상 교통사고 통계' API -> data/accidents.json

인증키는 환경변수 KOROAD_KEY 로만 읽습니다 (GitHub Secrets).
기본 주소는 도로교통공단 오픈API 포털(opendata.koroad.or.kr)이며, 공공데이터포털(data.go.kr)
주소를 쓰려면 저장소 Variables 에 KOROAD_ENDPOINT / KOROAD_KEY_PARAM(serviceKey) 를 등록합니다.

지역 코드: config/regions.csv 가 있으면 그 목록(시도코드,시군구코드)을 사용하고,
없으면 시도 단위로 시군구 코드를 비워서 한 번에 요청해 봅니다.
"""
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "accidents.json"
REGIONS_CSV = ROOT / "config" / "regions.csv"

ENDPOINT = os.environ.get("KOROAD_ENDPOINT") or "https://opendata.koroad.or.kr/data/rest/stt"
KEY_PARAM = os.environ.get("KOROAD_KEY_PARAM") or "authKey"
NUM_OF_ROWS = int(os.environ.get("NUM_OF_ROWS") or 100)

# 시도 코드 (4자리). 실제 코드표와 다르면 config/regions.csv 를 사용하세요.
SIDO = [1100, 2600, 2700, 2800, 2900, 3000, 3100, 3600, 4100, 4200, 4300, 4400, 4500, 4600, 4700, 4800, 4900]

NO_DATA_CODES = {"03"}  # 데이터 없음
OK_CODES = {"00", "0", "INFO-000"}

_key = ""
_shown = False


def die(msg):
    print("\n[실패] " + msg, file=sys.stderr)
    sys.exit(1)


def mask(text):
    return text.replace(_key, "***KEY***") if _key else text


def to_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def http_get(url):
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except urllib.error.URLError as e:
        die("서버에 연결하지 못했습니다: %s" % e.reason)


def find(obj, name):
    """중첩된 JSON에서 name 키를 처음 찾아 반환."""
    if isinstance(obj, dict):
        if name in obj:
            return obj[name]
        for v in obj.values():
            r = find(v, name)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = find(v, name)
            if r is not None:
                return r
    return None


def parse(status, body):
    """(code, msg, items, total) 반환. 형식이 JSON이든 XML이든 처리."""
    text = body.strip()
    if text.startswith("{") or text.startswith("["):
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            return "ERR", "JSON 해석 실패: " + text[:200], [], 0
        code = str(find(payload, "resultCode") or "")
        msg = str(find(payload, "resultMsg") or "")
        items = find(payload, "items") or []
        if isinstance(items, dict):
            items = items.get("item", [])
        if isinstance(items, dict):
            items = [items]
        total = to_int(find(payload, "totalCount"))
        return code or ("00" if items else "ERR"), msg, items, total
    if text.startswith("<"):
        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            return "ERR", "XML 해석 실패: " + text[:200], [], 0
        code = (root.findtext(".//resultCode") or "").strip()
        msg = (root.findtext(".//resultMsg") or "").strip()
        if not code:
            code = "ERR"
            msg = text[:300]
        items = [{c.tag: (c.text or "").strip() for c in it} for it in root.iter("item")]
        return code, msg, items, to_int(root.findtext(".//totalCount"))
    return "ERR", "HTTP %s: %s" % (status, text[:300]), [], 0


def request(year, sido, gugun, page):
    global _shown
    q = {KEY_PARAM: _key, "searchYearCd": year, "siDo": sido, "type": "json",
         "numOfRows": NUM_OF_ROWS, "pageNo": page}
    if gugun:
        q["guGun"] = gugun
    url = ENDPOINT + "?" + urllib.parse.urlencode(q)
    status, body = http_get(url)
    if not _shown:
        print("첫 호출 HTTP %s / 응답 앞부분: %s" % (status, mask(body[:300]).replace("\n", " ")))
        _shown = True
    return parse(status, body)


def fetch_region(year, sido, gugun):
    """한 지역(시도 또는 시군구)의 모든 항목을 반환."""
    out = []
    page = 1
    while True:
        code, msg, items, total = request(year, sido, gugun, page)
        if code in NO_DATA_CODES:
            return out, code, msg
        if code not in OK_CODES:
            return out, code, msg
        out.extend(items)
        if not items or page * NUM_OF_ROWS >= total:
            return out, "00", ""
        page += 1


def load_regions():
    if not REGIONS_CSV.exists():
        return [(str(s), "") for s in SIDO]
    rows = []
    with REGIONS_CSV.open(encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            low = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
            sido = next((v for k, v in low.items() if "sido" in k or "시도" in k and "명" not in k), "")
            gugun = next((v for k, v in low.items() if "gugun" in k or "시군구" in k and "명" not in k), "")
            if sido:
                rows.append((sido, gugun))
    if not rows:
        die("config/regions.csv 에서 시도/시군구 코드 열을 찾지 못했습니다. 열 이름을 siDo,guGun 으로 바꿔 주세요.")
    return rows


def main():
    global _key
    raw = os.environ.get("KOROAD_KEY", "").strip()
    if not raw:
        die("KOROAD_KEY 가 비어 있습니다. 저장소 Settings > Secrets and variables > Actions 에 "
            "이름 KOROAD_KEY 로 인증키를 등록하세요. (이름 오타와 공백 주의)")
    _key = urllib.parse.unquote(raw)

    this_year = date.today().year
    years = [int(y) for y in (os.environ.get("YEARS") or "").split(",") if y.strip()] \
        or list(range(this_year - 5, this_year))
    regions = load_regions()
    print("조회 연도: %s / 지역 요청 %d건 / 주소: %s" % (years, len(regions), ENDPOINT))

    classes = []
    result = {}
    for year in years:
        rows = {}
        national = {}
        bad = 0
        for sido, gugun in regions:
            items, code, msg = fetch_region(year, sido, gugun)
            if code not in OK_CODES and code not in NO_DATA_CODES:
                bad += 1
                if bad <= 3:
                    print("  경고: %s년 시도 %s 시군구 %s -> %s %s" % (year, sido, gugun or "(전체)", code, msg))
                continue
            for it in items:
                cls = it.get("acc_cl_nm") or "기타"
                if cls not in classes:
                    classes.append(cls)
                name = it.get("sido_sgg_nm") or ""
                rows[(name, cls)] = [name, classes.index(cls), to_int(it.get("acc_cnt")),
                                     to_int(it.get("dth_dnv_cnt")), to_int(it.get("injpsn_cnt"))]
                if cls not in national and it.get("tot_acc_cnt") not in (None, ""):
                    national[cls] = [to_int(it.get("tot_acc_cnt")), to_int(it.get("tot_dth_dnv_cnt")),
                                     to_int(it.get("tot_injpsn_cnt"))]
        print("%d년: %d행 수집 (실패 요청 %d건)" % (year, len(rows), bad))
        if rows:
            result[str(year)] = {"national": national, "rows": list(rows.values())}

    if not result:
        die("수집된 데이터가 0건입니다. 위의 '첫 호출 응답'과 '경고' 줄을 확인하세요. "
            "시도 단위 요청이 거절되면 config/regions.csv(시도코드,시군구코드)를 만들어 주세요. "
            "기존 data/accidents.json 은 그대로 둡니다.")

    kst = timezone(timedelta(hours=9))
    out = {
        "meta": {
            "source": "한국도로교통공단 지자체별 대상 교통사고 통계 (TAAS 기반)",
            "scope": "경찰에 접수된 인적 피해 교통사고 · 시군구 및 사고 종류별 집계",
            "updated": datetime.now(kst).strftime("%Y-%m-%d"),
            "sample": False,
        },
        "classes": classes,
        "years": result,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("저장 완료:", OUT)


if __name__ == "__main__":
    main()
