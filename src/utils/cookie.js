/**
 * 从环境变量读取指定平台的 cookie。
 * 优先读取 METING_COOKIE_<SERVER>，其次 METING_COOKIE。
 */
export function readCookie (server, env) {
  const envSource = env ?? (typeof process !== 'undefined' ? process.env : {}) ?? {}
  const envKey = `METING_COOKIE_${server.toUpperCase()}`
  const value = envSource[envKey] || envSource.METING_COOKIE || ''
  return value.trim()
}

/**
 * 异步读取 Cookie，优先从 KV 读取 (仅限腾讯)，其次环境变量
 */
export async function readCookieAsync (server, env) {
  if (server === 'tencent' && env.METING_KV) {
    const kvCookie = await env.METING_KV.get('cookie_tencent')
    if (kvCookie) return kvCookie.trim()
  }
  return readCookie(server, env)
}

/**
 * 验证 referrer 是否在允许的主机列表。
 */
export function isAllowedHost (referrer, allowHosts = []) {
  if (!allowHosts || allowHosts.length === 0) return true
  if (!referrer) return false

  try {
    const url = new URL(referrer)
    const hostname = url.hostname.toLowerCase()
    return allowHosts.some(rule => {
      if (rule === hostname) return true
      if (rule.includes('*')) {
        const pattern = rule.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
        return new RegExp(`^${pattern}$`).test(hostname)
      }
      return false
    })
  } catch (error) {
    return false
  }
}
