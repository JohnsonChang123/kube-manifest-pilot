請幫我設計並實作一個「Kubernetes Architecture Designer」，目標是讓使用者可以在瀏覽器中，以拖拉方式規劃 Kubernetes 與應用系統架構，並產出視覺風格接近 Kubernetes 官方文件架構圖的正式圖表。

## 一、技術要求

請產出完整且可直接執行的：

`index.html`

必須符合：

* 單一 HTML 檔案。
* HTML、CSS、JavaScript 全部包含在同一檔案。
* 不需要 npm install。
* 不需要 Node.js。
* 不需要後端 Server。
* 直接雙擊 index.html 即可執行。
* 使用 Vanilla JavaScript。
* 優先使用 SVG 作為 Architecture Canvas。
* 不使用 React、Vue、Angular。
* 不使用 Mermaid 作為主要編輯器。
* 若非必要，不依賴外部 CDN。
* 圖示盡可能使用內嵌 SVG。
* 程式碼需模組化、容易擴充。

這不是單純的架構圖 Viewer，而是一個可以實際操作的 Architecture Diagram Editor。

---

# 二、主要畫面

整體 UI 採專業、簡潔、接近：

* Kubernetes 官方文件
* CNCF
* Cloud Architecture Diagram
* Google Cloud Architecture
* Apple 式簡潔介面

不要過度花俏。

建議畫面：

┌─────────────────────────────────────────────────────────────┐
│ Toolbar                                                     │
│ Template │ Undo │ Redo │ Zoom │ Auto Layout │ Export       │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│ Component    │                                              │
│ Palette      │               Architecture Canvas            │
│              │                                              │
│ Kubernetes   │                                              │
│ Application  │                                              │
│ Database     │                                              │
│ Storage      │                                              │
│ Observability│                                              │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│ Properties Panel / Selected Object Settings                 │
└─────────────────────────────────────────────────────────────┘

桌面版以左側元件列 + 中央 Canvas + 右側 Properties Panel 為主要配置。

---

# 三、Architecture Canvas

中央使用 SVG Canvas。

必須支援：

1. Drag & Drop
2. 節點自由拖曳
3. 多選
4. 框選
5. Zoom In
6. Zoom Out
7. Mouse Wheel Zoom
8. Pan
9. Fit to Screen
10. Reset View
11. Snap to Grid
12. 顯示／隱藏 Grid
13. 對齊輔助線
14. Undo
15. Redo

背景採非常淡的 Grid。

---

# 四、節點 Node

所有架構元件都使用 Node 表示。

Node 至少具有：

* icon
* name
* type
* subtitle
* description
* status
* x
* y
* width
* height

例如：

Deployment

python-api

Replicas: 3

或：

PostgreSQL

Primary

或：

Service

backend-service

ClusterIP :80

Node 必須可以：

* 拖曳
* 選取
* 改名
* 改 Subtitle
* 改 Description
* 複製
* 刪除
* Resize
* 改變 Layer
* 改變圖示
* 改變節點類型

Double Click Node 可以直接修改名稱。

---

# 五、Connection / Edge

必須可以在 Node 之間建立連線。

例如：

Ingress
↓
Service
↓
Deployment
↓
PostgreSQL

Connection 支援：

* Directed Arrow
* Undirected Line
* Dashed Line
* Solid Line
* Animated Flow 可選
* Connection Label

例如：

HTTP

HTTPS

SQL :5432

Redis :6379

WAL Replication

REST API

gRPC

WebSocket

Object Storage

Connection 建議使用：

SVG Path

並提供自動 routing。

優先使用：

Orthogonal / 90 Degree Connector

避免線條直接穿過其他 Node。

---

# 六、Kubernetes Component Palette

左側建立 Kubernetes 元件庫。

至少包含：

## Workloads

* Pod
* Deployment
* StatefulSet
* DaemonSet
* ReplicaSet
* Job
* CronJob

## Networking

* Service
* ClusterIP
* NodePort
* LoadBalancer
* Ingress
* Gateway
* NetworkPolicy

## Configuration

* ConfigMap
* Secret

## Storage

* PersistentVolume
* PersistentVolumeClaim
* StorageClass

## Autoscaling

* HPA
* VPA

## Kubernetes Structure

* Cluster
* Namespace
* Node
* Node Pool
* Control Plane

## Security

* ServiceAccount
* RBAC
* Role
* RoleBinding

## Operator

