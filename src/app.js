import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requestLogger } from './middleware/logger.js'
import errors from './middleware/errors.js'
import apiService from './service/api.js'
import demoService from './service/demo.js'
import { refreshQQCookie } from './utils/refresher.js'

export const createApp = () => {
  const app = new Hono()
    .use(cors())
    .use(requestLogger)
    .use(errors)

  app.get('/api', apiService)
  app.get('/demo', demoService)

  app.get('/refresh', async (c) => {
    const result = await refreshQQCookie(c.env)
    return c.json(result)
  })

  return app
}

export default createApp
