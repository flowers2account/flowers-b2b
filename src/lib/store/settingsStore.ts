import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  clientNotificationsEnabled: boolean
  toggleClientNotifications: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      clientNotificationsEnabled: true,
      toggleClientNotifications: () =>
        set((state) => ({
          clientNotificationsEnabled: !state.clientNotificationsEnabled
        }))
    }),
    {
      name: 'admin-settings'
    }
  )
)
