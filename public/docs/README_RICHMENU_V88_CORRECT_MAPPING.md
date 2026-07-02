# V88 正確套圖版 Rich Menu Only Patch

## 這版修正

V87.1 套錯 Rich Menu 圖。V88 已改成人工指定圖片來源：

| 頁面 | 正確來源 | 輸出圖檔 |
|---|---|---|
| 外勤作業 | `F65FAE1F-12B4-4E26-A71C-7A4056C8302A.jpeg` | `public/assets/line-richmenu-field.jpg` |
| 行政作業 | `2359E889-407C-4653-A2C9-B1CA816BB699.jpeg` | `public/assets/line-richmenu-admin.jpg` |
| 相關資訊 | `9CDE191F-F204-4092-AFDF-314A36C2CAB5.jpeg` | `public/assets/line-richmenu-info.jpg` |

## 後台保留

- 基底：`linebot_live_equipment_v73_3(2).zip`
- 原 `server.js` 保留
- 原 `package.json` 保留
- 不建立 V86 Clean Package 首頁
- 只替換 Rich Menu 圖片與 payload JSON

## 功能對應

### 外勤作業
- 外勤回報 → `FIELD_REPORT_URL`
- 後校正回報 → `FIELD_REPORT_URL?mode=post-calibration`
- 即時機況 → message `即時機況`

### 行政作業
- 回報彙整 → `FIELD_REPORT_URL/summary`
- 設備管理 → message `設備管理`
- 案件追蹤 → `CASE_TRACKING_URL`

### 相關資訊
- Google Sheet → message `Google Sheet 連結`
- 法規標準 → message `法規中心`
