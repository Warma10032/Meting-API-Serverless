export async function refreshQQCookie (env) {
  // 0. 检查 KV 是否绑定
  if (!env.METING_KV) {
    console.warn('未绑定 METING_KV，跳过 QQ 音乐 Cookie 刷新。请在 wrangler.toml 或 Dashboard 中重新绑定 KV Namespace。')
    return
  }

  // 1. 获取当前 Cookie (优先 KV，其次环境变量)
  let currentCookie = await env.METING_KV.get('cookie_tencent')
  if (!currentCookie) {
    currentCookie = env.METING_COOKIE_TENCENT || env.METING_COOKIE || ''
  }

  if (!currentCookie) {
    console.log('未找到 QQ 音乐 Cookie，跳过刷新')
    return
  }

  // 2. 解析 Cookie
  const cookieDict = parseCookie(currentCookie)
  const refreshToken = cookieDict.psrf_qqrefresh_token
  const openid = cookieDict.psrf_qqopenid
  const uin = cookieDict.uin || ''
  const strMusicId = uin.replace(/\D/g, '') // 提取数字
  const token = cookieDict.qqmusic_key || cookieDict.qm_keyst || ''

  if (!refreshToken || !openid) {
    console.log('Cookie 缺少关键字段 (psrf_qqrefresh_token/psrf_qqopenid)，无法刷新')
    return
  }

  // 3. 构造请求参数 (完全复刻 lx-music-api-server 逻辑)
  const comm = buildComm(strMusicId, token)
  const reqData = {
    comm,
    req: {
      module: 'music.login.LoginServer',
      method: 'Login',
      param: {
        code: '',
        openid,
        refresh_token: refreshToken,
        str_musicid: strMusicId,
        type: 2
      }
    }
  }

  const bodyStr = JSON.stringify(reqData)
  const sign = signBody(bodyStr)

  // 4. 请求刷新接口
  try {
    const response = await fetch(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Android12-AndroidPhone-20349-201-0-ting#958959317/661004247-LOGIN-wifi', // 模拟安卓 UA
        'Content-Type': 'application/json'
      },
      body: bodyStr
    })

    const data = await response.json()

    // 检查响应
    if (data.req?.code !== 0) {
      console.error('刷新请求失败:', JSON.stringify(data))
      return
    }

    const loginData = data.req.data
    const newCookies = {}

    // 提取新字段
    if (loginData.musickey) {
      newCookies.qm_keyst = loginData.musickey
      newCookies.qqmusic_key = loginData.musickey
    }
    if (loginData.qqmusic_key) newCookies.qqmusic_key = loginData.qqmusic_key
    if (loginData.refresh_token) newCookies.psrf_qqrefresh_token = loginData.refresh_token
    if (loginData.access_token) newCookies.psrf_qqaccess_token = loginData.access_token
    if (loginData.openid) newCookies.psrf_qqopenid = loginData.openid
    if (loginData.refresh_key) newCookies.psrf_qqrefresh_key = loginData.refresh_key

    // 合并旧 Cookie
    const updatedCookieDict = { ...cookieDict, ...newCookies }
    const updatedCookieStr = Object.entries(updatedCookieDict)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')

    // 5. 保存到 KV
    if (updatedCookieStr !== currentCookie) {
      await env.METING_KV.put('cookie_tencent', updatedCookieStr)
      console.log('QQ 音乐 Cookie 刷新成功并已保存到 KV')
    } else {
      console.log('Cookie 未发生变化')
    }
  } catch (e) {
    console.error('刷新过程出错:', e)
  }
}

function parseCookie (str) {
  const dict = {}
  if (!str) return dict
  str.split(';').forEach(part => {
    const i = part.indexOf('=')
    if (i !== -1) {
      const key = part.substring(0, i).trim()
      const val = part.substring(i + 1).trim()
      dict[key] = val
    }
  })
  return dict
}

// --- 以下为移植的签名算法与辅助函数 ---

