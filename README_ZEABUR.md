# 新北市聲音照相平台 Zeabur v6

本版重點：

- 手機與平板版面維持 v5 優化。
- 後台管理入口維持 `/admin`。
- 後台可一鍵產出 Excel 總表。
- LINE Bot 新增條件式查詢：月份、日期、行政區、機號、車牌。
- LINE Bot 回報會包含 KPI 指標與佐證明細。

## LINE Bot 可用指令

### 總表

```text
執行進度
最新進度
成果總數
最新數據
```

### 條件查詢

```text
6月進度
2026-06-12 成效
115.06.12 成效
淡水區 成效
機號 OE_ZB004
車牌 ABC-1234
淡水區 6月 告發率
板橋區 通檢率
```

### 說明

```text
查詢說明
```

## 回報內容

LINE Bot 會即時讀取平台資料，回覆：

- 場次
- 辨識車流
- 超標數、超標率
- 告發件數、告發率
- 通知到檢件數、通檢率
- 成案件數、成案率
- 場次 KPI
- 場次佐證明細
- 車牌查詢佐證明細

## Zeabur 環境變數

```env
PORT=8080
NODE_ENV=production
TZ=Asia/Taipei

GOOGLE_AUTO_SYNC=true
GOOGLE_SHEET_ID=你的GoogleSheetID
GOOGLE_SERVICE_ACCOUNT_JSON=你的ServiceAccountJSON或base64
GOOGLE_SHEET_RAW_NAME=執行成效資料
GOOGLE_SHEET_VEHICLE_NAME=車輛案件資料

LINE_WEBHOOK_VERIFY=false
LINE_CHANNEL_ACCESS_TOKEN=你的LINE_Channel_Access_Token
LINE_CHANNEL_SECRET=你的LINE_Channel_Secret

DASHBOARD_ADMIN_TOKEN=請改成高強度管理Token
DASHBOARD_EDITOR_TOKEN=請改成高強度編輯Token
```

## LINE Webhook URL

```text
https://noise115.zeabur.app/line-webhook
```

若網域不同，請改成 Zeabur「網路」頁面顯示的實際公開網域。
