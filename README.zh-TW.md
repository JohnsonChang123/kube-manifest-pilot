# KubeManifestPilot｜Kubernetes YAML 產生器

KubeManifestPilot 是免費、純瀏覽器端的 Kubernetes Manifest 產生器。使用者完成引導式問卷後，可取得內容可重現的 Kubernetes YAML、驗證提醒、問卷 JSON，以及依實際 Resource 名稱生成的部署教學。

[English](./README.md) · [開啟問卷](./generator/) · [部署範本](./templates/) · [架構設計工具](./designer/)

## 主要輸出

- Namespace、Deployment、Service、ConfigMap
- PostgreSQL StatefulSet、Headless／Client Service 與持久儲存
- 選配 Ingress、HPA 與 PDB
- 包含 dry-run、Rollout、驗證、Log、Rollback 與移除說明的 `DEPLOY.md`
- 已排除敏感欄位的 Questionnaire JSON

## 安全界線

- 不接收 kubeconfig、Cluster Token、密碼或私鑰。
- 不連線或修改 Kubernetes Cluster。
- 不執行 `kubectl apply`。
- 不管理 Node、Node Pool、Taint 或 Toleration。
- 網頁通過僅代表符合產生器靜態規則，仍須在目標叢集執行 server-side dry-run。

Repository 另附可閱讀的[前後端各單副本](./frontend-backend-single-replica.yaml)與 [PostgreSQL 單副本](./postgresql-single-replica.yaml)範例。PostgreSQL 檔案只引用既有 Secret，且不具 HA；請使用問卷依實際名稱與 Namespace 產生配套的 `DEPLOY.md`。

## 本機與 GitHub Pages

直接使用 Chrome 或 Edge 開啟根目錄 `index.html` 即可，不需安裝 npm、Node.js、後端、框架或 CDN。所有頁面採相對網址；建議 Repository 命名為 `kube-manifest-pilot`，部署網址會是 `https://<username>.github.io/kube-manifest-pilot/`。

GitHub Pages 部署方式：將檔案推送至 Repository，前往 **Settings → Pages**，選擇從分支根目錄發布。

## GitHub、打賞與廣告設定

在 [`assets/js/config.js`](./assets/js/config.js) 填入公開的 GitHub 與打賞網址；留空時按鈕保持停用，不會導向假網址。

廣告預設關閉。只有在廣告平台核准，並完成所需的同意與隱私處理後，才設定 `adsEnabled`。廣告與問卷／產生核心完全分離，因此網路失敗或 Ad blocker 不會影響 YAML 產生。

## 隱私權與授權

請參閱[隱私權說明](./privacy/)與[第三方授權頁](./licenses/)。目前 Runtime 沒有使用第三方 JavaScript 套件。公開原始碼不代表自動授權重製或散布，實際權利請參閱 [LICENSE](./LICENSE)。

Kubernetes 是 The Linux Foundation 的商標。KubeManifestPilot 是獨立專案，並非 Kubernetes 官方產品。