* Operator
* Custom Resource

例如：

CloudNativePG Operator

---

# 七、Application Component Palette

另外提供一般應用元件。

## Frontend

* React
* Vue
* Angular
* Nginx
* Static Web

## Backend

* Python
* FastAPI
* Flask
* Django
* Java
* Spring Boot
* Node.js
* REST API
* gRPC Service

## Database

* PostgreSQL
* MySQL
* MongoDB
* Redis

## Message Queue

* Kafka
* RabbitMQ
* Queue

## Storage

* MinIO
* S3
* NFS
* Object Storage
* File Storage

## AI / ML

* PyTorch
* TensorFlow
* vLLM
* Model Server
* GPU Pod
* Inference Service

## Observability

* Prometheus
* Grafana
* Loki
* Elasticsearch
* OpenTelemetry
* Jaeger
* Tempo

## DevOps

* Git
* GitLab
* GitLab CI
* GitHub
* Container Registry
* Harbor
* ArgoCD
* Helm

---

# 八、群組 Container

非常重要：

Node 不只能獨立存在，也必須能放進 Container。

至少支援：

Cluster

Namespace

Node

Node Pool

Application Group

Database Group

例如：

Kubernetes Cluster
│
├── Namespace: frontend
│     ├── Deployment
│     ├── Pod
│     └── Service
│
├── Namespace: backend
│     ├── FastAPI Deployment
│     └── Service
│
└── Namespace: database
├── PostgreSQL
└── PVC

Container 必須：

* 可 Resize
* 可拖曳
* Child Nodes 跟著 Container 移動
* Container 有 Header
* 可以 Collapse / Expand
* 可以改名稱

---

# 九、Kubernetes 官方視覺風格

Kubernetes 元件採 Kubernetes 官方視覺語言。

主要 Kubernetes 顏色：

#326CE5

Cluster / Namespace Container 使用：

淡藍色 Border

非常淡的藍色背景

Kubernetes Resource Node：

圓角矩形

Icon 區域使用 Kubernetes Blue。

Node 本體使用白色或接近白色。

避免大量陰影。

整體應接近 Kubernetes 官方 Architecture Diagram，而不是一般流程圖。

如果有官方 Kubernetes Resource SVG Icon 可以合理內嵌，優先使用。

如果沒有特定 Resource 官方 Icon，可以使用一致的簡化 SVG Icon，但必須維持 Kubernetes 視覺語言。

Application 元件則可以使用不同類型的簡潔 Logo/Icon。

不要讓所有 Node 都變成完全不同的設計。

---

# 十、Properties Panel

選擇 Node 後，右側顯示：

Name

Type

Subtitle

Description

Namespace

Replicas

Port

Protocol

Image

Version

CPU Request

CPU Limit

Memory Request

Memory Limit

Node Selector

Label

Annotation

Color

Icon

Width

Height

不是所有 Node 都一定需要所有欄位。

根據 Node Type 顯示相關欄位。

---

# 十一、Kubernetes 特殊資訊

例如 Deployment Node 可以顯示：

Deployment

python-api

Replicas: 3

Image:
registry/backend:v1.2.3

CPU:
250m → 1 Core

Memory:
256Mi → 1Gi

Service 可以顯示：

Service

python-api

ClusterIP

80 → 8000

PostgreSQL：

PostgreSQL

Primary

5432

PVC 100Gi

---

# 十二、Architecture Template

內建「Architecture Templates」。

Template 只是快速建立架構，建立後所有元件仍然可以自由修改。

至少提供以下 Template。

---

## Template 1

React + Nginx Frontend

Internet
↓
Ingress
↓
frontend-service
↓
Frontend Deployment

Deployment 裡：

Nginx
+
React Static Files

Replicas: 3

---

## Template 2

FastAPI Backend

Ingress

/api

↓

backend-service

↓

FastAPI Deployment

Replicas: 3

↓

PostgreSQL

---

## Template 3

Full Stack

Internet

↓

Ingress

├── /
│
│ frontend-service
│ ↓
│ React + Nginx
│
└── /api
│
backend-service
↓
FastAPI ×3
↓
PostgreSQL

---

## Template 4

PostgreSQL HA

CloudNativePG Operator

↓

PostgreSQL Cluster

├── Primary
│
├── Standby
│
└── Standby

每一台：

↓

PVC

另外：

Primary
↓
WAL
↓
Standby

Service：

RW Service
↓
Primary

