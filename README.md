# 个人密码管理器（Cloudflare 免费栈）

这是一个适合个人使用的 MVP 项目骨架：

- 前端：React + Vite
- 部署：Cloudflare Pages
- API：Cloudflare Pages Functions
- 数据库：Cloudflare D1
- 加密：浏览器端用 Web Crypto API 加密后再上传

## 重要提醒

当前骨架是 **单用户 MVP**，重点是先跑通“浏览器端加密 + 云端存密文”。

目前还有两个后续必须补的点：

1. `salt` 先保存在浏览器本地，换设备会有问题。
2. 还没有真正的用户系统和数据隔离。

## 本地启动

先安装依赖：

```bash
npm install
```

前端开发模式：

```bash
npm run dev
```

## 之后你要做的事

1. 登录 Cloudflare：

```bash
npx wrangler login
```

2. 创建 D1 数据库：

```bash
npx wrangler d1 create password_manager
```

3. 把输出里的 `database_id` 填到 `wrangler.toml`

4. 创建数据库表：

```bash
npx wrangler d1 execute password_manager --file=./schema.sql
```

5. 构建项目：

```bash
npm run build
```

6. 本地联调 Pages Functions：

```bash
npx wrangler pages dev dist
```

## 目录结构

```txt
password-manager/
├─ package.json
├─ wrangler.toml
├─ schema.sql
├─ vite.config.ts
├─ tsconfig.json
├─ index.html
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ types.ts
│  ├─ crypto.ts
│  ├─ api.ts
│  ├─ utils.ts
│  └─ styles.css
└─ functions/
   └─ api/
      ├─ entries.ts
      └─ entry/
         └─ [id].ts
```
