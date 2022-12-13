import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { checkAppOwner, supabaseAdmin, updateOrCreateChannel } from '../_utils/supabase.ts'
import type { Database } from '../_utils/supabase.types.ts'
import { checkKey, fetchLimit, sendRes } from '../_utils/utils.ts'

interface ChannelSet {
  app_id: string
  channel: string
  version?: string
  public?: boolean
  disableAutoUpdateUnderNative?: boolean
  disableAutoUpdateToMajor?: boolean
  ios?: boolean
  android?: boolean
  allow_device_self_set?: boolean
  allow_emulator?: boolean
  allow_dev?: boolean
}
interface GetDevice {
  app_id: string
  channel?: string
  page?: number
}

export const get = async (event: Request, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
  const body = (await event.json()) as GetDevice
  if (!body.app_id || !(await checkAppOwner(apikey.user_id, body.app_id)))
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  // get one channel or all channels
  if (body.channel) {
    const { data: dataChannel, error: dbError } = await supabaseAdmin()
      .from('channels')
      .select(`
        id,
        created_at,
        name,
        app_id,
        created_by,
        updated_at,
        public,
        disableAutoUpdateUnderNative,
        disableAutoUpdateToMajor,
        is_emulator,
        is_prod,
        version (
          name,
          id
        )
      `)
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
      .single()
    if (dbError || !dataChannel)
      return sendRes({ status: 'Cannot find channel', error: dbError }, 400)

    return sendRes(dataChannel)
  }
  else {
    const fetchOffset = body.page == null ? 0 : body.page
    const from = fetchOffset * fetchLimit
    const to = (fetchOffset + 1) * fetchLimit - 1
    const { data: dataChannels, error: dbError } = await supabaseAdmin()
      .from('channels')
      .select(`
        id,
        created_at,
        name,
        app_id,
        created_by,
        updated_at,
        public,
        disableAutoUpdateUnderNative,
        disableAutoUpdateToMajor,
        allow_emulator,
        allow_dev,
        version (
          name,
          id
        )
    `)
      .eq('app_id', body.app_id)
      .range(from, to)
      .order('created_at', { ascending: true })
    if (dbError || !dataChannels || !dataChannels.length)
      return sendRes([])
    return sendRes(dataChannels)
  }
}

export const deleteChannel = async (event: Request, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
  const body = (await event.json()) as ChannelSet

  if (!(await checkAppOwner(apikey.user_id, body.app_id)))
    return sendRes({ status: 'You can\'t access this app', app_id: body.app_id }, 400)

  try {
    const { error: dbError } = await supabaseAdmin()
      .from('channels')
      .delete()
      .eq('app_id', body.app_id)
      .eq('name', body.channel)
    if (dbError)
      return sendRes({ status: 'Cannot delete channel', error: JSON.stringify(dbError) }, 400)
  }
  catch (e) {
    return sendRes({ status: 'Cannot delete channels', error: JSON.stringify(e) }, 500)
  }
  return sendRes()
}

export const post = async (event: Request, apikey: Database['public']['Tables']['apikeys']['Row']): Promise<Response> => {
  const body = (await event.json()) as ChannelSet

  const channel: Database['public']['Tables']['channels']['Insert'] = {
    created_by: apikey.user_id,
    app_id: body.app_id,
    name: body.channel,
    ...(body.public == null ? {} : { public: body.public }),
    ...(body.disableAutoUpdateUnderNative == null ? {} : { disableAutoUpdateUnderNative: body.disableAutoUpdateUnderNative }),
    ...(body.disableAutoUpdateToMajor == null ? {} : { disableAutoUpdateToMajor: body.disableAutoUpdateToMajor }),
    ...(body.allow_device_self_set == null ? {} : { allow_device_self_set: body.allow_device_self_set }),
    ...(body.allow_emulator == null ? {} : { allow_emulator: body.allow_emulator }),
    ...(body.allow_dev == null ? {} : { allow_dev: body.allow_dev }),
    ...(body.ios == null ? {} : { ios: body.ios }),
    ...(body.android == null ? {} : { android: body.android }),
    version: -1,
  }
  if (body.version) {
    const { data, error: vError } = await supabaseAdmin()
      .from('app_versions')
      .select()
      .eq('app_id', body.app_id)
      .eq('name', body.version)
      .eq('user_id', apikey.user_id)
      .eq('deleted', false)
      .single()
    if (vError || !data)
      return sendRes({ status: `Cannot find version ${body.version}`, error: JSON.stringify(vError) }, 400)

    channel.version = data.id
  }
  try {
    const { error: dbError } = await updateOrCreateChannel(channel)
    if (dbError)
      return sendRes({ status: 'Cannot create channel', error: JSON.stringify(dbError) }, 400)
  }
  catch (e) {
    return sendRes({ status: 'Cannot set channels', error: JSON.stringify(e) }, 500)
  }
  return sendRes()
}

serve(async (event: Request) => {
  const apikey_string = event.headers.get('authorization')

  if (!apikey_string)
    return sendRes({ status: 'Missing apikey' }, 400)

  try {
    const apikey: Database['public']['Tables']['apikeys']['Row'] | null = await checkKey(apikey_string, supabaseAdmin(), ['all', 'write'])
    if (!apikey)
      return sendRes({ status: 'Missing apikey' }, 400)

    if (event.method === 'POST')
      return post(event, apikey)
    else if (event.method === 'GET')
      return get(event, apikey)
    else if (event.method === 'DELETE')
      return deleteChannel(event, apikey)
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }

  return sendRes({ status: 'Method now allowed' }, 400)
})
