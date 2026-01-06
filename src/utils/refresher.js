import { createHash } from 'node:crypto'

export async function refreshQQCookie (env) {
  const result = { success: false, message: '未执行刷新', data: null }

  let currentCookie = ''
  // 0. 检查 KV 是否绑定
  if (!env.METING_KV) {
    result.message = '错误: 未绑定 METING_KV。请在 Dashboard 绑定 KV Namespace。'
    console.warn(result.message)
    return result
  }
  else {
    currentCookie = await env.METING_KV.get('cookie_tencent')
  }

  // 1. 获取当前 Cookie

  if (!currentCookie) {
    currentCookie = env.METING_COOKIE_TENCENT || env.METING_COOKIE || ''
  }
  

  if (!currentCookie) {
    result.message = '错误: 未找到 QQ 音乐 Cookie'
    console.log(result.message)
    return result
  }

  // 2. 解析 Cookie
  const cookieDict = parseCookie(currentCookie)
  const refreshToken = cookieDict.psrf_qqrefresh_token
  const openid = cookieDict.psrf_qqopenid
  const uin = cookieDict.uin || ''
  const strMusicId = uin.replace(/\D/g, '')
  const musicKey = cookieDict.qqmusic_key || cookieDict.qm_keyst || ''
  const accessToken = cookieDict.psrf_qqaccess_token || ''
  const refreshKey = cookieDict.psrf_qqrefresh_key || ''
  
  // 尝试从 Cookie 中提取 QIMEI
  const qimei36 = cookieDict._qimei_q36 || ''
  const qimei16 = cookieDict._qimei_q16 || (qimei36 ? qimei36.substring(0, 16) : '')

  if (!refreshToken || !openid) {
    result.message = '错误: Cookie 缺少关键字段 (psrf_qqrefresh_token/psrf_qqopenid)'
    console.log(result.message)
    return result
  }

  // 3. 构造请求参数
  // 注意：如果 refreshKey 为空，仍需传递空字符串，否则可能导致签名校验失败或参数错误
  const comm = buildComm(strMusicId, musicKey, qimei16, qimei36)
  const reqData = {
    comm,
    req: {
      module: 'music.login.LoginServer',
      method: 'Login',
      param: {
        openid,
        access_token: accessToken,
        refresh_token: refreshToken,
        expired_in: 0,
        musicid: parseInt(strMusicId || '0'),
        musickey: musicKey,
        refresh_key: refreshKey,
        loginMode: 2
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
        'User-Agent': 'Android12-AndroidPhone-20349-201-0-ting#958959317/661004247-LOGIN-wifi',
        'Content-Type': 'application/json'
      },
      body: bodyStr
    })

    const data = await response.json()
    // result.data = data // 避免返回敏感数据

    // 检查响应
    if (data.req?.code !== 0) {
      result.message = `刷新失败 (Code: ${data.req?.code || 'Unknown'}): 这通常意味着 Cookie 已完全失效、签名错误或缺少 refresh_key。原始响应: ${JSON.stringify(data)}`
      console.error(result.message)
      return result
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
      result.success = true
      result.message = 'QQ 音乐 Cookie 刷新成功并已保存到 KV'
      console.log(result.message)
    } else {
      result.success = true
      result.message = 'Cookie 未发生变化'
      console.log(result.message)
    }
  } catch (e) {
    result.message = `系统错误: ${e.message}`
    console.error('刷新过程出错:', e)
  }

  return result
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

// --- 签名算法 (使用 node:crypto) ---

function signBody (payload) {
  const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19].filter(x => x < 40)
  const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]
  const SCRAMBLE_VALUES = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179]

  // 使用 node:crypto 进行 SHA1 计算，确保准确性
  const hash = createHash('sha1').update(payload, 'utf8').digest('hex').toUpperCase()

  const part1 = PART_1_INDEXES.map(i => hash[i]).join('')
  const part2 = PART_2_INDEXES.map(i => hash[i]).join('')
  
  const part3 = new Uint8Array(20)
  for (let i = 0; i < SCRAMBLE_VALUES.length; i++) {
    const v = SCRAMBLE_VALUES[i]
    const hexVal = parseInt(hash.substring(i * 2, i * 2 + 2), 16)
    part3[i] = v ^ hexVal
  }

  // Base64 编码
  let binary = ''
  for (let i = 0; i < part3.length; i++) {
    binary += String.fromCharCode(part3[i])
  }
  const b64Part = btoa(binary).replace(/[\\/+=]/g, '')

  return `zzc${part1}${b64Part}${part2}`.toLowerCase()
}

function buildComm (uin, token, qimei16, qimei36) {
  const randomHex = (len) => {
    let res = ''
    const chars = '0123456789abcdef'
    for (let i = 0; i < len; i++) res += chars[Math.floor(Math.random() * chars.length)]
    return res
  }

  // 优先使用 Cookie 中的 QIMEI，否则随机
  const QIMEI = qimei16 || randomHex(16)
  const QIMEI36 = qimei36 || randomHex(36)

  const common = {
    v: 14090008,
    ct: 11,
    cv: 14090008,
    chid: '2005000982',
    QIMEI, 
    QIMEI36,
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
