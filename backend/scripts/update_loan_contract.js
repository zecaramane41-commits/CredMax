import { pool } from '../src/config/db.js';

async function run() {
  await pool.query("UPDATE loans SET contract_no = 'MC-2026-001' WHERE id = 2");
  await pool.query("UPDATE loan_contract_audit SET contract_no = 'MC-2026-001' WHERE loan_id = 2");
  await pool.query("UPDATE loan_documents SET doc_no = REPLACE(doc_no, 'REQ-2026-42971', 'MC-2026-001') WHERE loan_id = 2");
  console.log('Updated loan 2 contract_no to MC-2026-001');
  const check = await pool.query('SELECT id, contract_no, client_id, principal, status FROM loans');
  console.table(check.rows);
  process.exit(0);
}
run();
