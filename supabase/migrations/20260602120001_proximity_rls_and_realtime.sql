-- RLS for live tracking + worker visibility of dispatched jobs
-- Realtime publication for jobs and workers

CREATE POLICY "Clients view assigned worker location" ON workers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.worker_id = workers.id
        AND j.client_id = auth.uid()
        AND j.status IN ('matched', 'in_progress')
    )
  );

CREATE POLICY "Workers view dispatched open jobs" ON jobs
  FOR SELECT USING (
    status IN ('searching', 'matching')
    AND worker_id IS NULL
    AND EXISTS (
      SELECT 1 FROM job_dispatches d
      WHERE d.job_id = jobs.id AND d.worker_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE workers;
