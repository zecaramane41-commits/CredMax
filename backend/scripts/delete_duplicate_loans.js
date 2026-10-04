import { pool } from '../src/config/db.js';

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const findLoans = await client.query(
      'SELECT id, contract_no FROM loans WHERE contract_no IN ($1, $2) OR id IN ($3, $4)',
      ['REQ-2026-38551', 'MC-2026-001', 1, 3]
    );
    const loanIds = findLoans.rows.map(r => r.id);
    console.log('Found loan IDs to remove:', loanIds, findLoans.rows);

    if (loanIds.length > 0) {
      await client.query('DELETE FROM accounting_entries WHERE loan_id = ANY($1)', [loanIds]);
      await client.query('DELETE FROM loan_documents WHERE loan_id = ANY($1)', [loanIds]);
      await client.query('DELETE FROM loan_contract_audit WHERE loan_id = ANY($1)', [loanIds]);
      await client.query('DELETE FROM loan_installments WHERE loan_id = ANY	($1)', [loanIds]);
      await client.query('DELETE FROM loan_repayments WHERE loan_id = ANY	($1)', [loanIds]);
      await client.query('DELETE FROM loan_repayment_allocations WHERE loan_id = ANY($1)', [loanIds]);
      await client.query('DELETE FROM loan_payment_promises WHERE loan_id = ANY($1)', [loanIds]);
      await client.query('DELETE FROM loan_renegotiations WHERE loan_id = ANY($1)', [loanIds]);
      await client.query('DELETE FROM loan_financial_events WHERE loan_id = ANY	($1)', [loanIds]);
      await client.query('DELETE FROM loan_installment_audit WHERE loan_id = ANY($1)', [loanIds]);
      await client.query('DELETE FROM portfolio_transfers WHERE loan_id = ANY($1)', [loanIds]);

      await client.query('UPDATE loan_approval_requests SET generated_loan_id = NULL WHERE generated_loan_id = ANY	($1)', [loanIds]);
      await client.query('DELETE FROM loan_approval_requests WHERE id IN (1, 2)');

      const delLoans = await client.query('DELETE FROM loans WHERE id = ANY($1) RETURNING id, contract_no', [loanIds]);
      console.log('Deleted loans:', delLoans.rows);
    }


    await client.query('COMMIT');
    console.log('Successfully removed duplicate disbursed loans REQ-2026-38551 and MC-2026-001!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during deletion:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();
