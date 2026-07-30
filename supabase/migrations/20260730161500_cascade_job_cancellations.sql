-- Drop existing foreign key constraint from job_cancellations referencing jobs
-- and recreate it with ON DELETE CASCADE.
-- This ensures that when a job is deleted (e.g., when its owner is deleted), 
-- the cancellation records are also cleanly deleted.

DO $$ 
DECLARE 
  r RECORD;
BEGIN 
  FOR r IN 
    SELECT 
      tc.table_schema,
      tc.table_name, 
      tc.constraint_name,
      kcu.column_name,
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM 
      information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    WHERE 
      tc.constraint_type = 'FOREIGN KEY' 
      AND tc.table_schema = 'public'
      AND tc.table_name = 'job_cancellations' 
      AND kcu.column_name = 'job_id'
  LOOP
    -- Drop the constraint
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I;', 
      r.table_schema, r.table_name, r.constraint_name);
      
    -- Re-add the constraint with ON DELETE CASCADE
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(%I) ON DELETE CASCADE;', 
      r.table_schema, r.table_name, r.constraint_name, r.column_name, r.foreign_table_schema, r.foreign_table_name, r.foreign_column_name);
  END LOOP;
END $$;
