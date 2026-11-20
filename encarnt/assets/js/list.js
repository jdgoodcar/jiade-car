// 選車列表頁
import { loadI18n, tMaker, tName, tSpec, specTable } from './lib/i18n.js';
import { searchCars, hierarchy, getDetail, photoUrl, isEv, isDiesel, notAccepted } from './lib/encar.js';
import { getRate } from './lib/rate.js';
import { calcPrice, guessCc, manForTwd } from './lib/pricing.js';
import { $, fmt, wan, esc, km, carTitle, toast, isTouch } from './lib/ui.js';

if (isTouch) $('#hdLine').removeAttribute('target'); // 手機在同一頁開 LINE，App 才會直接跳出

const PAGE = 20;
const EX_ALL = ['diesel', 'ev', 'acc']; // 預設排除：柴油、電動、事故車
const EX_LABEL = { diesel: '柴油車', ev: '電動車', acc: '事故車' };
const MULTI = ['fuel', 'tm', 'cat', 'color', 'rg'];
const NUMS = ['y1', 'y2', 'km', 't1', 't2'];
const KM_OPTS = [10000, 30000, 50000, 80000, 100000, 150000];
const TWD_OPTS = [30, 50, 80, 100, 120, 150, 200, 250, 300, 400, 500, 700, 1000]; // 萬
const thisYear = new Date().getFullYear();

let f = readUrl();
let sort = f.sort || 'new'; delete f.sort;
let rate = null, offset = 0, total = 0, loading = false, ctl = null, seq = 0;

// ---------- 網址 ↔ 篩選條件（可分享、按上一頁會保留） ----------
function readUrl() {
  const p = new URLSearchParams(location.search), o = { ct: p.get('ct') || 'A' };
  for (const k of ['mk', 'mg', 'md', 'sort']) if (p.get(k)) o[k] = p.get(k);
  for (const k of MULTI) if (p.get(k)) o[k] = p.get(k).split(',');
  for (const k of NUMS) if (+p.get(k)) o[k] = +p.get(k);
  o.ex = p.has('ex') ? p.get('ex').split(',').filter(x => EX_ALL.includes(x)) : EX_ALL.slice();
  return o;
}
function writeUrl() {
  const p = new URLSearchParams();
  if (f.ct !== 'A') p.set('ct', f.ct);
  for (const k of ['mk', 'mg', 'md']) if (f[k]) p.set(k, f[k]);
  for (const k of MULTI) if (f[k] && f[k].length) p.set(k, f[k].join(','));
  for (const k of NUMS) if (f[k]) p.set(k, f[k]);
  if ((f.ex || []).slice().sort().join() !== EX_ALL.slice().sort().join()) p.set('ex', (f.ex || []).join(',') || 'none');
  if (sort !== 'new') p.set('sort', sort);
  const s = p.toString();
  history.replaceState(null, '', s ? '?' + s : location.pathname);
}
const stateKey = () => location.search || '-';

// 台幣車價（萬）→ Encar 價格（萬韓元）
function encarFilter() {
  const q = { ...f };
  if (rate && f.t1) q.p1 = manForTwd(f.t1 * 10000, rate);
  if (rate && f.t2) q.p2 = manForTwd(f.t2 * 10000, rate);
  return q;
}

