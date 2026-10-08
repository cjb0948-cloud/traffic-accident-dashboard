const METRICS = {
  accidents: { label: '사고 건수', unit: '건', color: '#0b5d45' },
  deaths: { label: '사망자', unit: '명', color: '#b42318' },
  injuries: { label: '부상자', unit: '명', color: '#c98a00' },
};

const state = { year: null, metric: 'accidents' };
const charts = {};
let DATA = null;

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => Number(n).toLocaleString('ko-KR');

async function init() {
  try {
    const res = await fetch('data/accidents.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DATA = await res.json();
  } catch (err) {
    showNotice('data/accidents.json을 불러오지 못했습니다. GitHub Pages 주소나 로컬 서버(python -m http.server)에서 열어주세요.', true);
    return;
  }

  const years = Object.keys(DATA.years).map(Number).sort((a, b) => a - b);
  const select = $('#year');
  years.slice().reverse().forEach((y) => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '년';
    select.appendChild(opt);
  });
  state.year = years[years.length - 1];
  select.value = state.year;
  select.addEventListener('change', () => {
    state.year = Number(select.value);
    render();
  });

  document.querySelectorAll('.metric-bar button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.metric = btn.dataset.metric;
      document.querySelectorAll('.metric-bar button').forEach((b) =>
        b.setAttribute('aria-pressed', String(b === btn))
      );
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

function showNotice(text, isError) {
  const el = $('#notice');
  el.textContent = text;
  el.classList.toggle('error', !!isError);
  el.hidden = false;
}

function render() {
  const y = state.year;
  const m = state.metric;
  const M = METRICS[m];
  const d = DATA.years[y];

  renderKpis(y, d);

  $('#t-trend').textContent = '연도별 ' + M.label + ' 추이';
  $('#t-region').textContent = y + '년 시도별 ' + M.label;
  $('#t-type').textContent = y + '년 사고 유형별 ' + M.label;
  $('#t-month').textContent = y + '년 월별 ' + M.label;
  $('#t-hour').textContent = y + '년 시간대별 ' + M.label;

  const years = Object.keys(DATA.years).map(Number).sort((a, b) => a - b);
  drawChart('trend', {
    type: 'line',
    data: {
      labels: years.map((v) => v + '년'),
      datasets: [{
        data: years.map((v) => DATA.years[v].total[m]),
        borderColor: M.color,
        backgroundColor: M.color,
        borderWidth: 2.5,
        tension: 0.25,
        pointRadius: years.map((v) => (v === y ? 7 : 4)),
        pointBackgroundColor: years.map((v) => (v === y ? M.color : '#fff')),
        pointBorderColor: M.color,
        pointBorderWidth: 2,
      }],
    },
    options: baseOptions(M, false),
  });

  const region = d.region.slice().sort((a, b) => b[m] - a[m]);
  drawChart('region', barConfig(region.map((r) => r.name), region.map((r) => r[m]), M, true));

  const types = d.type.slice().sort((a, b) => b[m] - a[m]);
  drawChart('type', barConfig(types.map((r) => r.name), types.map((r) => r[m]), M, true));

  drawChart('month', barConfig(d.month.map((r) => r.label), d.month.map((r) => r[m]), M, false));
  drawChart('hour', barConfig(d.hour.map((r) => r.label), d.hour.map((r) => r[m]), M, false));
}

function renderKpis(y, d) {
  const t = d.total;
  $('#k-accidents').textContent = fmt(t.accidents) + '건';
  $('#k-deaths').textContent = fmt(t.deaths) + '명';
  $('#k-injuries').textContent = fmt(t.injuries) + '명';
  const rate = t.accidents ? (t.deaths / t.accidents) : 0;
  $('#s-accidents').textContent = y + '년';
  $('#s-deaths').textContent = '사고 1건당 ' + rate.toFixed(2) + '명';
  $('#s-injuries').textContent = y + '년';

  const prev = DATA.years[y - 1];
  const delta = $('#k-delta');
  const sub = $('#s-delta');
  sub.className = 'kpi-sub';
  if (!prev) {
    delta.textContent = '-';
    sub.textContent = '전년 자료 없음';
    return;
  }
  const diff = t.deaths - prev.total.deaths;
  const pct = prev.total.deaths ? (diff / prev.total.deaths) * 100 : 0;
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  delta.textContent = sign + fmt(Math.abs(diff)) + '명';
  sub.textContent = sign + Math.abs(pct).toFixed(1) + '% (' + (y - 1) + '년 ' + fmt(prev.total.deaths) + '명)';
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

function barConfig(labels, values, M, horizontal) {
  return {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: M.color, borderRadius: 2, maxBarThickness: 26 }] },
    options: baseOptions(M, horizontal),
  };
}

function drawChart(key, config) {
  if (charts[key]) charts[key].destroy();
  charts[key] = new Chart($('#c-' + key), config);
}

document.addEventListener('DOMContentLoaded', init);
