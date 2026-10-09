const METRICS = {
  accidents: { label: '사고 건수', unit: '건', color: '#0b5d45', i: 0 },
  deaths: { label: '사망자', unit: '명', color: '#b42318', i: 1 },
  injuries: { label: '부상자', unit: '명', color: '#c98a00', i: 2 },
};
const SHORT = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천', '광주광역시': '광주',
  '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기', '강원도': '강원',
  '강원특별자치도': '강원', '충청북도': '충북', '충청남도': '충남', '전라북도': '전북', '전북특별자치도': '전북',
  '전라남도': '전남', '경상북도': '경북', '경상남도': '경남', '제주특별자치도': '제주', '제주도': '제주',
};
const ALL = '전국';

const state = { year: null, metric: 'accidents', cls: null, sido: ALL };
const charts = {};
let DATA = null;

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Number(n).toLocaleString('ko-KR');
const sidoOf = (name) => { const t = name.split(' ')[0]; return SHORT[t] || t; };
const restOf = (name) => name.split(' ').slice(1).join(' ') || name;

async function init() {
  try {
    const res = await fetch('data/accidents.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DATA = await res.json();
  } catch (err) {
    showNotice('data/accidents.json을 불러오지 못했습니다. GitHub Pages 주소나 로컬 서버(python -m http.server)에서 열어주세요.', true);
    return;
  }

  const years = yearList();
  const yearSel = $('#year');
  years.slice().reverse().forEach((y) => yearSel.appendChild(new Option(y + '년', y)));
  state.year = years[years.length - 1];
  yearSel.value = state.year;
  yearSel.addEventListener('change', () => { state.year = Number(yearSel.value); fillSido(); render(); });

  const clsSel = $('#cls');
  DATA.classes.forEach((c) => clsSel.appendChild(new Option(c, c)));
  state.cls = DATA.classes.includes('전체사고') ? '전체사고' : DATA.classes[0];
  clsSel.value = state.cls;
  clsSel.addEventListener('change', () => { state.cls = clsSel.value; render(); });

  $('#sido').addEventListener('change', (e) => { state.sido = e.target.value; render(); });
  fillSido();

  document.querySelectorAll('.metric-bar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.metric = btn.dataset.metric;
      document.querySelectorAll('.metric-bar button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      render();
    });
  });

  const meta = DATA.meta || {};
  if (meta.scope) $('#scope').textContent = meta.scope;
  if (meta.source) $('#source').textContent = '출처: ' + meta.source;
  if (meta.updated) $('#updated').textContent = '데이터 갱신일: ' + meta.updated;
  if (meta.sample) {
    showNotice('지금 보이는 숫자는 화면 확인용 샘플입니다. 공공데이터 API 인증키를 연결해 데이터를 갱신하면 실제 통계로 바뀝니다.', false);
  }

  Chart.defaults.font.family = 'Pretendard, "Malgun Gothic", sans-serif';
  Chart.defaults.color = '#5e6a70';
  Chart.defaults.animation = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 };

  render();
}

function yearList() { return Object.keys(DATA.years).map(Number).sort((a, b) => a - b); }

function showNotice(text, isError) {
  const el = $('#notice');
  el.textContent = text;
  el.classList.toggle('error', !!isError);
  el.hidden = false;
}

function fillSido() {
  const sel = $('#sido');
  const names = [];
  DATA.years[state.year].rows.forEach((r) => { const s = sidoOf(r[0]); if (!names.includes(s)) names.push(s); });
  sel.innerHTML = '';
  [ALL, ...names].forEach((n) => sel.appendChild(new Option(n, n)));
  if (![ALL, ...names].includes(state.sido)) state.sido = ALL;
  sel.value = state.sido;
}

