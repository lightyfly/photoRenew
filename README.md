# Photo Renew（老照片修复）

一个前后端分离的网站示例：
- 前端：React + Vite（注册/登录、上传照片、输入提示词、展示修复结果）
- 后端：Node.js + Express（用户认证、次数配额、调用 Google Nano Banana / Gemini 2.5 Flash API）
- 部署：可拆成两个 Vercel 项目，也支持单项目部署（仓库根目录）

## 功能说明

- 用户注册、登录
- 每个新用户默认赠送 **5 次**照片修复额度
- 每次成功调用 `POST /api/restore` 后，额度自动 -1
- 当额度为 0 时，接口拒绝继续调用

## 目录结构

- `frontend/`：前端项目
- `backend/`：后端项目
- `vercel.json`：仓库根目录单项目部署配置（前端静态站点 + 后端 API）

## 1) 启动后端

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

后端默认运行在 `http://localhost:3001`。

## 2) 启动前端

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

前端默认运行在 `http://localhost:5173`。

## 3) 环境变量

### backend/.env

- `GOOGLE_API_KEY`：你的 Google AI API Key（必填）
- `GOOGLE_MODEL`：默认 `gemini-2.5-flash-image-preview`
- `PORT`：本地端口，默认 `3001`

### frontend/.env

- `VITE_API_BASE_URL`：可选。默认空字符串（同域名走 `/api/*`）。
- 如果你把前后端分开部署，则设置为后端域名，例如 `https://photo-renew-api.vercel.app`

## 4) API 接口

### 用户认证

- `POST /api/auth/register`
  - body: `{ "email": "a@b.com", "password": "123456" }`
  - 返回 token 和用户信息，初始 `remainingCredits = 5`

- `POST /api/auth/login`
  - body: `{ "email": "a@b.com", "password": "123456" }`
  - 返回 token 和用户信息

- `GET /api/auth/me`
  - header: `Authorization: Bearer <token>`
  - 返回当前用户信息和剩余额度

### 照片修复

- `POST /api/restore`
  - header: `Authorization: Bearer <token>`
  - `multipart/form-data`
  - 字段：
    - `image`：图片文件（必填）
    - `prompt`：可选自定义提示词

成功响应：

```json
{
  "imageBase64": "...",
  "mimeType": "image/png",
  "remainingCredits": 4
}
```

## 5) Vercel 部署方式（已更新为更稳定配置）

### 方式 A：单项目部署（推荐先用这个，最不容易 404）

1. 在 Vercel 新建项目，直接指向仓库根目录（Root Directory 留空或 `.`）。
2. 使用仓库根目录的 `vercel.json`（本仓库已提供）：
   - 前端由 `frontend/package.json` 构建静态站点
   - 后端通过 `api/index.js` 入口（转发到 `backend/src/index.js`）提供 `/api/*`
3. 在 Vercel 项目环境变量里配置：
   - `GOOGLE_API_KEY`
   - `GOOGLE_MODEL`（可选）

这样访问站点域名时不会出现 “404 NOT_FOUND”。

### 方式 B：双项目部署（前后端分离）

1. **photo-renew-frontend**
   - Root Directory 选 `frontend`
   - 环境变量：`VITE_API_BASE_URL=https://你的后端域名`

2. **photo-renew-backend**
   - Root Directory 选 `backend`
   - 环境变量：`GOOGLE_API_KEY=...`、`GOOGLE_MODEL=gemini-2.5-flash-image-preview`

## 6) 为什么会出现你截图里的 404 NOT_FOUND？

通常是以下原因之一：

1. **把整个仓库部署了，但 Vercel 没有在根目录找到可发布的前端入口**（之前只有 `frontend/index.html`，根目录没有 `index.html`）。
2. **Root Directory 配错**：例如应选 `frontend` 却留在仓库根目录（且根目录没有正确构建配置）。
3. **前端部署成功但请求后端地址错误**：之前默认值是 `http://localhost:3001`，在 Vercel 浏览器环境会失效。

本次已修复：
- 新增仓库根 `vercel.json` + `api/index.js`（Vercel Serverless 规范目录），支持单项目路由前端 + `/api`。
- 前端默认 API 地址改为同域名（空字符串 + `/api/*`），避免线上请求 `localhost`。



### 部署后仍然 404 的必查项

1. Vercel Project 的 **Root Directory 必须是仓库根目录**（不是 `frontend`）。
2. Deployments 页面确认访问的是 **Latest Production**（不是旧的 Preview 链接）。
3. 确认仓库根目录存在本文档对应的 `vercel.json`（当前版本使用 `framework/buildCommand/outputDirectory/functions/rewrites` 方案）。
4. 如你之前改过 Build & Output Settings，建议清空为默认（让 `vercel.json` 接管）。

> 注意：当前示例将用户数据存储在 `backend/data/users.json`。Vercel Serverless 是无状态环境，生产建议接入数据库（如 PostgreSQL / Redis / Supabase）以持久化用户与额度数据。