// ---------- 排氣量：先從車名猜，猜不到再讀詳細資料 ----------
// 為了不對 Encar 造成大量請求：只查「捲到畫面上」的車、最多同時 2 筆、查過的記在手機裡（最多 3000 筆）
const CC_KEY = 'encarnt_cc';
let ccMap = {}; try { ccMap = JSON.parse(localStorage.getItem(CC_KEY)) || {}; } catch (e) { ccMap = {}; }
const saveCc = () => {
  const keys = Object.keys(ccMap); if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete ccMap[k];
  try { localStorage.setItem(CC_KEY, JSON.stringify(ccMap)); } catch (e) { /* 略過 */ }
};
const ccSeen = new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) { ccSeen.unobserve(e.target); const c = e.target._car; if (c && !(c.Id in ccMap)) queueCc(c, e.target); }
}, { rootMargin: '200px' });
function ccOf(c) {
  if (c.Id in ccMap) return ccMap[c.Id];
  if (/전기|수소/.test(c.FuelType || '') && !/\+/.test(c.FuelType || '')) return 0; // 純電、氫能：沒有排氣量
  return guessCc(c.Badge, c.BadgeDetail, c.Model);
}
const ccQueue = []; let ccRunning = 0;
function queueCc(c, el) { ccQueue.push([c, el]); pumpCc(); }
function pumpCc() {
  while (ccRunning < 2 && ccQueue.length) {
    const [c, el] = ccQueue.shift(); ccRunning++;
    getDetail(c.Id).then(d => {
      ccMap[c.Id] = (d.spec && d.spec.displacement) || 0; saveCc();
      if (el.isConnected) el.querySelector('.pr').outerHTML = priceHtml(c);
    }).catch(() => { /* 維持「約」 */ }).finally(() => { ccRunning--; pumpCc(); });
  }
}

// ---------- 卡片 ----------
function priceHtml(c) {
  const no = notAccepted(c.FuelType);
  if (no) return `<div class="pr"><div><div class="l">預估車價</div><div class="v no">${no}暫不接受代購</div></div><div class="k">韓國售價<br>${fmt(c.Price)} 萬韓元</div></div>`;
  const p = calcPrice(c.Price, ccOf(c), rate);
  const krw = `韓國售價<br>${fmt(c.Price)} 萬韓元`;
  if (!p) return `<div class="pr"><div><div class="l">預估車價</div><div class="v">—</div></div><div class="k">${krw}</div></div>`;
  const tag = p.lux ? '<span class="lux">含奢侈稅</span>' : (!p.ccKnown ? '<span class="approx">約</span>' : '');
  return `<div class="pr"><div><div class="l">預估車價 ${tag}</div><div class="v">${wan(p.price)}<small> 萬</small></div></div><div class="k">${krw}</div></div>`;
}
function cardHtml(c) {
  const t = carTitle(c.Manufacturer, c.Model, c.Badge, c.BadgeDetail);
  const img = c.Photos && c.Photos[0] ? photoUrl(c.Photos[0].location) : (c.Photo ? photoUrl(c.Photo + '001.jpg') : '');
  const specs = [km(c.Mileage), tSpec('fuel', c.FuelType), tSpec('transmission', c.Transmission), tSpec('region', c.OfficeCityState)].filter(Boolean);
  return `<a class="car" href="detail.html?id=${encodeURIComponent(c.Id)}" data-id="${esc(c.Id)}">
    <div class="ph">${img ? `<img src="${esc(img)}" alt="${esc(t.title)}" loading="lazy" decoding="async" width="640" height="480">` : ''}<span class="yr">${esc(c.FormYear || String(c.Year).slice(0, 4))} 年式</span></div>
    <div class="bd"><h3>${esc(t.title)}</h3><div class="sub">${esc(t.sub || t.makerZh)}</div>
    <div class="specs">${specs.map(s => `<span>${esc(s)}</span>`).join('')}</div>${priceHtml(c)}</div></a>`;
}
const skeleton = n => Array.from({ length: n }, () => '<div class="car sk"><div class="ph"></div><div class="bd"><div class="ln" style="width:80%"></div><div class="ln" style="width:55%"></div><div class="ln" style="width:40%;height:22px;margin-top:10px"></div></div></div>').join('');

