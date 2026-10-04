export const DEFAULT_ACCOUNTING_TEMPLATE_CODE = "microcredito";

export const ACCOUNTING_TEMPLATE_OPTIONS = [
  { value: "microcredito", label: "Microcredito" },
  { value: "comercio", label: "Comercio" },
  { value: "servicos", label: "Servicos" },
  { value: "agricultura", label: "Agricultura" },
  { value: "transporte", label: "Transporte e Logistica" },
];

const TEMPLATE_LABEL_BY_CODE = Object.fromEntries(ACCOUNTING_TEMPLATE_OPTIONS.map((item) => [item.value, item.label]));

const SYSTEM_REQUIRED_ACCOUNTS = [
  { code: "1110", name: "Caixa e Bancos", accountType: "asset" },
  { code: "1210", name: "Carteira de Credito", accountType: "asset" },
  { code: "1220", name: "Mora a Receber", accountType: "asset" },
  { code: "4110", name: "Receita de Mora", accountType: "revenue" },
  { code: "4120", name: "Receita de Custos Administrativos", accountType: "revenue" },
  { code: "5110", name: "Despesa de Salarios e Remuneracoes", accountType: "expense" },
  { code: "5120", name: "Despesa de Comissoes", accountType: "expense" },
  { code: "5130", name: "Despesa de Agua e Energia", accountType: "expense" },
  { code: "5140", name: "Despesa de Renda", accountType: "expense" },
  { code: "5150", name: "Despesa de Mobilidade e Transporte", accountType: "expense" },
  { code: "5160", name: "Despesa de Comunicacao e Internet", accountType: "expense" },
  { code: "5170", name: "Despesa de Ajuda de Custo e Bonus", accountType: "expense" },
  { code: "5180", name: "Despesas Operacionais Diversas", accountType: "expense" },
];

const TEMPLATE_SPECIFIC_ACCOUNTS = {
  microcredito: [
    { code: "1120", name: "Carteiras Moveis e Banco Digital", accountType: "asset" },
    { code: "1230", name: "Juros a Receber", accountType: "asset" },
    { code: "1240", name: "Preparos a Receber", accountType: "asset" },
    { code: "2110", name: "Obrigacoes com Terceiros", accountType: "liability" },
    { code: "3110", name: "Capital Social", accountType: "equity" },
    { code: "4130", name: "Receita de Juros Contratuais", accountType: "revenue" },
  ],
  comercio: [
    { code: "1120", name: "Carteiras Moveis e Banco Digital", accountType: "asset" },
    { code: "1310", name: "Inventarios de Mercadorias", accountType: "asset" },
    { code: "1320", name: "Adiantamentos a Fornecedores", accountType: "asset" },
    { code: "2110", name: "Fornecedores", accountType: "liability" },
    { code: "3110", name: "Capital Social", accountType: "equity" },
    { code: "4210", name: "Receita de Vendas", accountType: "revenue" },
    { code: "5310", name: "Custo das Mercadorias Vendidas", accountType: "expense" },
  ],
  servicos: [
    { code: "1120", name: "Carteiras Moveis e Banco Digital", accountType: "asset" },
    { code: "1410", name: "Clientes a Receber", accountType: "asset" },
    { code: "1510", name: "Ativos Fixos Operacionais", accountType: "asset" },
    { code: "2110", name: "Fornecedores e Prestadores", accountType: "liability" },
    { code: "3110", name: "Capital Social", accountType: "equity" },
    { code: "4210", name: "Receita de Servicos", accountType: "revenue" },
    { code: "5220", name: "Custos Diretos de Servicos", accountType: "expense" },
  ],
  agricultura: [
    { code: "1120", name: "Carteiras Moveis e Banco Digital", accountType: "asset" },
    { code: "1330", name: "Ativos Biologicos", accountType: "asset" },
    { code: "1340", name: "Insumos Agricolas", accountType: "asset" },
    { code: "1410", name: "Clientes a Receber", accountType: "asset" },
    { code: "2110", name: "Fornecedores", accountType: "liability" },
    { code: "3110", name: "Capital Social", accountType: "equity" },
    { code: "4210", name: "Receita de Producao Agricola", accountType: "revenue" },
    { code: "5320", name: "Custos de Producao Agricola", accountType: "expense" },
  ],
  transporte: [
    { code: "1120", name: "Carteiras Moveis e Banco Digital", accountType: "asset" },
    { code: "1410", name: "Clientes a Receber", accountType: "asset" },
    { code: "1510", name: "Frota e Equipamentos", accountType: "asset" },
    { code: "2110", name: "Fornecedores", accountType: "liability" },
    { code: "3110", name: "Capital Social", accountType: "equity" },
    { code: "4210", name: "Receita de Fretes", accountType: "revenue" },
    { code: "5330", name: "Custos Operacionais de Transporte", accountType: "expense" },
  ],
};

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeTemplateAccount(rawAccount) {
  return {
    code: String(rawAccount?.code || "").trim(),
    name: String(rawAccount?.name || "").trim(),
    accountType: String(rawAccount?.accountType || "").trim().toLowerCase(),
  };
}

