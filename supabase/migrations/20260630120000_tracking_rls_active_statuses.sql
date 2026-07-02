-- Keep client live tracking available through the full active worker lifecycle.

DROP POLICY IF EXISTS "Clients view assigned worker location" ON workers;

CREATE POLICY "Clients view assigned worker location" ON workers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.worker_id = workers.id
        AND j.client_id = auth.uid()
        AND j.status IN (
          'matched',
          'on_the_way',
          'arrived',
          'in_progress',
          'termination_requested',
          'pending_client_approval'
        )
    )
  );
