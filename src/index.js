import { createApp } from './app.js'
import { stripPrefix } from './utils/prefix.js'
import { refreshQQCookie } from './utils/refresher.js'

const app = createApp()

export default {
  async fetch (request, env, ctx) {
    const normalizedRequest = stripPrefix(request, env)
    return app.fetch(normalizedRequest, env, ctx)
  },
  async scheduled (event, env, ctx) {
    ctx.waitUntil(refreshQQCookie(env))
  }
}
