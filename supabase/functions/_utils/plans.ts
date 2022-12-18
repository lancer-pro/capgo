import { logsnag } from '../_utils/_logsnag.ts'
import { addEventPerson } from './crisp.ts'
import { sendNotif } from './notifications.ts'
import {
  getCurrentPlanName, getPlanUsagePercent,
  isFreeUsage, isGoodPlan, isOnboarded, isOnboardingNeeded, isTrial, supabaseAdmin,
} from './supabase.ts'
import type { Database } from './supabase.types.ts'

const planToInt = (plan: string) => {
  switch (plan) {
    case 'Free':
      return 0
    case 'Solo':
      return 1
    case 'Maker':
      return 2
    case 'Team':
      return 3
    case 'Pay as you go':
      return 4
    default:
      return 0
  }
}

export const findBestPlan = async (stats: Database['public']['Functions']['find_best_plan_v3']['Args']): Promise<string> => {
  const { data, error } = await supabaseAdmin()
    .rpc('find_best_plan_v3', {
      mau: stats.mau || 0,
      bandwidth: stats.bandwidth,
      storage: stats.storage,
    })
    .single()
  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data || 'Team'
}

export const getTotalStats = async (userId: string, dateId: string): Promise<Database['public']['Functions']['get_total_stats_v2']['Returns'][0]> => {
  const { data, error } = await supabaseAdmin()
    .rpc('get_total_stats_v2', { userid: userId, dateid: dateId })
    .single()

  if (error) {
    console.error('error.message', error.message)
    throw new Error(error.message)
  }

  return data[0] || {
    mau: 0,
    storage: 0,
    bandwidth: 0,
  }
}

export const checkPlan = async (userId: string): Promise<void> => {
  try {
    const { data: user, error: userError } = await supabaseAdmin()
      .from('users')
      .select()
      .eq('id', userId)
      .single()
    if (userError)
      throw userError
    if (await isTrial(userId)) {
      await supabaseAdmin()
        .from('stripe_info')
        .update({ is_good_plan: true })
        .eq('customer_id', user.customer_id)
        .then()
      return Promise.resolve()
    }
    const dateid = new Date().toISOString().slice(0, 7)
    const is_good_plan = await isGoodPlan(userId)
    const is_onboarded = await isOnboarded(userId)
    const is_onboarding_needed = await isOnboardingNeeded(userId)
    const is_free_usage = await isFreeUsage(userId)
    const percentUsage = await getPlanUsagePercent(userId, dateid)
    if (!is_good_plan && is_onboarded && !is_free_usage) {
      console.log('is_good_plan_v3', userId, is_good_plan)
      // create dateid var with yyyy-mm with dayjs
      const get_total_stats = await getTotalStats(userId, dateid)
      const current_plan = await getCurrentPlanName(userId)
      if (get_total_stats) {
        const best_plan = await findBestPlan(get_total_stats)
        const bestPlanKey = best_plan.toLowerCase().replace(' ', '_')
        // TODO create a rpc method to calculate % of plan usage.
        // TODO send email for 50%, 70%, 90% of current plan usage.
        // TODO Allow upgrade email to be send again every 30 days
        // TODO send to logsnag maker opportunity by been in crisp

        if (best_plan === 'Free' && current_plan === 'Free') {
          await addEventPerson(user.email, {}, 'user:need_more_time', 'blue')
          console.log('best_plan is free', userId)
          await logsnag.publish({
            channel: 'usage',
            event: 'User need more time',
            icon: '⏰',
            tags: {
              'user-id': userId,
            },
            notify: false,
          }).catch()
        }
        else if (planToInt(best_plan) > planToInt(current_plan)) {
          await sendNotif(`user:upgrade_to_${bestPlanKey}`, userId, '0 0 * * 1', 'red')
          // await addEventPerson(user.email, {}, `user:upgrade_to_${bestPlanKey}`, 'red')
          console.log(`user:upgrade_to_${bestPlanKey}`, userId)
          await logsnag.publish({
            channel: 'usage',
            event: `User need upgrade to ${bestPlanKey}`,
            icon: '⚠️',
            tags: {
              'user-id': userId,
            },
            notify: false,
          }).catch()
        }
      }
    }
    else if (!is_onboarded && is_onboarding_needed) {
      await addEventPerson(user.email, {}, 'user:need_onboarding', 'orange')
      await logsnag.publish({
        channel: 'usage',
        event: 'User need onboarding',
        icon: '🥲',
        tags: {
          'user-id': userId,
        },
        notify: false,
      }).catch()
    }
    return supabaseAdmin()
      .from('stripe_info')
      .update({
        is_good_plan: is_good_plan || is_free_usage,
        plan_usage: percentUsage,
      })
      .eq('customer_id', user.customer_id)
      .then()
  }
  catch (e) {
    console.log('Error checkPlan', e)
    return Promise.resolve()
  }
}
