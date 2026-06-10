// Гейт диалогов для режима канала 'manual': бот отвечает только в лидах,
// явно включённых менеджером командой /бот. Хранилище — таблица bot_enabled_leads.
import { createAdminClient } from '@/lib/supabase/admin'

function leadKey(leadId: string | number): number | null {
  const n = Number(leadId)
  return Number.isFinite(n) ? n : null
}

/** Включён ли бот в этом диалоге (для manual-каналов). */
export async function isLeadEnabled(leadId: string | number): Promise<boolean> {
  const id = leadKey(leadId)
  if (id === null) return false
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[lead-gate] SUPABASE_SERVICE_ROLE_KEY not set')
    return false
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('bot_enabled_leads')
    .select('lead_id')
    .eq('lead_id', id)
    .maybeSingle()
  if (error) {
    console.error('[lead-gate] isLeadEnabled failed:', error.message)
    return false
  }
  return Boolean(data)
}

/** Включить бота в диалоге (команда /бот). */
export async function enableLead(leadId: string | number, by: string): Promise<void> {
  const id = leadKey(leadId)
  if (id === null) return
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[lead-gate] SUPABASE_SERVICE_ROLE_KEY not set')
    return
  }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('bot_enabled_leads')
    .upsert({ lead_id: id, enabled_by: by, enabled_at: new Date().toISOString() }, { onConflict: 'lead_id' })
  if (error) console.error('[lead-gate] enableLead failed:', error.message)
}

/** Выключить бота в диалоге (команда /стоп). */
export async function disableLead(leadId: string | number): Promise<void> {
  const id = leadKey(leadId)
  if (id === null) return
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[lead-gate] SUPABASE_SERVICE_ROLE_KEY not set')
    return
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from('bot_enabled_leads').delete().eq('lead_id', id)
  if (error) console.error('[lead-gate] disableLead failed:', error.message)
}
