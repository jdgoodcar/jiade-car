// 我的收藏：列出收藏的車，向 Encar 確認是否還在刊登、價格有沒有變
import { loadI18n, tSpec } from './lib/i18n.js?v=82';
import { getDetail, notAccepted } from './lib/encar.js?v=82';
import { getRate } from './lib/rate.js?v=82';
import { calcPrice } from './lib/pricing.js?v=82';
import { $, fmt, wan, esc, km, askLine, toast, isTouch } from './lib/ui.js?v=82';
import { favList, removeFav, updateFav, HEART, updateFavCount, dedupeFav } from './lib/fav.js?v=82';

dedupeFav();
updateFavCount();
if (isTouch) $('#hdLine').removeAttribute('target'); // 手機在同一頁開 LINE，App 比較能直接跳出

let rate = null;
const status = {}; // id → 'ok' | 'sold'
// 比較：最多 4 台，記在這個分頁（回上一頁時還在）
const CMP_MAX = 4;
let pick = []; try { pick = JSON.parse(sessionStorage.getItem('encarnt_cmp')) || []; } catch (e) { pick = []; }
const savePick = () => { try { sessionStorage.setItem('encarnt_cmp', JSON.stringify(pick)); } catch (e) { /* 略過 */ } };
function syncCmp() {
  const ids = favList().map(x => x.id);
  pick = pick.filter(id => ids.includes(id) && status[id] !== 'sold');
  const n = pick.length;
  $('#cmpGo').disabled = n < 2;
  $('#cmpN').textContent = n < 2 ? '勾選 2–4 台' : `比較 ${n} 台`;
  document.querySelectorAll('[data-cmp]').forEach(b => { const on = pick.includes(b.dataset.cmp); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  const can = favList().filter(x => status[x.id] !== 'sold');
  const gone = favList().filter(x => status[x.id] === 'sold').length;
  const rs = $('#rmSold'); if (rs) { rs.hidden = !gone; rs.textContent = `移除已售出／下架（${gone}）`; }
  const eo = $('#editOn'); if (eo) eo.hidden = favList().length < 2;
  if (editing) setTimeout(syncEdit);
  const sa = $('#selAll'); if (sa) { sa.hidden = can.length < 2; sa.textContent = n ? '取消選取' : (can.length > CMP_MAX ? `選取前 ${CMP_MAX} 台` : '全選比較'); }
}
// 一鍵：沒選任何車 → 選取前 4 台（已售出的跳過）；已有選取 → 全部取消
if ($('#selAll')) $('#selAll').onclick = () => {
  pick = pick.length ? [] : favList().filter(x => status[x.id] !== 'sold').slice(0, CMP_MAX).map(x => String(x.id));
  savePick(); syncCmp();
};
$('#cmpGo').onclick = () => { if (pick.length >= 2) location.href = 'compare.html?ids=' + pick.map(encodeURIComponent).join(','); };

addEventListener('scroll', () => $('#toTop').classList.toggle('on', scrollY > 600), { passive: true });
$('#toTop').onclick = () => scrollTo({ top: 0, behavior: 'smooth' });

function priceHtml(x) {
  const no = notAccepted(x.fuel);
  const krw = `韓國售價<br>${fmt(x.price)} 萬韓元`;
  if (no) return `<div class="pr"><div><div class="l">預估車價</div><div class="v no">${no}暫不接受代購</div></div><div class="k">${krw}</div></div>`;
  const p = rate && calcPrice(x.price, x.cc || 0, rate);
  const tag = p && p.lux ? '<span class="lux">含奢侈稅</span>' : (p && !p.ccKnown ? '<span class="approx">約</span>' : '');
  return `<div class="pr"><div><div class="l">預估車價 ${tag}</div><div class="v">${p ? wan(p.price) + '<small> 萬</small>' : '—'}</div></div><div class="k">${krw}</div></div>`;
}

function cardHtml(x) {
  const st = status[x.id], sold = st === 'sold';
  const p0 = x.p0 ?? x.price; // 收藏當時的價格
  const chg = !sold && p0 !== x.price
    ? `<div class="chg ${x.price < p0 ? 'down' : 'up'}">收藏後${x.price < p0 ? '降價' : '漲價'}：${fmt(p0)} → ${fmt(x.price)} 萬韓元</div>` : '';
  const specs = [km(x.km), tSpec('fuel', x.fuel)].filter(Boolean);
  return `<a class="car${sold ? ' gone' : ''}" href="detail.html?id=${encodeURIComponent(x.id)}" data-id="${esc(x.id)}">
    <div class="ph">${x.img ? `<img src="${esc(x.img)}" alt="${esc(x.t)}" loading="lazy" decoding="async" width="640" height="480">` : ''}
      <span class="yr">${esc(x.y)} 年式</span>${sold ? '<span class="soldtag">已售出或下架</span>' : ''}
</div>
    <div class="bd"><h3>${esc(x.t)}</h3><div class="sub">${esc(x.s)}</div>
    <div class="specs">${specs.map(s => `<span>${esc(s)}</span>`).join('')}${st ? '' : '<span class="chk">確認中…</span>'}</div>${chg}${priceHtml(x)}
    <div class="acts">${sold ? '' : `<button type="button" class="cmpb" data-cmp="${esc(x.id)}" aria-pressed="false"><i></i>加入比較</button>`}<button type="button" class="rmb" data-rm="${esc(x.id)}" aria-label="移除收藏">移除</button></div></div></a>`;
}

// 篩選與排序（只影響畫面，不改收藏資料）
const brand = x => (x.t || '').split(' ')[0];
function shown(list) {
  if (!$('#fMk')) return list; // 舊版網頁還在快取時
  const mk = $('#fMk').value, so = $('#fSort').value;
  const q = ($('#fQ') ? $('#fQ').value : '').trim().toLowerCase().replace(/\s+/g, '');
  let a = mk ? list.filter(x => brand(x) === mk) : list.slice();
  if (q) a = a.filter(x => (x.t + x.s).toLowerCase().replace(/\s+/g, '').includes(q));
  const by = { pa: (x, y) => x.price - y.price, pd: (x, y) => y.price - x.price, yd: (x, y) => (+y.y || 0) - (+x.y || 0), ka: (x, y) => (x.km || 0) - (y.km || 0) }[so];
  if (by) a.sort(by);
  return a;
}
function render() {
  const all = favList(), list = shown(all);
  $('#favCount').textContent = all.length ? `${all.length} 台` : '';
  $('#bar').hidden = (typeof editing !== 'undefined' && editing) || !all.some(x => status[x.id] !== 'sold');
  // 廠牌選單：收藏裡有的廠牌
  if ($('#fMk')) {
  const mks = [...new Set(all.map(brand))].sort(), cur = $('#fMk').value;
  $('#fMk').innerHTML = '<option value="">全部廠牌</option>' + mks.map(m => `<option${m === cur ? ' selected' : ''}>${esc(m)}</option>`).join('');
  $('#favTools').hidden = all.length < 2;
  }
  $('#grid').innerHTML = !all.length ? ''
    : !list.length ? '<div class="empty">沒有符合的收藏車輛</div>'
    : list.map(cardHtml).join('');
  if (!all.length) $('#grid').innerHTML = '<div class="empty">還沒有收藏的車<br><br>看到喜歡的車，點照片右上角的 ♡<br>就能收藏，之後回來這裡查看。<br><br><a class="btn-m" href="./" style="text-decoration:none;display:inline-block">去看車</a></div>';
  syncCmp();
}
if ($('#fMk')) { $('#fMk').onchange = render; $('#fSort').onchange = render; }
// 筆的按鈕：切換成輸入框（廠牌、排序先收起來）
if ($('#fQs')) {
  const qOn = on => { $('#favTools').classList.toggle('searching', on); if (on) $('#fQ').focus(); else { $('#fQ').value = ''; render(); } };
  $('#fQs').onclick = () => qOn(true);
  $('#fQx').onclick = () => qOn(false);
  $('#fQ').addEventListener('input', render);
}

$('#grid').addEventListener('click', e => {
  const c = e.target.closest('[data-cmp]');
  if (c) {
    e.preventDefault(); e.stopPropagation();
    const id = c.dataset.cmp, i = pick.indexOf(id);
    if (i >= 0) pick.splice(i, 1);
    else if (pick.length >= CMP_MAX) return toast(`最多比較 ${CMP_MAX} 台`);
    else pick.push(id);
    savePick(); syncCmp(); return;
  }
  const b = e.target.closest('[data-rm]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  removeFav(b.dataset.rm); render(); toast('已移除收藏');
});

// 一次詢問全部（已售出的不列）
$('#askAll').onclick = () => {
  const list = favList().filter(x => status[x.id] !== 'sold');
  const L = ['您好，我想詢問以下收藏的車輛：'];
  list.forEach((x, i) => {
    const p = !notAccepted(x.fuel) && rate && calcPrice(x.price, x.cc || 0, rate);
    L.push('', `${i + 1}. ${x.t} ${x.s}`.trim(), `${x.y} 年式｜${km(x.km)}${p ? `｜預估約 ${wan(p.price)} 萬元` : ''}`, new URL(`detail.html?id=${x.id}`, location.href).href);
  });
  askLine(L.join('\n'));
};

(async () => {
  await loadI18n().catch(() => {});
  rate = await getRate().catch(() => null);
  render();
  // 逐台確認（同時最多 3 台）
  const q = favList().slice();
  const work = async () => {
    for (let x; (x = q.shift());) {
      try {
        const d = await getDetail(x.id), ad = d.advertisement || {};
        if (ad.status && ad.status !== 'ADVERTISE') status[x.id] = 'sold';
        else {
          status[x.id] = 'ok';
          if (ad.price && ad.price !== x.price) updateFav(x.id, { price: ad.price });
          if (d.spec && d.spec.displacement && d.spec.displacement !== x.cc) updateFav(x.id, { cc: d.spec.displacement });
        }
      } catch (e) { status[x.id] = / 4\d\d$/.test(e.message) ? 'sold' : 'ok'; } // 4xx：Encar 已找不到；其他是網路問題，先不判定
      render();
    }
  };
  await Promise.all([work(), work(), work()]);
})();

// 一鍵移除已售出或下架的車
if ($('#rmSold')) $('#rmSold').onclick = () => {
  const gone = favList().filter(x => status[x.id] === 'sold');
  if (!gone.length) return;
  if (!confirm(`要移除 ${gone.length} 台已售出或下架的車嗎？`)) return;
  gone.forEach(x => removeFav(x.id)); render(); toast(`已移除 ${gone.length} 台`);
};

// ---------- 選取移除：一次移除很多台 ----------
const del = new Set();
let editing = false;
function syncEdit() {
  document.querySelectorAll('#grid .car').forEach(el => { el.classList.toggle('sel', del.has(el.dataset.id)); });
  const all = [...document.querySelectorAll('#grid .car')].map(el => el.dataset.id);
  if ($('#editRm')) { $('#editRm').disabled = !del.size; $('#editRm').textContent = `移除已選（${del.size}）`; }
  if ($('#editAll')) $('#editAll').textContent = all.length && all.every(id => del.has(id)) ? '全部取消' : '全選';
}
function setEdit(on) {
  editing = on; del.clear();
  document.body.classList.toggle('editing', on);
  $('#editBar').hidden = !on;
  $('#bar').hidden = on || !favList().some(x => status[x.id] !== 'sold');
  syncEdit();
}
if ($('#editOn')) {
  $('#editOn').onclick = () => setEdit(true);
  $('#editOff').onclick = () => setEdit(false);
  $('#editAll').onclick = () => {
    const all = [...document.querySelectorAll('#grid .car')].map(el => el.dataset.id);
    if (all.every(id => del.has(id))) del.clear(); else all.forEach(id => del.add(id));
    syncEdit();
  };
  $('#editRm').onclick = () => {
    if (!del.size || !confirm(`要移除選取的 ${del.size} 台收藏嗎？`)) return;
    const n = del.size; del.forEach(id => removeFav(id)); setEdit(false); render(); toast(`已移除 ${n} 台`);
  };
  // 選取模式：點整張卡片就是勾選，不會打開車輛頁
  $('#grid').addEventListener('click', e => {
    if (!editing) return;
    const card = e.target.closest('.car'); if (!card) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const id = card.dataset.id; if (del.has(id)) del.delete(id); else del.add(id);
    syncEdit();
  }, true);
}
