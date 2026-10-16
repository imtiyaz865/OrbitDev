import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { eventsRouter } from './routes/events.js'
import { adminRouter } from './routes/admin.js'

export function createApp() {
  const app = express()
  const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
      return callback(new Error('Origin is not allowed by CORS'))
    },
    credentials: true,
  }))
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/admin/import', rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }))

  app.get('/api/health', (_request, response) => response.json({ data: { status: 'ok' } }))
  app.use('/api/events', eventsRouter)
  app.use('/api/admin', adminRouter)

  app.use((error, _request, response, _next) => {
    if (error?.type === 'entity.too.large') {
      return response.status(413).json({ error: { message: 'Request body is too large.' } })
    }
    if (error?.message === 'Origin is not allowed by CORS') {
      return response.status(403).json({ error: { message: error.message } })
    }
    console.error('Unhandled API error:', error.message)
    return response.status(500).json({ error: { message: 'An unexpected server error occurred.' } })
  })

  return app
}
