-- Change reservations.expires_at default from 24 hours to 30 minutes
ALTER TABLE reservations
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 minutes');
