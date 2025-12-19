export async function refreshQQCookie (env) {
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

  if (!refreshToken || !openid) {
    console.log('Cookie 缺少关键字段 (psrf_qqrefresh_token/psrf_qqopenid)，无法刷新')
    return
  }

  // 3. 请求刷新接口
  try {
    const response = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://y.qq.com/',
        Cookie: currentCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        comm: { f: 'json', os: 1, t: 0, ct: 24, cv: 0 },
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
      })
    })

    const data = await response.json()

    if (data.code !== 0 || data.req?.code !== 0) {
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

    // 合并旧 Cookie
    const updatedCookieDict = { ...cookieDict, ...newCookies }
    const updatedCookieStr = Object.entries(updatedCookieDict)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')

    // 4. 保存到 KV
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
    const [key, val] = part.trim().split('=')
    if (key) dict[key] = val || ''
  })
  return dict
}
