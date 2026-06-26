# 新北市噪音車監測平台 Zeabur 直接部署版 v4

## 本版修正

- 修正 Zeabur Docker build 失敗：Dockerfile 不再強制 COPY `.npmrc`，避免 GitHub 網頁上傳漏掉隱藏檔造成 `.npmrc: not found`。
- 保留 Nixpacks 與 Dockerfile 雙部署支援。
- 前台 `/` 與後台 `/admin` 分離。
- 後台管理需 Token。
- 手機、平板版面維持響應式顯示。

## Zeabur 環境變數

請一次貼上：

```env
PORT=8080
NODE_ENV=production
TZ=Asia/Taipei
GOOGLE_AUTO_SYNC=false
GOOGLE_SHEET_RAW_NAME=執行成效資料
GOOGLE_SHEET_VEHICLE_NAME=車輛案件資料
LINE_WEBHOOK_VERIFY=false
DASHBOARD_ADMIN_TOKEN=KwzPVmBN6b3moySg3Ma81s8NWhvJEVcY6KkKEh1ApUVYCes6
DASHBOARD_EDITOR_TOKEN=DtrU7W2BKNb8Wt-0WkWJCwNH3pjxcyeQUvQxsNlSGkrLXULs
```

## 部署檢查

- `/healthz` 應顯示 `ok`
- `/api/health` 應回傳 `ok: true`
- 前台：`/`
- 後台：`/admin`
