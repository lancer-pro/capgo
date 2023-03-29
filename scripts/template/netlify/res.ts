import { basicHeaders, corsHeaders } from 'supabase/functions/_utils/utils'

// upper is ignored during netlify generation phase
// import from here
export const sendRes = (data: any = { status: 'ok' }, statusCode = 200, bg = false) => {
  if (statusCode >= 400)
    console.error('sendRes error', JSON.stringify(data, null, 2))

  if (bg)
    return
  return {
    statusCode,
    headers: { ...basicHeaders, ...corsHeaders },
    body: JSON.stringify(data),
  }
}
