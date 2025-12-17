# meting-api-serverless (Cloudflare Worker)

基于 Hono 的多平台音乐 API 代理，运行在 Cloudflare Workers，封装 [@meting/core](https://www.npmjs.com/package/@meting/core) 对网易云 / QQ 音乐 / 酷狗 / 百度 / 酷我提供统一接口。

## 功能特性

- 🎵 多平台音乐数据透传（搜索、歌曲、专辑、歌单、歌词、封面、播放链接）
- 🔐 HMAC-SHA1 鉴权保护敏感接口（url/pic/lrc）
- 💾 内置 LRU 缓存减少上游调用
- 🍪 按 referrer 白名单决定是否挂载平台 Cookie
- 🧪 内置 `/demo` 页面，直接用 Meting + APlayer 预览

## 快速开始

1. 安装依赖
   ```bash
   npm install
   # 或 pnpm install / yarn install
   ```
2. 本地预览（默认监听 8787）：
   ```bash
   npx wrangler dev
   ```
3. 部署到 Cloudflare Workers：
   ```bash
   npx wrangler deploy
   ```
4. 访问示例
   - API: `https://<your-worker>/api?server=netease&type=search&id=hello`
   - Demo: `https://<your-worker>/demo?server=netease&type=search&id=hello`

### Vercel Edge 部署

- 项目已提供 `api/edge.js` 与 `vercel.json`，把本仓库直接部署到 Vercel 即可。
- 所有路由通过 `vercel.json` 重写到 Edge Function，访问路径保持与 Worker 一致(`/api`、`/demo`)。
- 环境变量在 Vercel Dashboard 中配置同名项（`METING_TOKEN` 建议放 Secrets）。
- 本地验证可用 `vercel dev`。

### 前端接入 (MetingJS/APlayer)

- 在客户端只需把 `meting_api` 指向本服务的 `/api`，无需修改 meting.js 源码。示例：`meting_api: http://127.0.0.1:8787/api?server=:server&type=:type&id=:id`
- APlayer/Meting 会将占位符 `:server/:type/:id` 替换为组件传入的值，因此你的 Worker/Vercel 部署可以直接作为后端 API。

## 环境变量清单

在 `wrangler.toml` 中留占位，正式值请用 `wrangler secret put <NAME>` 或 Cloudflare Dashboard 的环境变量/Secret 管理。

| 变量名                        | 默认值    | 说明                                                                                               |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `HTTP_PREFIX`               | ``        | 可选路由前缀，留空表示根路径                                                                       |
| `METING_URL`                | -         | 对外可访问的基地址，用于生成回调链接；缺省时使用请求的 origin+前缀                                 |
| `METING_TOKEN`              | `token` | HMAC 鉴权密钥，建议修改，建议设置为 Secret 变量                                                    |
| `METING_COOKIE_ALLOW_HOSTS` | ``        | 允许使用携带平台 Cookie 后端的 referrer host 白名单（英文逗号分隔，留空表示不限制，支持 * 通配符） |
| `METING_COOKIE_NETEASE`     | ``        | 网易云 Cookie（可选，带登录态的数据）                                                              |
| `METING_COOKIE_TENCENT`     | ``        | QQ 音乐 Cookie（可选）                                                                             |
| `METING_COOKIE_KUGOU`       | ``        | 酷狗 Cookie（可选）                                                                                |
| `METING_COOKIE_BAIDU`       | ``        | 百度 Cookie（可选）                                                                                |
| `METING_COOKIE_KUWO`        | ``        | 酷我 Cookie（可选）                                                                                |
| `METING_COOKIE`             | ``        | 通用 Cookie 兜底，平台专用值为空时使用                                                             |

## API

基础路径：`/api`

**请求参数**

| 参数                 | 必填 | 说明                                                                                        |
| -------------------- | ---- | ------------------------------------------------------------------------------------------- |
| `server`           | 是   | `netease` / `tencent` / `kugou` / `baidu` / `kuwo`                                |
| `type`             | 是   | `search` / `song` / `album` / `artist` / `playlist` / `lrc` / `url` / `pic` |
| `id`               | 是   | 资源 ID                                                                                     |
| `token` / `auth` | 部分 | `lrc` / `url` / `pic` 需要鉴权                                                        |

**返回**

- `search`/`song`/`album`/`artist`/`playlist`: JSON 数组
- `lrc`: LRC 文本
- `url`/`pic`: 302 重定向到真实资源

## 鉴权计算

`auth = HMAC-SHA1(METING_TOKEN, server + type + id)`

示例（Node.js）：

```js
import { createHmac } from 'crypto'

const auth = ({ server, type, id, secret = 'token' }) =>
  createHmac('sha1', secret).update(`${server}${type}${id}`).digest('hex')
```

## 缓存策略

- 缓存容量：1000 条
- TTL：`url` 10 分钟，其余 1 小时
- 未命中时响应头附带 `x-cache: miss`

## Demo 页面

`/demo` 使用 Meting + APlayer，可通过 query 参数调整：
`server` / `type` / `id`，并通过 `api` 属性反向调用 `/api`。