// ---------- 讀取列表 ----------
async function load(reset, size = PAGE) {
  if (reset) { offset = 0; if (ctl) ctl.abort(); loading = false; }
  if (loading) return;
  loading = true; const my = ++seq; ctl = new AbortController();
  const grid = $('#grid');
  if (reset) { grid.innerHTML = skeleton(6); $('#total').textContent = '—'; }
  $('#more').hidden = true;
  try {
    const { total: t, cars } = await searchCars(encarFilter(), sort, offset, size, ctl.signal);
    if (my !== seq) return;
    total = t; $('#total').textContent = fmt(t);
    if (reset) grid.innerHTML = '';
    if (!cars.length && offset === 0) grid.innerHTML = '<div class="empty">沒有符合條件的車輛，試試放寬篩選條件</div>';
    const frag = document.createElement('div'); frag.innerHTML = cars.map(cardHtml).join('');
    for (const el of [...frag.children]) {
      const c = cars.find(x => String(x.Id) === el.dataset.id);
      if (c && !notAccepted(c.FuelType) && ccOf(c) == null && c.Price * 10000 < 7e7) { el._car = c; ccSeen.observe(el); }
      grid.appendChild(el);
    }
    offset += cars.length;
    $('#more').hidden = offset >= total;
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (offset === 0) grid.innerHTML = '<div class="err"><b>暫時無法連線 Encar</b>請檢查網路後再試一次<br><br><button class="btn-m" type="button" id="retry">重新整理</button></div>';
    else toast('載入失敗，請再試一次');
    $('#more').hidden = offset === 0;
    const r = $('#retry'); if (r) r.onclick = () => load(true);
  } finally { if (my === seq) loading = false; }
}

// 無限捲動：接近底部自動載入下一批
new IntersectionObserver(es => { if (es[0].isIntersecting && !loading && offset > 0 && offset < total) load(false); }, { rootMargin: '600px' }).observe($('#sentinel'));
$('#more').onclick = () => load(false);

// 進入詳細頁前記住捲動位置，按上一頁回來時還原
$('#grid').addEventListener('click', e => {
  if (!e.target.closest('.car')) return;
  try { sessionStorage.setItem('encarnt_back', JSON.stringify({ k: stateKey(), n: offset, y: scrollY })); } catch (er) { /* 略過 */ }
});

// ---------- 廠牌／車系／車型 ----------
function fillSelect(sel, items, label, allText) {
  sel.innerHTML = `<option value="">${allText}</option>` + items.map(x => `<option value="${esc(x.value)}">${esc(label(x))}（${fmt(x.count)}）</option>`).join('');
}
async function loadHierarchy() {
  const mk = $('#mk'), mg = $('#mg'), md = $('#md');
  try {
    const makers = await hierarchy(f, 'mk');
    // 廠牌選單：最上面放「熱門廠牌」（台數最多的 8 個），下面依英文字母排列全部廠牌
    const mkLabel = x => { const m = tMaker(x.value); return m.zh.includes(m.en) ? m.zh : `${m.zh} ${m.en}`; };
    const opt = x => `<option value="${esc(x.value)}">${esc(mkLabel(x))}（${fmt(x.count)}）</option>`;
    // 賓士、BMW 固定在最前面，其餘依台數
    const PIN = ['벤츠', 'BMW'];
    const pinned = PIN.map(v => makers.find(x => x.value === v && x.count > 0)).filter(Boolean);
    const hot = pinned.concat(makers.filter(x => x.count > 0 && !PIN.includes(x.value)).sort((a, b) => b.count - a.count)).slice(0, 8);
    const az = makers.slice().sort((a, b) => tMaker(a.value).en.localeCompare(tMaker(b.value).en));
    mk.innerHTML = '<option value="">全部廠牌</option>' +
      (makers.length > 12 ? `<optgroup label="🔥 熱門廠牌">${hot.map(opt).join('')}</optgroup><optgroup label="全部廠牌（A–Z）">${az.map(opt).join('')}</optgroup>` : az.map(opt).join(''));
    mk.value = f.mk || '';
    if (f.mk && mk.value !== f.mk) { delete f.mk; delete f.mg; delete f.md; }
    mg.disabled = !f.mk; md.disabled = !f.mg;
    if (f.mk) {
      fillSelect(mg, await hierarchy(f, 'mg'), x => tName(x.value) !== x.value ? tName(x.value) : (x.en || x.value), '全部車系');
      mg.value = f.mg || '';
    } else mg.innerHTML = '<option value="">全部車系</option>';
    if (f.mk && f.mg) {
      fillSelect(md, await hierarchy(f, 'md'), x => tName(x.value), '全部車型');
      md.value = f.md || '';
    } else md.innerHTML = '<option value="">全部車型</option>';
  } catch (e) { /* 選單讀不到時，列表仍可使用 */ }
}
$('#mk').onchange = e => { f.mk = e.target.value || undefined; delete f.mg; delete f.md; apply(true); };
$('#mg').onchange = e => { f.mg = e.target.value || undefined; delete f.md; apply(true); };
$('#md').onchange = e => { f.md = e.target.value || undefined; apply(false); };
$('#sort').onchange = e => { sort = e.target.value; apply(false); };