// 移植自 lx-music-api-server/modules/plat/tx/sign.py
function signBody (payload) {
  const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19].filter(x => x < 40)
  const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]
  const SCRAMBLE_VALUES = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179]

  const hash = sha1(payload).toUpperCase()

  const part1 = PART_1_INDEXES.map(i => hash[i]).join('')
  const part2 = PART_2_INDEXES.map(i => hash[i]).join('')
  
  const part3 = new Uint8Array(20)
  for (let i = 0; i < SCRAMBLE_VALUES.length; i++) {
    const v = SCRAMBLE_VALUES[i]
    const hexVal = parseInt(hash.substring(i * 2, i * 2 + 2), 16)
    part3[i] = v ^ hexVal
  }

  // Base64 编码并移除特殊字符
  let binary = ''
  for (let i = 0; i < part3.length; i++) {
    binary += String.fromCharCode(part3[i])
  }
  // 兼容 Cloudflare Workers / Browser 环境
  const b64Part = btoa(binary).replace(/[\\/+=]/g, '')

  return `zzc${part1}${b64Part}${part2}`.toLowerCase()
}

// 简单的 SHA1 实现 (避免依赖 crypto 库以适应 Edge 环境)
function sha1 (str) {
  const utf8 = unescape(encodeURIComponent(str))
  const arr = []
  for (let i = 0; i < utf8.length; i++) arr.push(utf8.charCodeAt(i))
  
  // Append padding
  const len = arr.length * 8
  arr.push(0x80)
  while ((arr.length * 8 + 64) % 512 !== 0) arr.push(0)
  
  // Append length
  for (let i = 0; i < 8; i++) {
    arr.push((len >>> ((7 - i) * 8)) & 0xff)
  }

  const w = new Array(80)
  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  for (let i = 0; i < arr.length; i += 64) {
    const chunk = arr.slice(i, i + 64)
    for (let j = 0; j < 16; j++) {
      w[j] = (chunk[j * 4] << 24) | (chunk[j * 4 + 1] << 16) | (chunk[j * 4 + 2] << 8) | chunk[j * 4 + 3]
    }
    for (let j = 16; j < 80; j++) {
      w[j] = (w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16])
      w[j] = (w[j] << 1) | (w[j] >>> 31)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let j = 0; j < 80; j++) {
      let f, k
      if (j < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (j < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }

      const temp = ((a << 5) | (a >>> 27)) + f + e + k + w[j]
      e = d
      d = c
      c = (b << 30) | (b >>> 2)
      b = a
      a = temp | 0
    }

    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }

  return [h0, h1, h2, h3, h4]
    .map(x => (x >>> 0).toString(16).padStart(8, '0'))
    .join('')
}

// 移植自 lx-music-api-server/modules/plat/tx/utils.py
function buildComm (uin, token) {
  // 模拟 QIMEI (随机生成)
  const randomHex = (len) => {
    let res = ''
    const chars = '0123456789abcdef'
    for (let i = 0; i < len; i++) res += chars[Math.floor(Math.random() * chars.length)]
    return res
  }

  const common = {
    v: 14090008,
    ct: 11,
    cv: 14090008,
    chid: '2005000982',
    QIMEI: randomHex(16), // 模拟 QIMEI16
    QIMEI36: randomHex(36), // 模拟 QIMEI36
    tmeAppID: 'qqmusic',
    format: 'json',
    inCharset: 'utf-8',
    outCharset: 'utf-8',
    OpenUDID: 'ffffffffbff94f7d000000000033c587',
    udid: 'ffffffffbff94f7d000000000033c587',
    os_ver: '12',
    aid: 'd2550265db4ce5c4',
    phonetype: '22011211C',
    devicelevel: 31,
    newdevicelevel: 31,
    nettype: '1030',
    rom: '12',
    OpenUDID2: 'ffffffffbff94f7d000001999ff7d5bf'
  }

  if (uin && token) {
    common.qq = uin
    common.authst = token
    common.tmeLoginType = 2
  }

  return common
}
