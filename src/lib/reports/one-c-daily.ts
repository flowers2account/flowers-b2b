// Ежедневный отчёт об автосинхронизации 1С → WhatsApp. Тянет метрики из RPC
// report_1c_daily() (Asia/Oral) и собирает отчёт через чистый форматтер one-c-format.
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildOneCReport,
  DEFAULT_THRESHOLDS,
  type OneCMetrics,
  type OneCReport,
  type OneCThresholds,
} from './one-c-format'

export type { OneCMetrics, OneCReport, OneCThresholds } from './one-c-format'
export { buildOneCReport } from './one-c-format'

/** Тянет метрики из RPC и собирает отчёт. */
export async function getOneCReport(thr?: Partial<OneCThresholds>): Promise<OneCReport> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('report_1c_daily')
  if (error) throw new Error(`report_1c_daily RPC: ${error.message}`)
  return buildOneCReport(data as OneCMetrics, { ...DEFAULT_THRESHOLDS, ...thr })
}
