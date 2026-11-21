// 我的收藏：列出收藏的車，向 Encar 確認是否還在刊登、價格有沒有變
import { loadI18n, tSpec } from './lib/i18n.js';
import { getDetail, notAccepted } from './lib/encar.js';
import { getRate } from './lib/rate.js';
import { calcPrice } from './lib/pricing.js';
import { $, fmt, wan, esc, km, askLine, toast } from './lib/ui.js';
import { favList, removeFav, updateFav, HEART } from './lib/fav.js';

let rate = null;
const status = {}; // id → 'ok' | 'sold'
// 示範模式：第 1 台顯示成已售出、第 2 台顯示成收藏後降價（只改畫面，不改收藏資料）
const DEMO = new URLSearchParams(location.search).has('demo');

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
  const list = favList(), di = DEMO ? list.findIndex(v => v.id === x.id) : -1;
  if (di === 1) x = { ...x, p0: Math.round(x.price * 1.1) };
  const st = di === 0 ? 'sold' : status[x.id], sold = st === 'sold';
  const p0 = x.p0 ?? x.price; // 收藏當時的價格
  const chg = !sold && p0 !== x.price
    ? `<div class="chg ${x.price < p0 ? 'down' : 'up'}">收藏後${x.price < p0 ? '降價' : '漲價'}：${fmt(p0)} → ${fmt(x.price)} 萬韓元</div>` : '';
  const specs = [km(x.km), tSpec('fuel', x.fuel)].filter(Boolean);
  return `<a class="car${sold ? ' gone' : ''}" href="detail.html?id=${encodeURIComponent(x.id)}" data-id="${esc(x.id)}">
    <div class="ph">${x.img ? `<img src="${esc(x.img)}" alt="${esc(x.t)}" loading="lazy" decoding="async" width="640" height="480">` : ''}
      <span class="yr">${esc(x.y)} 年式</span>${sold ? '<span class="soldtag">已售出或下架</span>' : ''}
      <button type="button" class="fav on" data-rm="${esc(x.id)}" aria-label="移除收藏">${HEART}</button></div>
    <div class="bd"><h3>${esc(x.t)}</h3><div class="sub">${esc(x.s)}</div>
    <div class="specs">${specs.map(s => `<span>${esc(s)}</span>`).join('')}${st ? '' : '<span class="chk">確認中…</span>'}</div>${chg}${priceHtml(x)}</div></a>`;
}

function render() {
  const list = favList();
  $('#favCount').textContent = list.length ? `${list.length} 台` : '';
  $('#bar').hidden = !list.some(x => status[x.id] !== 'sold');
  $('#grid').innerHTML = list.length ? list.map(cardHtml).join('')
    : '<div class="empty">還沒有收藏的車<br><br>看到喜歡的車，點照片右上角的 ♡<br>就能收藏，之後回來這裡查看。<br><br><a class="btn-m" href="./" style="text-decoration:none;display:inline-block">去看車</a></div>';
}

$('#grid').addEventListener('click', e => {
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
