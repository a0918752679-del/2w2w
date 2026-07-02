# Zeabur 直接匯入部署說明

本封包為 Zeabur 直接匯入版，不需要 GitHub。

## 封包結構

ZIP 根目錄已包含：

- `package.json`
- `Dockerfile`
- `server.js`
- `public/assets/line-rich-menu-main.jpg`
- `.env.example`

請直接把整包 ZIP 匯入 Zeabur，不要再包一層資料夾。

## 建議環境變數

```env
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
PUBLIC_BASE_URL=https://你的-zeabur-domain

ADMIN_PASSWORD=69677323
ADMIN_SESSION_MINUTES=60
SESSION_SECRET=請設定一組隨機字串

AUTO_SYNC_SHEETS_ON_STARTUP=true
GSHEET_SYNC_INTERVAL_MIN=15

RESULTS_GOOGLE_SHEET_ID=
RESULTS_GOOGLE_SHEET_GID=

FIELD_GOOGLE_SHEET_ID=
FIELD_GOOGLE_SHEET_GID=

EQUIPMENT_GOOGLE_SHEET_ID=
EQUIPMENT_GOOGLE_SHEET_GID=

COMPLAINT_GOOGLE_SHEET_ID=
COMPLAINT_GOOGLE_SHEET_GID=
```

## 部署後

1. 開啟 `/admin-gate.html`
2. 輸入密碼
3. 進入 `/admin.html`
4. 點選「一鍵更新」
5. 系統會更新 Rich Menu 並同步 Google Sheet
