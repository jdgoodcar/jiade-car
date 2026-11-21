// 車輛比較：compare.html?ids=編號,編號（2～4 台），左右並排
import { loadI18n, tMaker, tName, tSpec, tOption, optionCodes, optionGroups } from './lib/i18n.js?v=63';
import { getDetail, getRecord, photoUrl, notAccepted } from './lib/encar.js?v=63';
import { getInspection } from './lib/inspect.js?v=63';
import { getRate } from './lib/rate.js?v=63';
import { calcPrice } from './lib/pricing.js?v=63';
import { $, fmt, wan, esc, ym, km, askLine } from './lib/ui.js?v=63';

// 回到最上面（往下滑一段後出現）
addEventListener('scroll', () => $('#toTop').classList.toggle('on', scrollY > 600), { passive: true });
$('#toTop').onclick = () => scrollTo({ top: 0, behavior: 'smooth' });

const ids = (new URLSearchParams(location.search).get('ids') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);

// 一台車整理成比較用的資料
async function loadCar(id, rate) {
  let d;
  try { d = await getDetail(id); } catch (e) { return { id, gone: true }; }
  const c = d.category || {}, s = d.spec || {}, ad = d.advertisement || {};
  if (ad.status && ad.status !== 'ADVERTISE') return { id, gone: true };
  const mk = tMaker(c.manufacturerName), model = tName(c.modelName);
  const mkEn = mk.en && mk.en !== c.manufacturerName && mk.en !== 'Others' ? mk.en : (c.manufacturerEnglishName || mk.en);
  const title = (model.toLowerCase().startsWith(mkEn.toLowerCase()) ? model : `${mkEn} ${model}`).trim();
  const pick = (ko, en) => { const t = tName(ko); return /[가-힣]/.test(t) && en ? en : t; };
  const sub = [pick(c.gradeName, c.gradeEnglishName), pick(c.gradeDetailName, c.gradeDetailEnglishName)].filter(Boolean).join(' ');
  const photo = (d.photos || []).filter(x => x.type !== 'THUMBNAIL').sort((a, b) => a.code.localeCompare(b.code))[0];
  const fuel = s.fuelName || '', cc = s.displacement || 0, no = notAccepted(fuel);
  const p = no ? null : calcPrice(ad.price, cc, rate);
  const [rec, insp] = await Promise.all([
    d.vehicleId && d.vehicleNo ? getRecord(d.vehicleId, d.vehicleNo).catch(() => null) : null,
    d.vehicleId ? getInspection(d.vehicleId).catch(() => null) : null,
  ]);
  return {
    id, title, sub, img: photo ? photoUrl(photo.path) : '', no, price: ad.price, twd: p ? p.price : 0,
    year: c.formYear || '', reg: c.yearMonth, km: s.mileage || 0, fuel, cc, tm: s.transmissionName,
    color: [tSpec('color', s.customColor), tSpec('color', s.colorName)].filter(Boolean).join(' '),
    body: tSpec('category', s.bodyName), seat: s.seatCount, region: tSpec('region', (d.contact && d.contact.address || '').split(' ')[0]),
    acc: insp && insp.master ? (insp.master.accdient ? '事故車' : '非事故車') : '無紀錄',
    accBad: !!(insp && insp.master && insp.master.accdient),
    claims: rec ? rec.myAccidentCnt || 0 : null, owners: rec ? rec.ownerChangeCnt || 0 : null,
    opts: new Set((d.options && d.options.standard) || []),
  };
}

