import { createClient } from '@supabase/supabase-js'
import { dataRuntime } from '../dataRuntime'

export const supabase = dataRuntime.isConfigured
  ? createClient(dataRuntime.supabaseUrl!, dataRuntime.publishableKey!, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null
