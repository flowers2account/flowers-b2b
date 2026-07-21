// Единый список городов для форм (регистрация в AuthModal + профиль в EditProfileModal).
// Одна точка правды — чтобы варианты не разъезжались между экранами.
export const CITY_OPTIONS = ['Уральск', 'Актобе', 'Атырау', 'Актау', 'Кульсары', 'Доссор', 'Другой'] as const
export type City = (typeof CITY_OPTIONS)[number]
