ALTER TABLE loan_approval_requests DROP CONSTRAINT IF EXISTS loan_approval_requests_status_check;
ALTER TABLE loan_approval_requests ADD CONSTRAINT loan_approval_requests_status_check CHECK (status = ANY (ARRAY['pending_analyst'::text, 'pending_manager'::text, 'pending_final'::text, 'approved'::text, 'disbursed'::text, 'rejected'::text, 'risk_blocked'::text]));
UPDATE loan_approval_requests SET status = 'disbursed', updated_at = NOW() WHERE generated_loan_id IS NOT NULL OR status = 'approved';
