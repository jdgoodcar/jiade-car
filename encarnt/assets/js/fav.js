// 我的收藏：列出收藏的車，向 Encar 確認是否還在刊登、價格有沒有變
import { loadI18n, tSpec } from './lib/i18n.js?v=67';
import { getDetail, notAccepted } from './lib/encar.js?v=67';
import { getRate } from './lib/rate.js?v=67';
import { calcPrice } from './lib/pricing.js?v=67';
import { $, fmt, wan, esc, km, askLine, toast, isTouch } from './lib/ui.js?v=67';
import { favList, removeFav, updateFav, HEART, updateFavCount } from './lib/fav.js?v=67';

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
}
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
      <button type="button" class="fav on" data-rm="${esc(x.id)}" aria-label="移除收藏">${HEART}</button></div>
    <div class="bd"><h3>${esc(x.t)}</h3><div class="sub">${esc(x.s)}</div>
    <div class="specs">${specs.map(s => `<span>${esc(s)}</span>`).join('')}${st ? '' : '<span class="chk">確認中…</span>'}</div>${chg}${priceHtml(x)}
    ${sold ? '' : `<button type="button" class="cmpb" data-cmp="${esc(x.id)}" aria-pressed="false"><i></i>加入比較</button>`}</div></a>`;
}

function render() {
  const list = favList();
  $('#favCount').textContent = list.length ? `${list.length} 台` : '';
  $('#bar').hidden = !list.some(x => status[x.id] !== 'sold');
  $('#grid').innerHTML = list.length ? list.map(cardHtml).join('')
    : '<div class="empty">還沒有收藏的車<br><br>看到喜歡的車，點照片右上角的 ♡<br>就能收藏，之後回來這裡查看。<br><br><a class="btn-m" href="./" style="text-decoration:none;display:inline-block">去看車</a></div>';
  syncCmp();
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