RO Service
↓
Standby

---

## Template 5

Backend + Redis

Client
↓
FastAPI
↓
Redis

Cache Miss：

FastAPI
↓
PostgreSQL

---

## Template 6

Queue / Worker

Frontend
↓
FastAPI
↓
RabbitMQ / Kafka
↓
Worker Deployment

Worker：

Worker 1

Worker 2

Worker 3

Worker 再連：

PostgreSQL

MinIO

---

## Template 7

AI Architecture

Frontend

↓

FastAPI

↓

AI Service

↓

vLLM Deployment

↓

GPU Pod

GPU Node Pool

同時：

FastAPI
↓
PostgreSQL

FastAPI
↓
Redis

---

## Template 8

Observability

Application Pods

↓

Prometheus

↓

Grafana

Logging：

Pods
↓
Fluent Bit
↓
Loki
↓
Grafana

Tracing：

FastAPI
↓
OpenTelemetry
↓
Tempo / Jaeger

---

## Template 9

CI/CD

Developer

↓

GitLab

↓

GitLab CI

↓

Test

↓

Docker Build

↓

Container Registry

↓

Kubernetes

↓

Deployment

---

## Template 10

GitOps

Developer

↓

Git

↓

GitLab CI

↓

Container Registry

↓

GitOps Repository

↓

ArgoCD

↓

Kubernetes Cluster

---

# 十三、Node Pool 表示

需要能清楚表達實體 Kubernetes Node 架構。

例如：

Kubernetes Cluster

Control Plane

├── master01
├── master02
└── master03

General Node Pool

├── worker01
├── worker02
└── worker03

GPU Node Pool

├── gpu01
└── gpu02

Database Node Pool

├── db01
├── db02
└── db03

可以把 Pod 放入特定 Node。

例如：

GPU Pod
→ GPU Node Pool

PostgreSQL
→ Database Node Pool

---

# 十四、HA 視覺化

支援 HA Architecture。

例如：

Load Balancer / VIP

↓

K8S Control Plane

├ master01
├ master02
└ master03

另外：

PostgreSQL

Primary
↓ WAL
Standby 1

Primary
↓ WAL
Standby 2

必須可以用不同線型表示：

Normal Traffic

Replication

Backup

Monitoring

---

# 十五、Layer / Connection Type

Connection 可以選：

Application Traffic

Database Traffic

Replication

Backup

Monitoring

Logging

Storage

CI/CD

Management

不同 Connection 可以使用不同：

線型

箭頭

透明度

但整體配色不要過度複雜。

---

# 十六、自動 Layout

提供：

Auto Layout

至少支援：

Top → Bottom

Left → Right

並盡可能：

避免 Node 重疊

避免 Edge 穿過 Node

維持 Container 邏輯

Template 建立後自動得到合理排列。

---

# 十七、Export

至少提供：

Export PNG

Export SVG

Export JSON

Copy JSON

Import JSON

JSON 必須保存：

Nodes

Edges

Groups

Positions

Sizes

Properties

Viewport

Theme

讓之後重新 Import 可以完全恢復架構圖。

---

# 十八、Architecture JSON

內部資料結構請設計清楚，例如：

{
"nodes": [],
"edges": [],
"groups": [],
"viewport": {},
"settings": {}
}

Node：

{
"id": "node-001",
"type": "deployment",
"name": "python-api",
"subtitle": "Replicas: 3",
"x": 500,
"y": 300,
"width": 180,
"height": 90,
"parentId": "namespace-backend",
"properties": {
"replicas": 3,
"image": "backend:v1.0",
"port": 8000
}
}

Edge：

{
"id": "edge-001",
"source": "service-backend",
"target": "deployment-backend",
"type": "traffic",
"label": "HTTP :8000"
}

---

# 十九、快速新增

Canvas 空白處 Double Click：

開啟 Quick Add。

可以搜尋：

deployment

service

postgres

fastapi

redis

nginx

等等。

選擇後直接建立 Node。

---

# 二十、Keyboard Shortcuts

至少提供：

Delete
刪除

Ctrl+C
Copy

Ctrl+V
Paste

Ctrl+Z
Undo

Ctrl+Y
Redo

Ctrl+D
Duplicate

Ctrl+A
Select All

Esc
取消選擇

---

# 二十一、Context Menu

Node Right Click：

Edit

Duplicate

Connect

Bring Forward

Send Backward

