import Meting from '@meting/core'
import aesjs from 'aes-js'
import { createHash } from 'crypto'
import hashjs from 'hash.js'
import { HTTPException } from 'hono/http-exception'
import { loadConfig } from '../config.js'
import { format as lyricFormat } from '../utils/lyric.js'
import { readCookie, isAllowedHost } from '../utils/cookie.js'
import { LRUCache } from 'lru-cache'

const cache = new LRUCache({
  max: 1000,
  ttl: 1000 * 30
})

// Cloudflare Workers 禁用 AES-ECB，@meting/core 在网易云请求中用到了 aes-128-ecb。
// 这里用纯 JS 实现的 AES-ECB 替换默认实现，避免 createCipheriv 报 iv 为 null。
const patchNeteaseEapiEncrypt = (meting) => {
  const provider = meting?.provider
  if (!provider || provider.name !== 'netease') return

  const proto = Object.getPrototypeOf(provider)
  if (proto.__patchedEapi) return
  proto.__patchedEapi = true

  proto.eapiEncrypt = (req) => {
    const bodyStr = JSON.stringify(req.body)
    const path = req.url.replace(/https?:\/\/[^/]+/, '')
    const signSeed = `nobody${path}use${bodyStr}md5forencrypt`
    const sign = createHash('md5').update(signSeed).digest('hex')
    const payload = `${path}-36cd479b6b5-${bodyStr}-36cd479b6b5-${sign}`

    const key = Buffer.from('e82ckenh8dichen8', 'utf8')
    const textBytes = Buffer.from(payload, 'utf8')
    const padded = aesjs.padding.pkcs7.pad(textBytes)
    const aesEcb = new aesjs.ModeOfOperation.ecb(key)
    const encryptedBytes = aesEcb.encrypt(padded)
    const encryptedHex = Buffer.from(encryptedBytes).toString('hex').toUpperCase()

    req.url = req.url.replace('/api/', '/eapi/')
    req.body = { params: encryptedHex }
    return req
  }
}

const METING_METHODS = {
  search: 'search',
  song: 'song',
  album: 'album',
  artist: 'artist',
  playlist: 'playlist',
  lrc: 'lyric',
  url: 'url',
  pic: 'pic'
}

export default async (c) => {
  const config = loadConfig(c.env, c.req.url)
  const baseUrl = config.meting.url || new URL(c.req.url).origin
  const token = config.meting.token || 'token'

  // 1. 初始化参数
  const query = c.req.query()
  const server = query.server || 'netease'
  const type = query.type || 'search'
  const id = query.id || 'hello'
  const authToken = query.token || query.auth || token

  // 2. 校验参数
  if (!['netease', 'tencent', 'kugou', 'baidu', 'kuwo'].includes(server)) {
    throw new HTTPException(400, { message: 'server 参数不合法' })
  }
  if (!['song', 'album', 'search', 'artist', 'playlist', 'lrc', 'url', 'pic'].includes(type)) {
    throw new HTTPException(400, { message: 'type 参数不合法' })
  }

  // 3. 鉴权
  if (['lrc', 'url', 'pic'].includes(type)) {
    if (auth(server, type, id, token) !== authToken) {
      throw new HTTPException(401, { message: '鉴权失败,非法调用' })
    }
  }

  // 4. 调用 API
  const cacheKey = `${server}/${type}/${id}`
  let data = cache.get(cacheKey)
  if (data === undefined) {
    c.header('x-cache', 'miss')
    const meting = new Meting(server)
    patchNeteaseEapiEncrypt(meting)
    meting.format(true)

    // 检查 referrer 并配置 cookie
    const referrer = c.req.header('referer')
    if (isAllowedHost(referrer, config.meting.cookie.allowHosts)) {
      const cookie = readCookie(server, c.env)
      if (cookie) {
        meting.cookie(cookie)
      }
    }

    const method = METING_METHODS[type]
    let response
    try {
      response = await meting[method](id)
    } catch (error) {
      console.error(error)
      throw new HTTPException(500, { message: '上游 API 调用失败' })
    }
    try {
      data = JSON.parse(response)
    } catch (error) {
      throw new HTTPException(500, { message: '上游 API 返回格式异常' })
    }
    cache.set(cacheKey, data, {
      ttl: type === 'url' ? 1000 * 60 * 10 : 1000 * 60 * 60
    })
  }

  // 5. 组装结果
  if (type === 'url') {
    let url = data.url
    if (!url) {
      return c.body(null, 404)
    }
    if (server === 'netease') {
      url = url
        .replace('://m7c.', '://m7.')
        .replace('://m8c.', '://m8.')
        .replace('http://', 'https://')
      if (url.includes('vuutv=')) {
        const tempUrl = new URL(url)
        tempUrl.search = ''
        url = tempUrl.toString()
      }
    }
    if (server === 'tencent') {
      url = url
        .replace('http://', 'https://')
        .replace('://ws.stream.qqmusic.qq.com', '://dl.stream.qqmusic.qq.com')
    }
    if (server === 'baidu') {
      url = url
        .replace('http://zhangmenshiting.qianqian.com', 'https://gss3.baidu.com/y0s1hSulBw92lNKgpU_Z2jR7b2w6buu')
    }
    return c.redirect(url)
  }

  if (type === 'pic') {
    const url = data.url
    if (!url) {
      return c.body(null, 404)
    }
    return c.redirect(url)
  }

  if (type === 'lrc') {
    return c.text(lyricFormat(data.lyric, data.tlyric || ''))
  }

  return c.json(
    data.map((x) => {
      return {
        title: x.name,
        author: x.artist.join(' / '),
        url: `${baseUrl}/api?server=${server}&type=url&id=${x.url_id}&auth=${auth(server, 'url', x.url_id, token)}`,
        pic: `${baseUrl}/api?server=${server}&type=pic&id=${x.pic_id}&auth=${auth(server, 'pic', x.pic_id, token)}`,
        lrc: `${baseUrl}/api?server=${server}&type=lrc&id=${x.lyric_id}&auth=${auth(server, 'lrc', x.lyric_id, token)}`
      }
    })
  )
}

const auth = (server, type, id, token) => {
  return hashjs.hmac(hashjs.sha1, token).update(`${server}${type}${id}`).digest('hex')
}
