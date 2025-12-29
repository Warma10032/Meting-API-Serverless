# meting-api-serverless

基于 Hono 的多平台音乐 API 代理，封装 [@meting/core](https://www.npmjs.com/package/@meting/core) 对网易云 / QQ 音乐 / 酷狗 / 百度 / 酷我提供统一接口，支持运行在 Cloudflare Workers、Vercel。

## 🚀 部署教程

本项目支持 Cloudflare Workers 和 Vercel 两种部署方式，推荐使用 Cloudflare Workers 以获得最佳性能和功能支持（QQ音乐 Cookie 自动保活）。

### 方式一：Cloudflare Workers (推荐)

#### 1. 一键部署

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Warma10032/Meting-API-Serverless)

点击按钮，登录 Cloudflare 账号，选择账户并点击 "Deploy" 即可完成基础部署。

#### 2. 配置环境变量

为了安全和功能完整，请在 Cloudflare Dashboard 中配置环境变量：

1. 进入 **Workers & Pages** -> 选择本项目 -> **Settings** -> **Variables**。
2. 点击 **Add variable** 添加以下变量：

| 变量名                        | 推荐值/说明                                                                         |
| :---------------------------- | :---------------------------------------------------------------------------------- |
| `METING_TOKEN`              | **强烈建议修改**。API 鉴权密钥，防止接口被滥用                                |
| `METING_COOKIE_ALLOW_HOSTS` | **推荐设置**。允许访问 vip 资源的域名白名单（如 `example.com,*.test.com`） |
| `METING_COOKIE_TENCENT`     | QQ 音乐 Cookie。用于获取 VIP资源，**支持自动保活**                            |
| `METING_COOKIE_NETEASE`     | 网易云 Cookie。用于获取 VIP资源                                                     |
| `METING_COOKIE_KUGOU`       | 酷狗 Cookie                                                                         |
| `METING_COOKIE_KUWO`        | 酷我 Cookie                                                                         |

#### 3. 配置 QQ 音乐 Cookie 保活 (可选)

如果你配置了 `METING_COOKIE_TENCENT`，建议开启自动保活功能，否则 Cookie 过期后需要手动更新。

**3.1 创建 KV 数据库**

1. 在左侧菜单点击 **Storage & Databases** -> **KV Namespace**
2. 点击 **Create**，命名随意（例如 `meting_kv`），点击 **Add**

**3.2 绑定 KV 数据库**

1. 回到 **Workers & Pages** -> 选择本项目  -> **Bindings**
2. 点击 **Add** -> **KV Namespace**
3. **Variable name** 必须填写：`METING_KV`
4. **KV Namespace** 选择你刚才创建的数据库
5. 点击 **Deploy** 保存

**3.3 添加定时任务**

1. 回到 **Workers & Pages** -> 选择本项目  -> **Settings**
2. 点击 **Trigger Events** 的 **Add**
3. 选择添加 Cron Triggers
4. 设置频率为每 4 小时一次

完成以上步骤后，Worker 会自动将 QQ 音乐 Cookie 存入 KV，并定期刷新，无需人工干预。

> 注意：
>
> 1. 如果此时cookie过期，需要在KV存储中改对应的值。
> 2. 重新部署后若绑定消失，需要重新添加KV存储绑定

---

### 方式二：Vercel 部署

1. 点击按钮一键部署：

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FWarma10032%2FMeting-API-Serverless&project-name=meting-api-serverless&repository-name=Meting-API-Serverless)
2. 部署完成后，进入 Project Settings -> Environment Variables 添加环境变量。

   | 变量名                        | 推荐值/说明                                                                         |
   | :---------------------------- | :---------------------------------------------------------------------------------- |
   | `METING_TOKEN`              | **强烈建议修改**。API 鉴权密钥，防止接口被滥用                                |
   | `METING_COOKIE_ALLOW_HOSTS` | **推荐设置**。允许访问 vip 资源的域名白名单（如 `example.com,*.test.com`） |
   | `METING_COOKIE_TENCENT`     | QQ 音乐 Cookie。用于获取 VIP资源                                                    |
   | `METING_COOKIE_NETEASE`     | 网易云 Cookie。用于获取 VIP资源                                                     |
   | `METING_COOKIE_KUGOU`       | 酷狗 Cookie                                                                         |
   | `METING_COOKIE_KUWO`        | 酷我 Cookie                                                                         |

> 注意：Vercel 部署不支持 QQ 音乐 Cookie 的自动保活功能。

## 🛠️ 使用指南

### API 接口

基础路径：`https://你的域名/api`

**请求参数**

| 参数       | 必填 | 说明                                                                                                  |
| ---------- | ---- | ----------------------------------------------------------------------------------------------------- |
| `server` | 是   | 平台：`netease` (网易云) / `tencent` (QQ) / `kugou` (酷狗) / `baidu` (百度) / `kuwo` (酷我) |
| `type`   | 是   | 类型：`search` / `song` / `album` / `artist` / `playlist` / `lrc` / `url` / `pic`     |
| `id`     | 是   | 资源 ID (如歌曲 ID、歌单 ID)                                                                          |

**示例**

- 获取网易云歌曲详情：`https://你的域名/api?server=netease&type=song&id=186016`

### 前端接入 (MetingJS)

如果你使用 [MetingJS](https://github.com/metowolf/MetingJS)，只需设置 `meting_api` 即可：

```html
<meting-js
    server="netease"
    type="playlist"
    id="60198"
    meting_api="https://你的域名/api?server=:server&type=:type&id=:id">
</meting-js>
```

## ⚙️ 环境变量清单

在 `wrangler.toml` 中留占位，正式值请用 `wrangler secret put <NAME>` 或 Cloudflare Dashboard 的环境变量/Secret 管理。

| 变量名                        | 默认值    | 说明                                                                                   |
| ----------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `HTTP_PREFIX`               |           | 路由前缀（可选，留空表示根路径）                                                       |
| `METING_URL`                |           | 对外可访问的基地址，用于生成回调链接（默认使用请求的 origin+路由前缀）                 |
| `METING_TOKEN`              | `token` | HMAC 鉴权密钥，默认 `token`，强烈建议更改并设置为 Secret                             |
| `METING_COOKIE_ALLOW_HOSTS` |           | 允许访问平台 Cookie 的 referrer host 白名单（逗号分隔，留空表示不限制，支持 * 通配符） |
| `METING_COOKIE_NETEASE`     |           | 网易云 Cookie（可选）                                                                  |
| `METING_COOKIE_TENCENT`     |           | QQ 音乐 Cookie（可选）                                                                 |
| `METING_COOKIE_KUGOU`       |           | 酷狗 Cookie（可选）                                                                    |
| `METING_COOKIE_BAIDU`       |           | 百度 Cookie（可选）                                                                    |
| `METING_COOKIE_KUWO`        |           | 酷我 Cookie（可选）                                                                    |
| `METING_COOKIE`             |           | 通用 Cookie 兜底，平台专用值为空时使用（可选）                                         |

## 📝 开发与调试

1. 安装依赖：`npm install`
2. 本地启动：`npx wrangler dev`
3. 访问测试：`http://localhost:8787/demo`

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
