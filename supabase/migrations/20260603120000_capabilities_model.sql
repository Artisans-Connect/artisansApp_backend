-- Capabilities model: signup_type (analytics) + last_active_mode (UI preference)

ALTER TABLE profiles
  ADD COLUMN last_active_mode role NOT NULL DEFAULT 'client';

UPDATE profiles SET last_active_mode = role;

ALTER TABLE profiles RENAME COLUMN role TO signup_type;