function mergeTemplateAccounts(templateCode) {
  const normalizedTemplateCode = normalizeAccountingTemplateCode(templateCode) || DEFAULT_ACCOUNTING_TEMPLATE_CODE;
  const result = new Map();

  for (const account of SYSTEM_REQUIRED_ACCOUNTS) {
    const item = normalizeTemplateAccount(account);
    if (!item.code || !item.name) continue;
    result.set(item.code, item);
  }

  const extras = TEMPLATE_SPECIFIC_ACCOUNTS[normalizedTemplateCode] || [];
  for (const account of extras) {
    const item = normalizeTemplateAccount(account);
    if (!item.code || !item.name) continue;
    result.set(item.code, item);
  }

  return Array.from(result.values()).sort((a, b) => String(a.code).localeCompare(String(b.code), "pt"));
}

export function normalizeAccountingTemplateCode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (Object.prototype.hasOwnProperty.call(TEMPLATE_SPECIFIC_ACCOUNTS, normalized)) return normalized;
  return null;
}

export function getAccountingTemplateOptions() {
  return ACCOUNTING_TEMPLATE_OPTIONS.map((item) => ({ ...item }));
}

export function getAccountingTemplateLabel(templateCode) {
  const normalized = normalizeAccountingTemplateCode(templateCode) || DEFAULT_ACCOUNTING_TEMPLATE_CODE;
  return TEMPLATE_LABEL_BY_CODE[normalized] || TEMPLATE_LABEL_BY_CODE[DEFAULT_ACCOUNTING_TEMPLATE_CODE];
}

export function getAccountingTemplateAccounts(templateCode) {
  return mergeTemplateAccounts(templateCode).map((item) => ({ ...item }));
}

async function resolveCompanyTemplateCode(dbClient, companyId) {
  const result = await dbClient.query(
    `
    SELECT accounting_template_code
    FROM companies
    WHERE id = $1
    LIMIT 1
    `,
    [companyId],
  );
  const value = result.rows[0]?.accounting_template_code;
  return normalizeAccountingTemplateCode(value) || DEFAULT_ACCOUNTING_TEMPLATE_CODE;
}

export async function ensureCompanyAccountingAccounts(dbClient, companyId, templateCodeInput = null) {
  const numericCompanyId = Number(companyId);
  if (!Number.isInteger(numericCompanyId) || numericCompanyId <= 0) {
    throw new Error("companyId invalido para contas contabilisticas.");
  }

  const normalizedTemplateCode = normalizeAccountingTemplateCode(templateCodeInput);
  const templateCode = normalizedTemplateCode || await resolveCompanyTemplateCode(dbClient, numericCompanyId);
  const accounts = mergeTemplateAccounts(templateCode);

  for (const account of accounts) {
    await dbClient.query(
      `
      INSERT INTO accounting_accounts (company_id, code, name, account_type)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (company_id, code)
      DO UPDATE SET
        name = EXCLUDED.name,
        account_type = EXCLUDED.account_type
      `,
      [numericCompanyId, account.code, account.name, account.accountType],
    );
  }

  return { templateCode, accountsCount: accounts.length };
}

