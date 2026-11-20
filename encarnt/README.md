# encarnt — Encar 線上選車

佳德汽車網站的「韓國 Encar 中古車線上選車」功能。車輛資料由瀏覽器即時向 Encar 讀取，網站本身不存車輛資料。

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `index.html` | 選車列表頁（篩選、排序、無限捲動） |
| `detail.html` | 單台車詳細頁（`detail.html?id=Encar 車輛編號`） |
| `assets/css/encarnt.css` | 全部樣式 |
| `assets/js/list.js` | 列表頁程式 |
| `assets/js/detail.js` | 詳細頁程式 |
| `assets/js/lib/encar.js` | 讀取 Encar 資料（Encar 改版只改這裡） |
| `assets/js/lib/pricing.js` | 車價公式（與 `../car.html` 相同，改公式時兩邊一起改） |
| `assets/js/lib/rate.js` | 即時匯率 |
| `assets/js/lib/i18n.js` | 翻譯工具 |
| `assets/js/lib/ui.js` | 共用小工具（LINE 詢問、格式化） |
| `assets/data/i18n/makers.json` | 廠牌中文名稱 |
| `assets/data/i18n/models.json` | 車系英文名稱（由工具自動產生） |
| `assets/data/i18n/terms.json` | 車型／等級詞彙 |
| `assets/data/i18n/specs.json` | 燃料、變速箱、車身、顏色、地區 |
| `assets/data/i18n/options.json` | 配備 |

## 修改翻譯
直接改 `assets/data/i18n/` 裡的 JSON，再把 `assets/js/lib/i18n.js` 裡的 `VERSION` 加 1（讓手機重新讀取）。

## 預覽期間
兩個頁面都有 `<meta name="robots" content="noindex">`，正式上線時移除，並在首頁加入口連結。
