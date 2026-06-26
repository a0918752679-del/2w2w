# 新北市聲音照相平台 Zeabur 直接部署版

## 這版調整

- 已移除 `package-lock.json`，避免鎖到非公開 npm registry 造成 Zeabur build 失敗。
- `Dockerfile` 與 `nixpacks.toml` 都改用 `npm install --omit=dev`，Dockerfile / Nixpacks 兩種部署都能跑。
- Server 監聽 `0.0.0.0:$PORT`，符合 Zeabur 公網服務需求。
- 前台 `/` 只顯示平台資料；後台管理功能移到 `/admin`。
- 手機、平板表格採橫向滑動，避免畫面爆版。

## 部署方式

1. 解壓縮本 ZIP。
2. 將所有檔案上傳 GitHub Repository 根目錄。
3. Zeabur → Add Service → GitHub → 選擇 Repository。
4. Build 可選 Nixpacks；若畫面有 Dockerfile 選項，也可選 Dockerfile。
5. 到 Variables 貼上 `ZEABUR_ENV_ONCE.txt` 內全部內容。
6. Deploy / Redeploy。

## Zeabur Variables 一次貼上

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

> 若 Zeabur 自動注入 `PORT`，保留本設定通常仍可正常運作；若平台提示連接埠衝突，再刪除 `PORT=8080` 讓 Zeabur 自動注入。

## 使用網址

- 前台：`https://你的Zeabur網域/`
- 後台：`https://你的Zeabur網域/admin`
- 健康檢查：`https://你的Zeabur網域/healthz`
- API 檢查：`https://你的Zeabur網域/api/health`

## 權限

| 角色 | Token | 權限 |
|---|---|---|
| 前台使用者 | 不需要 | 只看資料與查詢 |
| 編輯者 | DASHBOARD_EDITOR_TOKEN | 匯入、匯出、同步 |
| 管理者 | DASHBOARD_ADMIN_TOKEN | 編輯者權限＋還原內建資料 |

## Google Sheet 同步

本版預設 `GOOGLE_AUTO_SYNC=false`，可先確保平台部署成功。等 Zeabur 開啟正常後再改：

```env
GOOGLE_AUTO_SYNC=true
GOOGLE_SHEET_ID=你的GoogleSheetID
GOOGLE_SERVICE_ACCOUNT_JSON=你的ServiceAccountJSON或base64
GOOGLE_SHEET_RAW_NAME=執行成效資料
GOOGLE_SHEET_VEHICLE_NAME=車輛案件資料
```

Google Sheet 需建立兩個工作表，名稱必須完全一致：

- `執行成效資料`
- `車輛案件資料`

並將試算表分享給 Service Account 的 `client_email`，權限至少為編輯者。

## 上線檢查

1. `/healthz` 顯示 `ok`。
2. `/api/health` 顯示 `ok: true`。
3. `/` 前台可看到 KPI 與表格。
4. `/admin` 可用管理者 Token 登入。
5. 後台匯入 Excel 後，前台資料更新。