let showAll = false;
function render(cars, rate) {
  const ok = cars.filter(c => !c.gone);
  // 最好的值標綠色：價格最低、里程最少、年式最新
  const best = (key, fn) => { const v = ok.map(c => c[key]).filter(x => x); return v.length > 1 ? fn(...v) : null; };
  const minTwd = best('twd', Math.min), minKm = best('km', Math.min), maxYear = best('year', Math.max);

  const head = cars.map(c => c.gone
    ? `<th class="cc sold"><div class="cimg"></div><b>已售出或下架</b><small>車輛編號 ${esc(c.id)}</small>${rm(c.id)}</th>`
    : `<th class="cc"><a href="detail.html?id=${encodeURIComponent(c.id)}"><div class="cimg">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : ''}</div><b>${esc(c.title)}</b><small>${esc(c.sub)}</small></a>${rm(c.id)}</th>`).join('');

  const row = (label, fn, cls = () => '') => `<tr><th>${label}</th>${cars.map(c => c.gone ? '<td class="na">—</td>' : `<td class="${cls(c)}">${fn(c)}</td>`).join('')}</tr>`;
  // 分類列：標題放在固定的左欄，左右滑動時不會跑掉
  const sec = (t, extra = '') => `<tr class="sec"><th>${t}</th><td colspan="${cars.length}">${extra}</td></tr>`;
  const sub = (t, extra = '') => `<tr class="sub"><th>${t}</th><td colspan="${cars.length}">${extra}</td></tr>`;

  // 配備：依 Encar 順序，預設只列出各台不同的項目
  const groups = optionGroups(), codes = optionCodes().filter(code => ok.some(c => c.opts.has(code)));
  const diff = codes.filter(code => !ok.every(c => c.opts.has(code)));
  const list = showAll ? codes : diff;
  let optRows = '', lastG = '';
  for (const code of list) {
    const o = tOption(code); if (!o) continue;
    if (showAll && o[0] !== lastG) { lastG = o[0]; optRows += sub(esc(groups[o[0]] || '')); }
    optRows += row(esc(o[1]), c => (c.opts.has(code) ? '<span class="y">✓</span>' : '<span class="n">—</span>'));
  }
  if (!list.length) optRows = `<tr><td colspan="${cars.length + 1}" class="note">${codes.length ? '這幾台的配備完全相同' : '沒有配備資料'}</td></tr>`;

  $('#app').innerHTML = `<p class="fine cmpnote">手機可左右滑動查看。綠色是這幾台中價格最低、里程最少、年式最新的。</p>
  <div class="cmpwrap"><table class="cmpt" style="--n:${cars.length}">
    <thead><tr><th class="lab"></th>${head}</tr></thead>
    <tbody>
      ${sec('價格')}
      ${row('預估車價', c => (c.no ? `<span class="bad">${c.no}<br>暫不接受代購</span>` : c.twd ? `<b class="big">約 ${wan(c.twd)} 萬</b>` : '—'), c => (c.twd && c.twd === minTwd ? 'best' : ''))}
      ${row('韓國售價', c => `${fmt(c.price)} 萬韓元`)}
      ${sec('基本資料')}
      ${row('年式', c => `${esc(c.year)} 年式`, c => (+c.year === maxYear ? 'best' : ''))}
      ${row('首次登錄', c => ym(c.reg))}
      ${row('里程', c => km(c.km), c => (c.km === minKm ? 'best' : ''))}
      ${row('燃料', c => esc(tSpec('fuel', c.fuel)))}
      ${row('排氣量', c => (c.cc ? `${fmt(c.cc)} cc` : '—'))}
      ${row('變速箱', c => esc(tSpec('transmission', c.tm) || '—'))}
      ${row('顏色', c => esc(c.color || '—'))}
      ${row('車身類型', c => esc(c.body || '—'))}
      ${row('座位', c => (c.seat ? `${c.seat} 人座` : '—'))}
      ${row('所在地', c => esc(c.region || '—'))}
      ${sec('車況')}
      ${row('事故車判定', c => c.acc, c => (c.accBad ? 'warn' : c.acc === '非事故車' ? 'okc' : ''))}
      ${row('保險理賠（本車）', c => (c.claims == null ? '—' : `${c.claims} 次`), c => (c.claims ? 'warn' : ''))}
      ${row('車主變更', c => (c.owners == null ? '—' : `${c.owners} 次`))}
      ${sec('配備', `<span class="optw"><span class="optn">${showAll ? `全部 ${codes.length} 項` : `只列出不同的 ${list.length} 項`}</span><button type="button" class="btn-s" id="optAll">${showAll ? '只看不同' : '顯示全部'}</button></span>`)}
      ${optRows}
    </tbody>
  </table></div>
  <p class="fine">資料取自 Encar，車況與配備以各車詳細頁及原始紀錄為準。預估車價未含手續費。</p>`;
  $('#optAll').onclick = () => { showAll = !showAll; render(cars, rate); };
  miniHead(cars);
}
const rm = id => (ids.length > 2 ? `<a class="rmc" href="compare.html?ids=${ids.filter(x => x !== id).map(encodeURIComponent).join(',')}" aria-label="移除這台" title="從比較中移除"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></a>` : '');

