# 新北聲音照相平台 Zeabur v7

## v7 新增
- LINE Bot 強化月份與行政區查詢，例如：`2月份執行成效`、`淡水區執行成效`。
- 回覆內容加深：執行場次、完成場次、辨識車流、超標數/率、告發件數/率、通檢件數/率、成案件數/率、場次 KPI、告發金額、車輛明細。
- 新增佐證：行政區排行、機台排行、案件類型、最近 5 筆場次佐證、最近 5 筆車輛明細佐證。
- 保留 `/admin` 後台、一鍵 Excel 總表與 Google Sheet 同步。

## LINE 可用指令
- `執行進度`
- `2月份執行成效`
- `6月進度`
- `淡水區執行成效`
- `板橋區通檢率`
- `2026-06-12 成效`
- `機號 OE_ZB004`
- `車牌 ABC-1234`
- `淡水區 6月 告發率`
- `查詢說明`

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

## 部署後測試
- `https://noise115.zeabur.app/healthz`
- `https://noise115.zeabur.app/api/health`
- `https://noise115.zeabur.app/line-webhook`