function render() {
  const y = state.year;
  const M = METRICS[state.metric];
  const d = DATA.years[y];
  const clsIdx = DATA.classes.indexOf(state.cls);
  const rows = d.rows.filter((r) => r[1] === clsIdx);

  renderKpis(y, d);

  $('#t-trend').textContent = '연도별 ' + state.cls + ' ' + M.label + ' 추이 (전국)';
  $('#t-classes').textContent = y + '년 사고 종류별 ' + M.label + ' (전국)';
  $('#t-region').textContent = y + '년 시도별 ' + state.cls + ' ' + M.label;
  $('#t-top').textContent = y + '년 ' + (state.sido === ALL ? '전국' : state.sido) + ' ' + state.cls + ' ' + M.label + ' 상위 15개 시군구';

  const years = yearList();
  const natVal = (yr, c) => { const n = DATA.years[yr].national[c]; return n ? n[M.i] : null; };
  drawChart('trend', {
    type: 'line',
    data: {
      labels: years.map((v) => v + '년'),
      datasets: [{
        data: years.map((v) => natVal(v, state.cls)),
        borderColor: M.color, backgroundColor: M.color, borderWidth: 2.5, tension: 0.25,
        pointRadius: years.map((v) => (v === y ? 7 : 4)),
        pointBackgroundColor: years.map((v) => (v === y ? M.color : '#fff')),
        pointBorderColor: M.color, pointBorderWidth: 2,
      }],
    },
    options: baseOptions(M, false),
  });

  const cl = DATA.classes.filter((c) => d.national[c]).map((c) => [c, d.national[c][M.i]]).sort((a, b) => b[1] - a[1]);
  drawChart('classes', barConfig(cl.map((r) => r[0]), cl.map((r) => r[1]), M, true,
    cl.map((r) => (r[0] === state.cls ? M.color : M.color + '66'))));

  const bySido = {};
  rows.forEach((r) => { const s = sidoOf(r[0]); bySido[s] = (bySido[s] || 0) + r[2 + M.i]; });
  const sd = Object.entries(bySido).sort((a, b) => b[1] - a[1]);
  drawChart('region', barConfig(sd.map((r) => r[0]), sd.map((r) => r[1]), M, true,
    sd.map((r) => (state.sido !== ALL && r[0] === state.sido ? M.color : M.color + (state.sido === ALL ? '' : '66')))));

  const top = rows.filter((r) => state.sido === ALL || sidoOf(r[0]) === state.sido)
    .sort((a, b) => b[2 + M.i] - a[2 + M.i]).slice(0, 15);
  drawChart('top', barConfig(
    top.map((r) => (state.sido === ALL ? sidoOf(r[0]) + ' ' + restOf(r[0]) : restOf(r[0]))),
    top.map((r) => r[2 + M.i]), M, true));
}

function renderKpis(y, d) {
  const cur = d.national[state.cls];
  $('#l-accidents').textContent = state.cls + ' 건수';
  ['accidents', 'deaths', 'injuries'].forEach((k, i) => {
    $('#k-' + k).textContent = cur ? fmt(cur[i]) + (i === 0 ? '건' : '명') : '-';
    $('#s-' + k).textContent = '전국 ' + y + '년';
  });
  const sub = $('#s-delta');
  const delta = $('#k-delta');
  sub.className = 'kpi-sub';
  const prev = DATA.years[y - 1] && DATA.years[y - 1].national[state.cls];
  if (!cur || !prev) { delta.textContent = '-'; sub.textContent = '전년 자료 없음'; return; }
  const diff = cur[1] - prev[1];
  const pct = prev[1] ? (diff / prev[1]) * 100 : 0;
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  delta.textContent = sign + fmt(Math.abs(diff)) + '명';
  sub.textContent = sign + Math.abs(pct).toFixed(1) + '% (' + (y - 1) + '년 ' + fmt(prev[1]) + '명)';
  if (diff < 0) sub.classList.add('good');
  if (diff > 0) sub.classList.add('bad');
}

function baseOptions(M, horizontal) {
  const valueScale = { beginAtZero: true, grid: { color: '#e3e6e1' }, ticks: { callback: (v) => fmt(v) } };
  const labelScale = { grid: { display: false } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => M.label + ' ' + fmt(horizontal ? ctx.parsed.x : ctx.parsed.y) + M.unit } },
    },
    scales: horizontal ? { x: valueScale, y: labelScale } : { x: labelScale, y: valueScale },
  };
}

function barConfig(labels, values, M, horizontal, colors) {
  return {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors || M.color, borderRadius: 2, maxBarThickness: 26 }] },
    options: baseOptions(M, horizontal),
  };
}

function drawChart(key, config) {
  if (charts[key]) charts[key].destroy();
  charts[key] = new Chart($('#c-' + key), config);
}

document.addEventListener('DOMContentLoaded', init);
