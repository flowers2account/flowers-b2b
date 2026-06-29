// Куда вести пользователя после входа в зависимости от роли (profiles.role).
// admin → полная админка (как раньше); manager → пульт оператора; иначе → кабинет.
export type AppRole = 'admin' | 'manager' | 'client' | null

export function homePathForRole(role: AppRole): string {
  if (role === 'admin') return '/admin'
  if (role === 'manager') return '/admin/console'
  return '/cabinet'
}
