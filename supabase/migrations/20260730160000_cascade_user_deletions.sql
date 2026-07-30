-- Drop existing foreign keys that are missing ON DELETE CASCADE
-- and recreate them with ON DELETE CASCADE.
-- We use a DO block to dynamically find the constraint names in case they vary.

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
      AND (
        (tc.table_name = 'jobs' AND kcu.column_name IN ('client_id', 'worker_id', 'requested_worker_id')) OR
        (tc.table_name = 'reviews' AND kcu.column_name IN ('reviewer_id', 'worker_id')) OR
        (tc.table_name = 'messages' AND kcu.column_name = 'sender_id') OR
        (tc.table_name = 'worker_verifications' AND kcu.column_name = 'reviewed_by') OR
        (tc.table_name = 'verification_audit_logs' AND kcu.column_name = 'admin_id')
      )
  LOOP
    -- Drop the constraint
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I;', 
      r.table_schema, r.table_name, r.constraint_name);
      
    -- Re-add the constraint with ON DELETE CASCADE
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(%I) ON DELETE CASCADE;', 
      r.table_schema, r.table_name, r.constraint_name, r.column_name, r.foreign_table_schema, r.foreign_table_name, r.foreign_column_name);
  END LOOP;
END $$;
