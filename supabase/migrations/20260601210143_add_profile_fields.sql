-- Add bio and location_label to profiles
ALTER TABLE profiles ADD COLUMN bio text;
ALTER TABLE profiles ADD COLUMN location_label text;

-- Add experience_band to workers
ALTER TABLE workers ADD COLUMN experience_band text;
