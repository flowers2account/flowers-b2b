-- Связь клиента с карточкой контакта amoCRM: раньше contactId нигде не сохранялся
-- (только в orders/registration_requests), и связь восстанавливалась по телефону.
-- Теперь храним amo_contact_id в clients — заполняется при регистрации и при первом
-- синке реквизитов (резолв по телефону → сохранить ID).
alter table public.clients add column if not exists amo_contact_id bigint;
comment on column public.clients.amo_contact_id is
  'ID контакта в amoCRM (резолв по телефону, сохраняется при регистрации/синке реквизитов)';