Move to Namespace

Delete

Canvas Right Click：

Add Node

Add Namespace

Paste

Fit View

Auto Layout

---

# 二十二、Mini Map

右下角提供 Mini Map。

顯示整個 Architecture。

目前 Viewport 使用框線表示。

大型 Architecture 可以快速移動。

---

# 二十三、搜尋

Toolbar 加：

Search Architecture

輸入：

postgres

例如自動 Highlight：

PostgreSQL Primary

PostgreSQL Standby

PostgreSQL Service

PVC

---

# 二十四、架構圖資訊

頂部可以設定：

Architecture Name

Environment

Version

Owner

例如：

Hospital AI Platform

PRODUCTION

v2.3

AI Platform Team

但不要讓這些資訊占用太多畫面。

---

# 二十五、Environment

支援：

DEV

STAGING

PRODUCTION

Architecture 本身不需要重新建立。

可以在圖面上顯示 Environment Badge。

---

# 二十六、Responsive

主要以：

Desktop 1366 × 768

1920 × 1080

為主要操作環境。

但 1024px 寬度仍需可使用。

不要為手機優先設計，因為這是一個架構設計工具。

---

# 二十七、UI 風格

不要：

大量 Gradient

Neon

Glassmorphism

過多動畫

大量 Shadow

遊戲風格

要：

專業

Engineering Tool

Cloud Architecture

Kubernetes Official Style

Clean

Minimal

High Information Density

---

# 二十八、初始畫面

第一次開啟時，直接載入一個完整範例：

Production Kubernetes Application

架構：

Internet

↓

Ingress Controller

↓

Ingress

├── /
│
│ frontend-service
│
│ ↓
│
│ frontend Deployment
│
│ React + Nginx
│ Replicas: 3
│
└── /api

backend-service

↓

FastAPI Deployment

Replicas: 3

├── Redis
│
├── PostgreSQL RW Service
│      ↓
│    PostgreSQL Primary
│      │
│      ├ WAL → Standby 1
│      └ WAL → Standby 2
│
└── MinIO

另外：

Prometheus
↓
Grafana

GitLab
↓
GitLab CI
↓
Registry
↓
ArgoCD
↓
Kubernetes

---

# 二十九、最重要的使用體驗

我要能夠很快完成：

「我要增加 Redis」

拖 Redis 進 Canvas。

「我要 FastAPI 連 Redis」

直接從 FastAPI 拉線到 Redis。

「我要增加 AI Server」

拖 AI Service。

「我要讓 AI 跑 GPU Node」

把 AI Pod 移入 GPU Node Pool。

「我要增加 Standby」

Duplicate PostgreSQL。

「我要建立 Namespace」

新增 Namespace Container。

「我要調整整套架構」

所有元素都可以自由拖拉、Resize、重新連線。

也就是：

Template 只是起點。

Architecture 必須完全自由編輯。

---

# 三十、程式設計要求

不要把所有 JavaScript 寫成大量互相依賴的 global function。

至少概念上拆成：

StateManager

CanvasManager

NodeManager

EdgeManager

GroupManager

HistoryManager

TemplateManager

ExportManager

UIManager

即使全部存在同一個 HTML，也要維持良好的程式結構。

---

# 三十一、穩定性

特別處理：

Node 不可以拖出 Canvas 後找不到。

Group Resize 不可以讓 Child Node 消失。

刪除 Node 時要一起清理相關 Edge。

Undo / Redo 必須能處理：

Add Node

Delete Node

Move Node

Resize

Connect

Disconnect

Property Change

Import Template

---

# 三十二、資料不能因畫面刷新造成程式錯誤

可以提供：

Save Architecture

功能。

因為必須是純單檔 HTML，可以使用瀏覽器 Local Storage 保存目前 Architecture。

另外仍必須提供：

JSON Export

JSON Import

作為正式保存方式。

---

# 三十三、請直接實作

不要只提供 Prototype。

不要只畫 UI Mockup。

請產出：

完整可操作的 index.html。

至少讓以下功能真的可以操作：

Drag Node

Move Node

Connect Node

Delete Node

Edit Node

Group

Zoom

Pan

Template

Undo / Redo

Export JSON

Import JSON

Export SVG

Architecture Template

請優先確保核心 Architecture Editor 功能穩定，再增加視覺效果。

最終程式碼必須可以直接：

儲存成 index.html

然後使用 Chrome / Edge 開啟執行。