export async function applyCompanyAccountingTemplate(dbClient, companyId, templateCodeInput = null) {
  const numericCompanyId = Number(companyId);
  if (!Number.isInteger(numericCompanyId) || numericCompanyId <= 0) {
    throw new Error("companyId invalido para aplicar template contabil.");
  }
  const normalizedTemplateCode = normalizeAccountingTemplateCode(templateCodeInput) || DEFAULT_ACCOUNTING_TEMPLATE_CODE;
  await dbClient.query(
    `
    UPDATE companies
    SET accounting_template_code = $1
    WHERE id = $2
    `,
    [normalizedTemplateCode, numericCompanyId],
  );
  const ensureResult = await ensureCompanyAccountingAccounts(dbClient, numericCompanyId, normalizedTemplateCode);
  return {
    templateCode: normalizedTemplateCode,
    templateLabel: getAccountingTemplateLabel(normalizedTemplateCode),
    accountsCount: ensureResult.accountsCount,
  };
}

async function resolveAccounts(dbClient, companyId, accountCodes) {
  const result = await dbClient.query(
    `
    SELECT id, code, name
    FROM accounting_accounts
    WHERE company_id = $1
      AND code = ANY($2::text[])
      AND is_active = true
    `,
    [companyId, accountCodes],
  );
  const accountMap = new Map(result.rows.map((row) => [row.code, row]));
  const missing = accountCodes.filter((code) => !accountMap.has(code));
  if (missing.length > 0) {
    throw new Error(`Contas contabilisticas ausentes/inativas: ${missing.join(", ")}`);
  }
  return accountMap;
}

export async function postDoubleEntry(dbClient, payload) {
  const {
    companyId,
    entryDate,
    eventType,
    description,
    referenceType = null,
    referenceId = null,
    loanId = null,
    actorUserId = null,
    actorName = null,
    lines = [],
  } = payload || {};

  if (!Number.isInteger(Number(companyId)) || Number(companyId) <= 0) {
    throw new Error("companyId invalido para lancamento contabil.");
  }
  if (!eventType || !description) {
    throw new Error("eventType e description sao obrigatorios para lancamento contabil.");
  }
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("Partida dobrada exige pelo menos duas linhas.");
  }

  const normalizedLines = lines.map((line) => ({
    accountCode: String(line.accountCode || "").trim(),
    debit: round2(line.debit),
    credit: round2(line.credit),
    memo: line.memo ? String(line.memo).trim() : null,
  }));
  for (const line of normalizedLines) {
    if (!line.accountCode) throw new Error("Linha contabil sem conta.");
    if (line.debit < 0 || line.credit < 0) throw new Error("Debito/credito nao podem ser negativos.");
    if ((line.debit > 0 && line.credit > 0) || (line.debit === 0 && line.credit === 0)) {
      throw new Error("Cada linha deve ter apenas debito ou credito maior que zero.");
    }
  }

  const totalDebit = round2(normalizedLines.reduce((acc, line) => acc + line.debit, 0));
  const totalCredit = round2(normalizedLines.reduce((acc, line) => acc + line.credit, 0));
  if (totalDebit <= 0 || totalCredit <= 0 || Math.abs(totalDebit - totalCredit) > 0.0001) {
    throw new Error("Partida dobrada invalida: debitos e creditos devem fechar.");
  }

  await ensureCompanyAccountingAccounts(dbClient, Number(companyId));
  const accountMap = await resolveAccounts(
    dbClient,
    Number(companyId),
    [...new Set(normalizedLines.map((line) => line.accountCode))],
  );

  const insertedEntry = await dbClient.query(
    `
    INSERT INTO accounting_entries (
      company_id, entry_date, event_type, description, reference_type, reference_id, loan_id, created_by_user_id, created_by_name
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
    `,
    [
      Number(companyId),
      entryDate || new Date().toISOString().slice(0, 10),
      eventType,
      description,
      referenceType,
      referenceId,
      loanId,
      actorUserId,
      actorName,
    ],
  );
  const entryId = Number(insertedEntry.rows[0].id);

  for (const line of normalizedLines) {
    const account = accountMap.get(line.accountCode);
    await dbClient.query(
      `
      INSERT INTO accounting_entry_lines (
        entry_id, account_id, account_code, account_name, debit, credit, memo
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        entryId,
        Number(account.id),
        String(account.code),
        String(account.name),
        line.debit,
        line.credit,
        line.memo,
      ],
    );
  }

  return { entryId, totalDebit, totalCredit };
}