// 產地分頁（顯示台數）
async function loadCounts() {
  const ex = (f.ex || []).join();
  let c = null; try { c = JSON.parse(sessionStorage.getItem('encarnt_counts')); } catch (e) { /* 無 */ }
  if (!c || c.ex !== ex || Date.now() - c.t > 10 * 60 * 1000) {
    c = { t: Date.now(), ex };
    await Promise.all(['A', 'Y', 'N'].map(ct => searchCars({ ct, ex: f.ex }, 'new', 0, 1).then(r => { c[ct] = r.total; }).catch(() => {})));
    if (c.A) try { sessionStorage.setItem('encarnt_counts', JSON.stringify(c)); } catch (e) { /* 略過 */ }
  }
  for (const ct of ['A', 'Y', 'N']) if (c[ct]) $('#c' + ct).textContent = fmt(c[ct]) + ' 台';
}
$('#ct').onclick = e => {
  const b = e.target.closest('button'); if (!b || b.dataset.v === f.ct) return;
  f.ct = b.dataset.v; delete f.mk; delete f.mg; delete f.md; apply(true);
};

// ---------- 更多篩選 ----------
const LABEL = {
  fuel: v => tSpec('fuel', v), tm: v => tSpec('transmission', v), cat: v => tSpec('category', v),
  color: v => tSpec('color', v), rg: v => tSpec('region', v),
};
const SPEC_KIND = { fuel: 'fuel', tm: 'transmission', cat: 'category', color: 'color', rg: 'region' };
let draft = null;
function buildSheet() {
  for (const box of document.querySelectorAll('.chips[data-k]')) {
    const k = box.dataset.k;
    const vals = Object.keys(specTable(SPEC_KIND[k])).filter(v => !(k === 'fuel' && v === 'LPG') && v !== '무광');
    box.innerHTML = vals.map(v => `<button type="button" class="chip" data-v="${esc(v)}">${esc(LABEL[k](v))}</button>`).join('');
    box.onclick = e => { const b = e.target.closest('.chip'); if (!b) return; const a = draft[k] || (draft[k] = []); const v = b.dataset.v, i = a.indexOf(v);
      if (i < 0) { a.push(v); if (k === 'fuel') draft.ex = draft.ex.filter(x => !(x === 'diesel' && isDiesel(v)) && !(x === 'ev' && isEv(v))); } else a.splice(i, 1);
      syncSheet(); };
  }
  $('#kmC').innerHTML = KM_OPTS.map(v => `<button type="button" class="chip" data-v="${v}">${v / 10000} 萬公里以下</button>`).join('');
  $('#kmC').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; draft.km = draft.km === +b.dataset.v ? undefined : +b.dataset.v; syncSheet(); };
  const years = []; for (let y = thisYear + 1; y >= 2000; y--) years.push(y);
  $('#y1').innerHTML = '<option value="">不限</option>' + years.map(y => `<option>${y}</option>`).join('');
  $('#y2').innerHTML = $('#y1').innerHTML;
  const tw = TWD_OPTS.map(v => `<option value="${v}">${v} 萬</option>`).join('');
  $('#t1').innerHTML = '<option value="">不限</option>' + tw; $('#t2').innerHTML = '<option value="">不限</option>' + tw;
  for (const k of ['y1', 'y2', 't1', 't2']) $('#' + k).onchange = e => { draft[k] = +e.target.value || undefined; };
}
function syncSheet() {
  for (const box of document.querySelectorAll('.chips[data-k]')) {
    const a = draft[box.dataset.k] || [];
    for (const b of box.children) b.classList.toggle('on', a.includes(b.dataset.v));
  }
  for (const b of $('#kmC').children) b.classList.toggle('on', +b.dataset.v === draft.km);
  for (const k of ['y1', 'y2', 't1', 't2']) $('#' + k).value = draft[k] || '';
}
function openSheet() { draft = JSON.parse(JSON.stringify(f)); syncSheet(); $('#sheet').hidden = false; document.body.classList.add('lock'); }
function closeSheet() { $('#sheet').hidden = true; document.body.classList.remove('lock'); }
$('#openF').onclick = openSheet;
$('#closeF').onclick = closeSheet;
$('#sheet').onclick = e => { if (e.target.id === 'sheet') closeSheet(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
$('#resetF').onclick = () => { for (const k of [...MULTI, ...NUMS]) delete draft[k]; syncSheet(); };
$('#applyF').onclick = () => {
  if (draft.y1 && draft.y2 && draft.y1 > draft.y2) [draft.y1, draft.y2] = [draft.y2, draft.y1];
  if (draft.t1 && draft.t2 && draft.t1 > draft.t2) [draft.t1, draft.t2] = [draft.t2, draft.t1];
  const exChanged = draft.ex.join() !== (f.ex || []).join();
  f = draft; closeSheet(); apply(true); if (exChanged) loadCounts();
};

// 已選條件標籤（點一下移除）
function renderTags() {
  const tags = [];
  for (const k of MULTI) for (const v of f[k] || []) tags.push([k, v, LABEL[k](v)]);
  if (f.y1 || f.y2) tags.push(['y', '', !f.y1 ? `${f.y2} 年以前` : !f.y2 ? `${f.y1} 年以後` : `${f.y1}～${f.y2} 年`]);
  if (f.km) tags.push(['km', '', `${f.km / 10000} 萬公里以下`]);
  if (f.t1 || f.t2) tags.push(['t', '', !f.t1 ? `車價 ${f.t2} 萬以下` : !f.t2 ? `車價 ${f.t1} 萬以上` : `車價 ${f.t1}～${f.t2} 萬`]);
  const n = tags.length; $('#fN').hidden = !n; $('#fN').textContent = n;
  // 打勾＝結果中也顯示這類車；預設都不打勾（不顯示）
  // 亮＝排除這類車（預設，顯示「不含X」）；暗＝不排除（顯示「搜尋包含X」）
  $('#exT').innerHTML = EX_ALL.map(v => { const on = (f.ex || []).includes(v); return `<button type="button" class="tog${on ? ' on' : ''}" data-v="${v}" aria-pressed="${on}">${on ? '不含' : '搜尋包含'}${EX_LABEL[v]}</button>`; }).join('');
  $('#tags').innerHTML = tags.map(([k, v, l]) => `<button type="button" class="tag" data-k="${k}" data-v="${esc(v)}">${esc(l)}</button>`).join('') +
    (n > 1 ? '<button type="button" class="tag clr" data-k="all">全部清除</button>' : '');
}
$('#exT').onclick = e => {
  const b = e.target.closest('.tog'); if (!b) return;
  const v = b.dataset.v, i = f.ex.indexOf(v);
  i < 0 ? f.ex.push(v) : f.ex.splice(i, 1);
  if (i < 0 && v !== 'acc' && f.fuel) f.fuel = f.fuel.filter(x => !(v === 'diesel' && isDiesel(x)) && !(v === 'ev' && isEv(x)));
  apply(true); loadCounts();
};
$('#tags').onclick = e => {
  const b = e.target.closest('.tag'); if (!b) return;
  const k = b.dataset.k, v = b.dataset.v;
  if (k === 'all') { for (const x of [...MULTI, ...NUMS]) delete f[x]; f.ex = EX_ALL.slice(); }
  else if (k === 'y') { delete f.y1; delete f.y2; } else if (k === 't') { delete f.t1; delete f.t2; } else if (k === 'km') delete f.km;
  else f[k] = (f[k] || []).filter(x => x !== v);
  apply(true);
};

function syncControls() {
  for (const b of $('#ct').children) { const on = b.dataset.v === f.ct; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }
  $('#sort').value = sort;
  renderTags();
}

function apply(reloadMenus) {
  for (const k of MULTI) if (f[k] && !f[k].length) delete f[k];
  writeUrl(); syncControls(); load(true);
  if (reloadMenus) loadHierarchy();
  scrollTo({ top: Math.min(scrollY, $('.panel').offsetTop - 70), behavior: 'smooth' });
}

function showRate() {
  $('#rate').textContent = rate
    ? `匯率 1 美元＝${rate.usdKrw.toFixed(2)} 韓元／${rate.usdTwd.toFixed(3)} 台幣${rate.stale ? '（暫存）' : ''}`
    : '匯率讀取失敗，暫時無法換算台幣';
}

// ---------- 往下滑時：上方快速列（廠牌／車系／篩選）＋回到最上面 ----------
function syncQuick() {
  for (const [q, m] of [['#qmk', '#mk'], ['#qmg', '#mg']]) {
    const qs = $(q), ms = $(m);
    qs.innerHTML = ms.innerHTML; qs.value = ms.value; qs.disabled = ms.disabled;
  }
  const n = $('#fN'); $('#qN').hidden = n.hidden; $('#qN').textContent = n.textContent;
}
for (const [q, m] of [['#qmk', '#mk'], ['#qmg', '#mg']]) {
  $(q).onchange = e => { $(m).value = e.target.value; $(m).onchange({ target: $(m) }); };
}
$('#qF').onclick = openSheet;
new MutationObserver(syncQuick).observe($('#mk'), { childList: true });
new MutationObserver(syncQuick).observe($('#mg'), { childList: true });
// 快速列：篩選區捲出畫面後，往上滑才出現、往下滑就收起；回到最上面的按鈕則一直顯示
let pastPanel = false, lastY = scrollY;
const showQuick = on => { $('#qbar').classList.toggle('on', on); $('#qbar').setAttribute('aria-hidden', !on); if (on) syncQuick(); };
new IntersectionObserver(([e]) => {
  pastPanel = !e.isIntersecting && e.boundingClientRect.top < 0;
  $('#toTop').classList.toggle('on', pastPanel);
  if (!pastPanel) showQuick(false);
}).observe($('.panel'));
addEventListener('scroll', () => {
  const y = scrollY, d = y - lastY;
  if (Math.abs(d) < 6) return;
  lastY = y;
  if (pastPanel) showQuick(d < 0);
}, { passive: true });
$('#toTop').onclick = () => scrollTo({ top: 0, behavior: 'smooth' });

// ---------- 啟動 ----------
(async () => {
  syncControls();
  $('#grid').innerHTML = skeleton(6);
  const [, r] = await Promise.all([loadI18n(), getRate()]);
  rate = r; showRate(); buildSheet(); renderTags();
  // 從詳細頁按上一頁回來：一次載入原本看過的數量，並回到原位置
  let back = null; try { back = JSON.parse(sessionStorage.getItem('encarnt_back')); sessionStorage.removeItem('encarnt_back'); } catch (e) { /* 無 */ }
  if (back && back.k === stateKey() && back.n > PAGE) { await load(true, Math.min(back.n, 100)); requestAnimationFrame(() => scrollTo(0, back.y)); }
  else { await load(true); if (back && back.k === stateKey()) requestAnimationFrame(() => scrollTo(0, back.y)); }
  loadHierarchy(); loadCounts();
})();
