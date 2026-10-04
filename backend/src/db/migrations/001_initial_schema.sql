-- Auto-generated from live database schema
-- Source: scripts/introspect-schema.js

CREATE TABLE IF NOT EXISTS accounting_accounts (
  id INT NOT NULL DEFAULT nextval('accounting_accounts_id_seq'::regclass),
  company_id INT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounting_entries (
  id INT NOT NULL DEFAULT nextval('accounting_entries_id_seq'::regclass),
  company_id INT NOT NULL,
  entry_date DATE NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  reference_type TEXT,
  reference_id INT,
  loan_id INT,
  created_by_user_id INT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounting_entry_lines (
  id INT NOT NULL DEFAULT nextval('accounting_entry_lines_id_seq'::regclass),
  entry_id INT NOT NULL,
  account_id INT NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_login_audit (
  id INT NOT NULL DEFAULT nextval('auth_login_audit_id_seq'::regclass),
  company_id INT,
  user_id INT,
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  failure_reason TEXT,
  mfa_required BOOLEAN NOT NULL DEFAULT false,
  mfa_validated BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  device_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_cost_centers (
  id INT NOT NULL DEFAULT nextval('cash_cost_centers_id_seq'::regclass),
  company_id INT NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_expense_attachments (
  id INT NOT NULL DEFAULT nextval('cash_expense_attachments_id_seq'::regclass),
  company_id INT NOT NULL,
  cash_expense_id INT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by_user_id INT,
  uploaded_by_name TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_expense_audit (
  id BIGINT NOT NULL DEFAULT nextval('cash_expense_audit_id_seq'::regclass),
  company_id INT NOT NULL,
  cash_expense_id INT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id INT,
  actor_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_expenses (
  id INT NOT NULL DEFAULT nextval('cash_expenses_id_seq'::regclass),
  company_id INT NOT NULL,
  expense_date DATE NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  payee_type TEXT NOT NULL,
  manager_user_id INT,
  entity_name TEXT,
  note TEXT,
  outflow_source TEXT NOT NULL DEFAULT 'caixa_geral'::text,
  created_by_user_id INT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  workflow_status TEXT NOT NULL DEFAULT 'executed'::text,
  required_approval_role TEXT,
  approved_by_user_id INT,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by_user_id INT,
  rejected_by_name TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  accounting_entry_id INT,
  cost_center_id INT
);

CREATE TABLE IF NOT EXISTS cash_flow_policies (
  company_id INT NOT NULL,
  manager_auto_approval_limit NUMERIC(14,2) NOT NULL DEFAULT 30000,
  categories_require_admin text[] NOT NULL DEFAULT ARRAY['impostos'::text],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_documents (
  id INT NOT NULL DEFAULT nextval('client_documents_id_seq'::regclass),
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL,
  version_no INT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INT NOT NULL,
  storage_path TEXT NOT NULL,
  issued_on DATE,
  expires_on DATE,
  note TEXT,
  uploaded_by_user_id INT,
  uploaded_by_name TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_evaluations (
  id INT NOT NULL DEFAULT nextval('client_evaluations_id_seq'::regclass),
  client_id INT NOT NULL,
  analyst_user_id INT,
  final_score INT NOT NULL,
  decision TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_group_members (
  id INT NOT NULL DEFAULT nextval('client_group_members_id_seq'::regclass),
  company_id INT NOT NULL,
  group_client_id INT NOT NULL,
  member_client_id INT,
  member_name TEXT NOT NULL,
  allocation_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id INT NOT NULL DEFAULT nextval('clients_id_seq'::regclass),
  name TEXT NOT NULL,
  client_type TEXT NOT NULL,
  nuit TEXT NOT NULL,
  phone TEXT NOT NULL,
  score INT NOT NULL DEFAULT 700,
  status TEXT NOT NULL DEFAULT 'active'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT,
  phone_alt TEXT,
  document_type TEXT,
  document_number TEXT,
  birth_date DATE,
  gender TEXT,
  marital_status TEXT,
  nationality TEXT,
  province TEXT,
  city TEXT,
  district TEXT,
  neighborhood TEXT,
  address_line TEXT,
  house_number TEXT,
  occupation TEXT,
  employer_name TEXT,
  monthly_income NUMERIC(14,2),
  monthly_expenses NUMERIC(14,2),
  business_name TEXT,
  business_sector TEXT,
  registration_date DATE,
  notes TEXT,
  group_name TEXT,
  group_description TEXT,
  group_leader_name TEXT,
  created_by_user_id INT,
  created_by_name TEXT,
  updated_by_user_id INT,
  updated_by_name TEXT,
  company_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS collaterals (
  id INT NOT NULL DEFAULT nextval('collaterals_id_seq'::regclass),
  client_id INT NOT NULL,
  company_id INT NOT NULL,
  collateral_type TEXT NOT NULL,
  description TEXT NOT NULL,
  estimated_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  document_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_performance_month_closures (
  id INT NOT NULL DEFAULT nextval('collection_performance_month_closures_id_seq'::regclass),
  company_id INT NOT NULL,
  period_month DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  reference_date DATE NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  closed_by_user_id INT,
  closed_by_name TEXT,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id INT NOT NULL DEFAULT nextval('companies_id_seq'::regclass),
  name TEXT NOT NULL,
  legal_name TEXT,
  nuit TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  owner_name TEXT,
  owner_nuit TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  owner_document_type TEXT,
  owner_document_number TEXT,
  owner_address TEXT,
  logo_url TEXT,
  accounting_template_code TEXT NOT NULL DEFAULT 'microcredito'::text,
  auth_enforce_mfa BOOLEAN NOT NULL DEFAULT false,
  auth_mfa_code_hash TEXT,
  auth_session_timeout_min INT NOT NULL DEFAULT 30,
  privacy_mask_sensitive_data BOOLEAN NOT NULL DEFAULT false,
  privacy_allow_cross_company_lookup BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  auth_session_timeout_admin_min INT,
  auth_session_timeout_manager_min INT,
  auth_session_timeout_operator_min INT,
  auth_password_min_length INT NOT NULL DEFAULT 8,
  auth_password_require_upper BOOLEAN NOT NULL DEFAULT true,
  auth_password_require_lower BOOLEAN NOT NULL DEFAULT true,
  auth_password_require_number BOOLEAN NOT NULL DEFAULT true,
  auth_password_require_special BOOLEAN NOT NULL DEFAULT true,
  auth_password_expiry_days INT NOT NULL DEFAULT 90,
  auth_max_login_attempts INT NOT NULL DEFAULT 5,
  auth_lockout_minutes INT NOT NULL DEFAULT 15
);

CREATE TABLE IF NOT EXISTS external_transactions (
  id INT NOT NULL DEFAULT nextval('external_transactions_id_seq'::regclass),
  company_id INT NOT NULL,
  connector_id INT NOT NULL,
  external_ref TEXT NOT NULL,
  posted_at DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MZN'::text,
  direction TEXT NOT NULL DEFAULT 'credit'::text,
  counterparty TEXT,
  description TEXT,
  reconciled BOOLEAN NOT NULL DEFAULT false,
  reconciled_at TIMESTAMPTZ,
  matched_loan_repayment_id INT,
  reconciliation_run_id INT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_day_reopen_audit (
  id BIGINT NOT NULL DEFAULT nextval('finance_day_reopen_audit_id_seq'::regclass),
  company_id INT NOT NULL,
  session_id INT NOT NULL,
  business_date DATE NOT NULL,
  previous_status TEXT NOT NULL,
  previous_closed_at TIMESTAMPTZ,
  previous_closed_by_name TEXT,
  previous_closing_balance NUMERIC(14,2),
  reopened_by_user_id INT,
  reopened_by_name TEXT NOT NULL,
  reopen_reason TEXT NOT NULL,
  reopened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_day_session_audit (
  id BIGINT NOT NULL DEFAULT nextval('finance_day_session_audit_id_seq'::regclass),
  company_id INT NOT NULL,
  session_id INT,
  business_date DATE NOT NULL,
  action_type TEXT NOT NULL,
  actor_user_id INT,
  actor_name TEXT,
  note TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_day_sessions (
  id INT NOT NULL DEFAULT nextval('finance_day_sessions_id_seq'::regclass),
  company_id INT NOT NULL,
  business_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'::text,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_by_user_id INT,
  opened_by_name TEXT,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  opening_capital NUMERIC(14,2) NOT NULL DEFAULT 0,
  reinforcement_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes_open TEXT,
  closed_at TIMESTAMPTZ,
  closed_by_user_id INT,
  closed_by_name TEXT,
  closing_balance NUMERIC(14,2),
  closing_disbursements NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_reimbursements NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes_close TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guarantors (
  id INT NOT NULL DEFAULT nextval('guarantors_id_seq'::regclass),
  name TEXT NOT NULL,
  nuit TEXT NOT NULL,
  phone TEXT NOT NULL,
  client_id INT,
  guaranteed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  active_guarantees INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id INT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_connectors (
  id INT NOT NULL DEFAULT nextval('integration_connectors_id_seq'::regclass),
  company_id INT NOT NULL,
  provider_code TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  updated_by_user_id INT,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_approval_policies (
  id INT NOT NULL DEFAULT nextval('loan_approval_policies_id_seq'::regclass),
  company_id INT NOT NULL,
  analyst_limit NUMERIC(14,2) NOT NULL DEFAULT 50000,
  manager_limit NUMERIC(14,2) NOT NULL DEFAULT 200000,
  final_limit NUMERIC(14,2) NOT NULL DEFAULT 1000000000,
  min_score INT NOT NULL DEFAULT 600,
  max_debt NUMERIC(14,2) NOT NULL DEFAULT 80000,
  default_daily_penalty_rate NUMERIC(6,4) NOT NULL DEFAULT 0.3300,
  mora_monthly_enabled BOOLEAN NOT NULL DEFAULT true,
  mora_weekly_enabled BOOLEAN NOT NULL DEFAULT false,
  mora_daily_enabled BOOLEAN NOT NULL DEFAULT false,
  block_alert_status BOOLEAN NOT NULL DEFAULT true,
  updated_by_user_id INT,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_approval_requests (
  id INT NOT NULL DEFAULT nextval('loan_approval_requests_id_seq'::regclass),
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  requested_amount NUMERIC(14,2) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending_analyst'::text,
  risk_level TEXT NOT NULL DEFAULT 'clear'::text,
  risk_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  analyst_decision_by_user_id INT,
  analyst_decision_by_name TEXT,
  analyst_decision_at TIMESTAMPTZ,
  analyst_decision_note TEXT,
  manager_decision_by_user_id INT,
  manager_decision_by_name TEXT,
  manager_decision_at TIMESTAMPTZ,
  manager_decision_note TEXT,
  final_decision_by_user_id INT,
  final_decision_by_name TEXT,
  final_decision_at TIMESTAMPTZ,
  final_decision_note TEXT,
  generated_loan_id INT,
  created_by_user_id INT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_contract_audit (
  id INT NOT NULL DEFAULT nextval('loan_contract_audit_id_seq'::regclass),
  company_id INT NOT NULL,
  loan_id INT,
  contract_no TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by_user_id INT,
  changed_by_name TEXT,
  payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_documents (
  id INT NOT NULL DEFAULT nextval('loan_documents_id_seq'::regclass),
  company_id INT NOT NULL,
  loan_id INT NOT NULL,
  doc_type TEXT NOT NULL,
  doc_no TEXT NOT NULL,
  payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by_user_id INT,
  generated_by_name TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_financial_events (
  id INT NOT NULL DEFAULT nextval('loan_financial_events_id_seq'::regclass),
  company_id INT NOT NULL,
  loan_id INT NOT NULL,
  event_type TEXT NOT NULL,
  amount NUMERIC(14,2),
  note TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_status TEXT NOT NULL DEFAULT 'executed'::text,
  reviewed_by_user_id INT,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_by_user_id INT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_group_member_allocations (
  id INT NOT NULL DEFAULT nextval('loan_group_member_allocations_id_seq'::regclass),
  company_id INT NOT NULL,
  loan_id INT NOT NULL,
  member_client_id INT,
  member_name TEXT NOT NULL,
  allocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_installment_audit (
  id INT NOT NULL DEFAULT nextval('loan_installment_audit_id_seq'::regclass),
  company_id INT NOT NULL,
  loan_id INT NOT NULL,
  installment_id INT NOT NULL,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_by_user_id INT,
  changed_by_name TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_installments (
  id INT NOT NULL DEFAULT nextval('loan_installments_id_seq'::regclass),
  loan_id INT NOT NULL,
  installment_no INT NOT NULL,
  due_date DATE NOT NULL,
  payment_amount NUMERIC(14,2) NOT NULL,
  principal_amount NUMERIC(14,2) NOT NULL,
  interest_amount NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  principal_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  interest_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  mora_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS loan_payment_promises (
  id INT NOT NULL DEFAULT nextval('loan_payment_promises_id_seq'::regclass),
  company_id INT NOT NULL,
  loan_id INT NOT NULL,
  promised_for DATE NOT NULL,
  promised_amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'::text,
  note TEXT,
  created_by_user_id INT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_renegotiations (
  id INT NOT NULL DEFAULT nextval('loan_renegotiations_id_seq'::regclass),
  company_id INT NOT NULL,
  loan_id INT NOT NULL,
  reason TEXT NOT NULL,
  old_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'::text,
  note TEXT,
  created_by_user_id INT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_repayment_allocations (
  id INT NOT NULL DEFAULT nextval('loan_repayment_allocations_id_seq'::regclass),
  repayment_id INT NOT NULL,
  loan_id INT NOT NULL,
  installment_id INT NOT NULL,
  installment_no INT NOT NULL,
  due_date DATE NOT NULL,
  days_overdue INT NOT NULL DEFAULT 0,
  principal_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  interest_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  installment_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  mora_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_applied NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_repayments (
  id INT NOT NULL DEFAULT nextval('loan_repayments_id_seq'::regclass),
  company_id INT NOT NULL,
  client_id INT NOT NULL,
  loan_id INT,
  receipt_no TEXT,
  payment_date DATE NOT NULL,
  amount_received NUMERIC(14,2) NOT NULL,
  amount_applied NUMERIC(14,2) NOT NULL DEFAULT 0,
  principal_applied NUMERIC(14,2) NOT NULL DEFAULT 0,
  interest_applied NUMERIC(14,2) NOT NULL DEFAULT 0,
  mora_applied NUMERIC(14,2) NOT NULL DEFAULT 0,
  unapplied_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  allocation_mode TEXT NOT NULL DEFAULT 'loan'::text,
  note TEXT,
  created_by_user_id INT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loans (
  id INT NOT NULL DEFAULT nextval('loans_id_seq'::regclass),
  company_id INT NOT NULL,
  contract_no TEXT NOT NULL,
  client_id INT NOT NULL,
  manager_user_id INT,
  product TEXT NOT NULL,
  principal NUMERIC(14,2) NOT NULL,
  balance NUMERIC(14,2) NOT NULL,
  interest_rate NUMERIC(5,2) NOT NULL,
  administrative_fee_mode TEXT NOT NULL DEFAULT 'isento'::text,
  administrative_fee_rate NUMERIC(6,4) NOT NULL DEFAULT 2.0000,
  administrative_fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  disbursement_net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  daily_penalty_rate NUMERIC(6,4) NOT NULL DEFAULT 0.3300,
  mora_waived_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  mora_accrued_posted NUMERIC(14,2) NOT NULL DEFAULT 0,
  amortization_method TEXT NOT NULL DEFAULT 'price'::text,
  payment_frequency TEXT NOT NULL DEFAULT 'mensal'::text,
  disbursement_status TEXT NOT NULL DEFAULT 'disbursed'::text,
  disbursed_at TIMESTAMPTZ,
  disbursed_on DATE NOT NULL,
  maturity_on DATE NOT NULL,
  next_payment_on DATE NOT NULL,
  days_overdue INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id BIGINT NOT NULL DEFAULT nextval('password_reset_otps_id_seq'::regclass),
  user_id INT NOT NULL,
  otp_code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id INT NOT NULL DEFAULT nextval('reconciliation_runs_id_seq'::regclass),
  company_id INT NOT NULL,
  connector_id INT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'::text,
  matched_count INT NOT NULL DEFAULT 0,
  unmatched_count INT NOT NULL DEFAULT 0,
  total_matched_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  started_by_user_id INT,
  started_by_name TEXT
);

CREATE TABLE IF NOT EXISTS regulatory_report_closures (
  id INT NOT NULL DEFAULT nextval('regulatory_report_closures_id_seq'::regclass),
  company_id INT NOT NULL,
  report_code TEXT NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature_algo TEXT NOT NULL DEFAULT 'HMAC-SHA256'::text,
  signature_value TEXT NOT NULL,
  closed_by_user_id INT,
  closed_by_name TEXT,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_audit_log (
  id BIGINT NOT NULL DEFAULT nextval('security_audit_log_id_seq'::regclass),
  company_id INT,
  actor_user_id INT,
  actor_name TEXT,
  actor_role TEXT,
  action_type TEXT NOT NULL,
  module_name TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  request_method TEXT NOT NULL,
  request_path TEXT NOT NULL,
  request_query JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_body JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_status INT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  device_id TEXT,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_hash TEXT,
  entry_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_backup_jobs (
  id INT NOT NULL DEFAULT nextval('system_backup_jobs_id_seq'::regclass),
  company_id INT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id INT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin'::text,
  is_active BOOLEAN NOT NULL DEFAULT true,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  last_login_user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id INT,
  is_portfolio_only BOOLEAN NOT NULL DEFAULT false,
  permissions_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

