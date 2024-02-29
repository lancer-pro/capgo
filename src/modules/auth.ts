import { isAdmin } from './../services/supabase'
import type { UserModule } from '~/types'
import { useMainStore } from '~/stores/main'
import { isAllowedAction, isCanceled, isGoodPlan, isPaying, isTrial, useSupabase } from '~/services/supabase'
import { setUser } from '~/services/chatwoot'
import { useLogSnag } from '~/services/logsnag'
import { hideLoader } from '~/services/loader'
import { initStunning } from '~/services/stunning'

async function guard(next: any, to: string, from: string) {
  const supabase = useSupabase()
  const { data: auth } = await supabase.auth.getUser()

  const snag = useLogSnag()

  const main = useMainStore()

  const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (mfaError) {
    console.error('Cannot guard auth', mfaError)
    return
  }

  if (mfaData.currentLevel === 'aal1' && mfaData.nextLevel === 'aal2')
    return next('/login')

  if (auth.user && !main.auth) {
    main.auth = auth.user
    // console.log('set auth', auth)
    if (!main.user) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select()
          .eq('id', main.auth?.id)
          .single()
        if (!error && data)
          main.user = data
        else
          return next('/onboarding/verify_email')
        const { data: dataCycle, error: errorCycle } = await supabase
          .rpc('get_cycle_info', { userid: main.auth?.id })
          .select()
          .single()
        if (!errorCycle && dataCycle)
          main.cycleInfo = dataCycle
          // await main.updateDashboard(dataCycle.subscription_anchor_start, dataCycle.subscription_anchor_end)
      }
      catch (error) {
        console.error('auth', error)
        return next('/onboarding/verify_email')
      }
    }

    initStunning(main.user?.customer_id)
    isTrial(main.auth?.id).then((res) => {
      // console.log('isTrial', res)
      main.trialDaysLeft = res
    })
    isPaying(main.auth?.id).then((res) => {
      main.paying = res
    })
    isAllowedAction(main.auth?.id).then((res) => {
      main.canUseMore = res
    })
    isGoodPlan(main.auth?.id).then((res) => {
      main.goodPlan = res
    })
    isCanceled(main.auth?.id).then((res) => {
      main.canceled = res
    })
    isAdmin().then((res) => {
      main.isAdmin = res
    })

    snag.track({
      channel: 'user-login',
      event: 'User Login',
      icon: '✅',
      user_id: main.user.id,
      notify: false,
    }).catch()
    setUser(main.user.id, {
      nickname: `${main.user.first_name ?? ''} ${main.user.last_name ?? ''}`,
      email: main.user.email,
      avatar: main.user.image_url || '',
    })

    if ((!main.auth?.user_metadata?.activation || !main.auth?.user_metadata?.activation.legal) && !to.includes('/onboarding') && !from.includes('/onboarding'))
      next('/onboarding/activation')
    else
      next()
    hideLoader()
  }
  else if (from !== 'login' && !auth.user) {
    main.auth = undefined
    next('/login')
  }
  else {
    hideLoader()
    next()
  }
}

// // vueuse/head https://github.com/vueuse/head
export const install: UserModule = ({ router }) => {
  router.beforeEach(async (to, from, next) => {
    if (to.meta.middleware) {
      await guard(next, to.path, from.path)
    }
    else {
      hideLoader()
      next()
    }
  })
}
