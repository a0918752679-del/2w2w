# 新北市打擊噪音車管理系統 V73.3

## 版本定位

V73 是 **Zeabur 直接匯入版**，不需要 GitHub。

ZIP 根目錄已放好：

- `package.json`
- `Dockerfile`
- `server.js`
- `public/`
- `data/`
- `.env.example`

可直接匯入 Zeabur 建立服務。

## 部署後確認

Zeabur log 應顯示：

```text
newtaipei-noise-control-system-v73-zeabur-direct-upload
```

## 後端登入

```text
/admin-gate.html
```

預設密碼：

```text
69677323
```

## Rich Menu

- 單頁 Rich Menu
- 最新圖檔：`public/assets/line-rich-menu-main.jpg`
- 圖片已低於 LINE 1MB 限制
- 右下角連點三下可啟動隱藏後台入口

## Google Sheet

保留：

- 啟動後自動同步
- 定時同步
- 一鍵更新後同步

## 即時機況

判定標準已改為「設備生命週期」：

- 最新架設場次未填後校正日：代表設備仍在該點監測，判定運作中。
- 最新架設場次已填後校正日：代表設備已收回，若尚無下一筆新場次，判定維護中。
- 後校正後已有新增架設場次，且最新場次尚未填後校正日：判定重新上線、運作中。
- 無架設回報資料：判定維護中。

可使用：

```text
/equipment-live.html
/api/admin/equipment-live/status
/api/admin/equipment/live-status
```
