import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import { update } from '../_utils/update.ts'
import { methodJson, sendRes } from '../_utils/utils.ts'
import type { BaseHeaders } from '../_utils/types.ts'

async function main(url: URL, headers: BaseHeaders, method: string, body: any) {
  return update(body)
}

serve(async (event: Request) => {
  try {
    const url: URL = new URL(event.url)
    const headers: BaseHeaders = Object.fromEntries(event.headers.entries())
    const method: string = event.method
    const body: any = methodJson.includes(method) ? await event.json() : Object.fromEntries(url.searchParams.entries())
    return main(url, headers, method, body)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
})