(async () => {
  if (ids.length < 2) { $('#app').innerHTML = '<div class="empty">請在「我的收藏」勾選 2～4 台車再比較<br><br><a class="btn-m" href="fav.html" style="text-decoration:none;display:inline-block">前往我的收藏</a></div>'; return; }
  $('#app').innerHTML = `<div class="empty">正在讀取 ${ids.length} 台車的資料…</div>`;
  await loadI18n();
  const rate = await getRate().catch(() => null);
  const cars = await Promise.all(ids.map(id => loadCar(id, rate)));
  render(cars, rate);
  const ok = cars.filter(c => !c.gone);
  if (ok.length) {
    $('#bar').hidden = false;
    $('#askCmp').onclick = () => {
      const L = ['您好，我想比較以下幾台車：'];
      ok.forEach((c, i) => L.push('', `${i + 1}. ${c.title} ${c.sub}`.trim(), `${c.year} 年式｜${km(c.km)}${c.twd ? `｜預估約 ${wan(c.twd)} 萬元` : ''}`, new URL(`detail.html?id=${c.id}`, location.href).href));
      askLine(L.join('\n'));
    };
  }
})();

// 往下捲、看不到上方車名時：頁首下方固定一條「哪台是哪台」的小標題，跟表格一起左右滑
let miniOff = null;
function miniHead(cars) {
  document.querySelector('.cmpmini')?.remove();
  if (miniOff) miniOff();
  const wrap = $('.cmpwrap'), ths = [...document.querySelectorAll('.cmpt thead th.cc')];
  const bar = document.createElement('div');
  bar.className = 'cmpmini'; bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = `<div class="mi-lab">比較</div><div class="mi-vp"><div class="mi-in">${cars.map(c => c.gone
    ? '<div class="mi-c"><span class="mi-t gone">已售出</span></div>'
    : `<div class="mi-c">${c.img ? `<img src="${esc(c.img)}" alt="">` : ''}<span class="mi-t">${esc(c.title)}</span></div>`).join('')}</div></div>`;
  document.body.appendChild(bar);
  const inner = bar.querySelector('.mi-in'), cells = [...inner.children];
  const layout = () => {
    const r = wrap.getBoundingClientRect(), lab = document.querySelector('.cmpt thead th.lab').getBoundingClientRect().width;
    bar.style.left = r.left + 'px'; bar.style.width = r.width + 'px';
    bar.querySelector('.mi-lab').style.width = lab + 'px';
    ths.forEach((th, i) => { cells[i].style.width = th.getBoundingClientRect().width + 'px'; });
    inner.style.transform = `translateX(${-wrap.scrollLeft}px)`;
  };
  const onH = () => { inner.style.transform = `translateX(${-wrap.scrollLeft}px)`; };
  wrap.addEventListener('scroll', onH, { passive: true });
  addEventListener('resize', layout);
  layout();
  // 點車名條的某一台：捲回表格頂端，並把那台的欄位滑到左欄旁邊
  cells.forEach((cell, i) => {
    cell.onclick = () => {
      const labW = document.querySelector('.cmpt thead th.lab').getBoundingClientRect().width;
      wrap.scrollTo({ left: Math.max(0, ths[i].offsetLeft - labW), behavior: 'smooth' });
      const y = scrollY + wrap.getBoundingClientRect().top - document.querySelector('.hd').offsetHeight - 8;
      scrollTo({ top: y, behavior: 'smooth' });
    };
  });
  // 表頭（照片＋車名）捲出畫面、但表格還在畫面上時才顯示
  const head = document.querySelector('.cmpt thead'), top = document.querySelector('.hd').offsetHeight;
  const check = () => {
    const h = head.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    bar.classList.toggle('on', h.bottom < top + 8 && w.bottom > top + 120);
  };
  addEventListener('scroll', check, { passive: true });
  check();
  miniOff = () => { wrap.removeEventListener('scroll', onH); removeEventListener('resize', layout); removeEventListener('scroll', check); };
}
