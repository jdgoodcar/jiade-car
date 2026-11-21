// 收藏車輛：只存在這支手機／這台電腦的瀏覽器裡（localStorage），不會上傳
// 每筆存一份當下的快照，收藏頁打開時再向 Encar 確認是否還在刊登、價格有沒有變
const KEY = 'encarnt_fav';
export const FAV_MAX = 50;

export function favList() {
  try { const a = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function save(a) {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* 私密瀏覽等情況存不了，略過 */ }
  updateFavCount();
}
export const isFav = id => favList().some(x => String(x.id) === String(id));

/** 加入或移除，回傳加入後的狀態（true = 已收藏），超過上限回傳 null */
export function toggleFav(item) {
  const a = favList(), i = a.findIndex(x => String(x.id) === String(item.id));
  if (i >= 0) { a.splice(i, 1); save(a); return false; }
  if (a.length >= FAV_MAX) return null;
  a.unshift({ ...item, id: String(item.id), p0: item.price, at: Date.now() }); save(a); return true;
}
export function removeFav(id) { save(favList().filter(x => String(x.id) !== String(id))); }
export function updateFav(id, patch) {
  const a = favList(), x = a.find(v => String(v.id) === String(id));
  if (x) { Object.assign(x, patch); save(a); }
}

/** 頁首「收藏」按鈕上的數字 */
export function updateFavCount() {
  const n = favList().length;
  document.querySelectorAll('.favN').forEach(el => { el.textContent = n; el.hidden = !n; });
}

export const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.5 7.9 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.5 3.4 4.3 6.6-1.8 4.8-9.3 9.4-9.3 9.4Z"/></svg>';

/** 按鈕狀態 */
export function setHeart(btn, on) {
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on);
  btn.setAttribute('aria-label', on ? '取消收藏' : '加入收藏');
}

// 其他分頁收藏／取消時同步數字
addEventListener('storage', e => { if (e.key === KEY) updateFavCount(); });
