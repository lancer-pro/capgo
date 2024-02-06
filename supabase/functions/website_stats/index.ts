import { app } from '../_backend/private/webapps/public_stats.ts'
import { Hono } from 'hono'

const functionName = 'webstie_stats'
const appGlobal = new Hono().basePath(`/${functionName}`)

appGlobal.route('/', app)

Deno.serve(appGlobal.fetch)
