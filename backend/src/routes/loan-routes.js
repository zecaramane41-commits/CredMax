import express from "express";
import { query, withTransaction } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireLoanPermission, requireReadWrite } from "../middleware/permissions.js";
import { postDoubleEntry } from "../services/accounting-service.js";
import { notifyCaixaMovement, notifyPaymentReceivedSms, notifyDisbursementEmail, notifyRepaymentEmail, createSystemNotification } from "../services/notification-service.js";
import { publishAppEvent } from "../services/event-bus.js";

export const loanRouter = express.Router();

loanRouter.use(requireAuth);
loanRouter.use(requireLoanPermission);

const AMORTIZATION_METHODS = ["price", "sac", "americano"];
const PAYMENT_FREQUENCIES = ["diario", "semanal", "quinzenal", "mensal"];
const FREQUENCY_CONFIG = {
  diario: { periodsPerYear: 365, intervalDays: 1 },
  semanal: { periodsPerYear: 52, intervalDays: 7 },
  quinzenal: { periodsPerYear: 26, intervalDays: 14 },
  mensal: { periodsPerYear: 12, intervalMonths: 1 },
};
const PROMISE_STATUSES = ["active", "fulfilled", "broken", "cancelled"];
const RENEGOTIATION_STATUSES = ["pending", "approved", "rejected", "executed"];
const FINANCIAL_EVENT_TYPES = [
  "estorno",
  "abatimento",
  "capitalizacao",
  "perdao_mora",
  "mora",
  "liquidacao_antecipada",
  "reestruturacao_contrato",
];
const APPROVAL_STATUSES = [
  "pending_analyst",
  "pending_manager",
  "pending_final",
  "approved",
  "rejected",
  "risk_blocked",
];
const DEFAULT_APPROVAL_POLICY = {
  analystLimit: 50000,
  managerLimit: 200000,
  finalLimit: 1000000000,
  minScore: 600,
  maxDebt: 80000,
  defaultDailyPenaltyRate: 2,
  defaultAdministrativeFeeRate: 2.00,
  defaultInterestRate: 30.00,
  maxLoanTermMonths: 24,
  moraMonthlyEnabled: true,
  moraWeeklyEnabled: false,
  moraDailyEnabled: false,
  blockAlertStatus: true,
};
const LOAN_PRODUCT_TYPES = {
  NORMAL: "Credito Normal",
  ACRESCIMO: "Acrescimo",
  REEMPRESTIMO: "Reemprestimo",
  ESPECIAL: "Credito Especial",
};
const LOAN_DOC_TYPES = ["contrato", "confissao_divida", "declaracao", "desconto_salarial", "termo_compromisso", "termo_entrega"];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDocTypeLabel(docType) {
  if (docType === "contrato") return "Contrato de Credito";
  if (docType === "confissao_divida") return "Confissao de Divida";
  if (docType === "declaracao") return "Declaracao";
  if (docType === "desconto_salarial") return "Desconto Salarial";
  if (docType === "termo_compromisso") return "Termo de Compromisso";
  if (docType === "termo_entrega") return "Termo de Entrega";
  return docType;
}

function formatMoneyDoc(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roleLabel(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin") return "Administrador";
  if (normalized === "manager") return "Gestor";
  if (normalized === "agent") return "Agente de Credito";
  if (normalized === "operator") return "Operador";
  return normalized || "-";
}

function formatDocDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("pt-PT");
}

function paymentFrequencyLabelDoc(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "diario") return "Diario";
  if (normalized === "semanal") return "Semanal";
  if (normalized === "quinzenal") return "Quinzenal";
  if (normalized === "mensal") return "Mensal";
  return normalized || "-";
}

function fullNameOrDash(value) {
  const txt = String(value || "").trim();
  return txt || "-";
}

function fullClientAddressDoc(client = {}) {
  const parts = [
    client.address_line,
    client.house_number ? `Casa ${client.house_number}` : "",
    client.neighborhood,
    client.district,
    client.city,
    client.province,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "-";
}

function maritalStatusLabelDoc(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "solteiro") return "Solteiro(a)";
  if (normalized === "casado") return "Casado(a)";
  if (normalized === "divorciado") return "Divorciado(a)";
  if (normalized === "viuvo") return "Viuvo(a)";
  return normalized || "-";
}

function clientTypeLabelDoc(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "grupo") return "Grupo";
  if (normalized === "empresa") return "Empresa";
  return "Individual";
}

function normalizeDocAccounts(input, fallbackHolder) {
  const rows = Array.isArray(input) ? input : [];
  const normalized = rows
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      return {
        bank: String(item.bank || item.bankName || item.banco || "").trim(),
        accountNumber: String(item.accountNumber || item.account_no || item.numeroConta || item.numero_conta || "").trim(),
        nib: String(item.nib || item.iban || "").trim(),
        holder: String(item.holder || item.titular || "").trim(),
      };
    })
    .filter((row) => row && (row.bank || row.accountNumber || row.nib || row.holder));
  if (normalized.length > 0) return normalized;
  return [
    {
      bank: "Nao informado",
      accountNumber: "Nao informado",
      nib: "Nao informado",
      holder: String(fallbackHolder || "Nao informado"),
    },
  ];
}

function renderContractLoanHtml({
  company,
  client,
  loan,
  generatedAt,
  docNo,
  generatedByName,
  generatedByRole,
  collaterals = [],
  guarantors = [],
  groupMembers = [],
  installments = [],
}) {
  const companyName = company?.legal_name || company?.name || "Empresa";
  const companyAddress = company?.address || "Endereco nao informado";
  const companyNuit = company?.nuit || "-";
  const companyPhone = company?.phone || "";
  const companyEmail = company?.email || "";
  const companyLogo = company?.logo_url || "";
  const ownerName = company?.owner_name || "";
  const ownerNuit = company?.owner_nuit || "";
  const ownerPhone = company?.owner_phone || "";
  const ownerEmail = company?.owner_email || "";
  const ownerDocumentType = company?.owner_document_type || "";
  const ownerDocumentNumber = company?.owner_document_number || "";
  const ownerAddress = company?.owner_address || "";

  const clientName = client?.name || "-";
  const clientType = clientTypeLabelDoc(client?.client_type);
  const clientDocType = client?.document_type || "Documento";
  const clientDocNumber = client?.document_number || "-";
  const clientPhone = client?.phone || "-";
  const clientPhoneAlt = client?.phone_alt || "";
  const clientNuit = client?.nuit || "-";
  const clientAddress = fullClientAddressDoc(client);
  const clientMaritalStatus = maritalStatusLabelDoc(client?.marital_status);
  const clientBirthDate = formatDocDate(client?.birth_date);
  const clientNationality = client?.nationality || "-";
  const clientOccupation = client?.occupation || client?.business_sector || client?.employer_name || "-";
  const clientCity = client?.city || client?.province || "-";
  const groupName = client?.group_name || clientName;
  const groupLeaderName = client?.group_leader_name || clientName;

  const contractNo = loan?.contract_no || "-";
  const principal = Number(loan?.principal || 0);
  const balance = Number(loan?.balance || 0);
  const rate = Number(loan?.interest_rate || 0);
  const frequency = paymentFrequencyLabelDoc(loan?.payment_frequency);
  const disbursed = formatDocDate(loan?.disbursed_on);
  const maturity = formatDocDate(loan?.maturity_on);
  const nextPayment = formatDocDate(loan?.next_payment_on);
  const product = loan?.product || "-";
  const amortizationMethod = String(loan?.amortization_method || "-");
  const dailyPenaltyRate = Number(loan?.daily_penalty_rate || 0);
  const managerName = fullNameOrDash(loan?.manager_name);

  const generatedDate = formatDocDate(generatedAt || new Date().toISOString());
  const todayLong = (() => {
    const d = new Date(generatedAt || Date.now());
    if (Number.isNaN(d.getTime())) return generatedDate;
    return d.toLocaleDateString("pt-PT");
  })();

  const installmentRows = (Array.isArray(installments) ? installments : [])
    .map((row, idx) => ({
      installmentNo: Number(row?.installment_no || row?.installmentNo || idx + 1),
      dueOn: row?.due_on || row?.dueOn || row?.due_date || row?.dueDate || "",
      principalAmount: Number(row?.principal_amount || row?.principalAmount || 0),
      interestAmount: Number(row?.interest_amount || row?.interestAmount || 0),
      paymentAmount: Number(row?.payment_amount || row?.paymentAmount || 0),
      balanceAfter: Number(row?.balance_after || row?.balanceAfter || 0),
    }))
    .sort((a, b) => a.installmentNo - b.installmentNo);

  const installmentRowsHtml = installmentRows.length
    ? installmentRows
      .map((row) => `
        <tr>
          <td class="center">${row.installmentNo}</td>
          <td class="center">${escapeHtml(formatDocDate(row.dueOn))}</td>
          <td class="right">${escapeHtml(formatMoneyDoc(row.principalAmount))}</td>
          <td class="right">${escapeHtml(formatMoneyDoc(row.interestAmount))}</td>
          <td class="right">${escapeHtml(formatMoneyDoc(row.paymentAmount))}</td>
          <td class="right">${escapeHtml(formatMoneyDoc(row.balanceAfter))}</td>
        </tr>`)
      .join("")
    : "<tr><td colspan='6' class='center muted'>Sem parcelas registadas.</td></tr>";

  const collateralsList = Array.isArray(collaterals) ? collaterals : [];
  const collateralsTotal = collateralsList.reduce((sum, row) => sum + Number(row?.estimated_value || 0), 0);
  const collateralRowsHtml = collateralsList.length
    ? collateralsList
      .map((row, index) => `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(row?.collateral_type || "-")}</td>
          <td>${escapeHtml(row?.description || "-")}</td>
          <td>${escapeHtml(row?.document_ref || "-")}</td>
          <td class="right">${escapeHtml(formatMoneyDoc(row?.estimated_value || 0))}</td>
        </tr>`)
      .join("")
    : "<tr><td colspan='5' class='center muted'>Sem garantias cadastradas.</td></tr>";

  const guarantorList = Array.isArray(guarantors) ? guarantors : [];
  const guarantorRowsHtml = guarantorList.length
    ? guarantorList
      .map((row, index) => `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(row?.name || "-")}</td>
          <td>${escapeHtml(row?.nuit || "-")}</td>
          <td>${escapeHtml(row?.phone || "-")}</td>
          <td class="right">${escapeHtml(formatMoneyDoc(row?.guaranteed_amount || 0))}</td>
        </tr>`)
      .join("")
    : "<tr><td colspan='5' class='center muted'>Sem avalista cadastrado para este cliente.</td></tr>";

  const groupMemberList = (Array.isArray(groupMembers) ? groupMembers : [])
    .map((row) => ({
      memberName: String(row?.member_name || row?.memberName || "").trim(),
      memberClientId: Number(row?.member_client_id || row?.memberClientId || 0) > 0 ? Number(row?.member_client_id || row?.memberClientId) : null,
      allocatedAmount: Number(row?.allocated_amount || row?.allocation_amount || row?.allocatedAmount || row?.allocationAmount || 0),
      status: String(row?.status || "").trim(),
    }))
    .filter((row) => row.memberName || row.memberClientId);
  const groupMembersTotal = groupMemberList.reduce((sum, row) => sum + Number(row.allocatedAmount || 0), 0);
  const groupMembersRowsHtml = groupMemberList.length
    ? groupMemberList
      .map((row, index) => `
        <tr>
          <td class="center">${index + 1}</td>
          <td>${escapeHtml(row.memberName || "-")}</td>
          <td class="center">${row.memberClientId ? `#${escapeHtml(String(row.memberClientId))}` : "-"}</td>
          <td class="right">${escapeHtml(formatMoneyDoc(row.allocatedAmount || 0))}</td>
          <td class="center">${escapeHtml(row.status || "open")}</td>
        </tr>`)
      .join("")
    : "<tr><td colspan='5' class='center muted'>Sem membros alocados para este contrato de grupo.</td></tr>";

  const principalWords = `${escapeHtml(formatMoneyDoc(principal))} MT`;
  const installmentsCount = installmentRows.length > 0 ? installmentRows.length : "-";
  const frequencyNoun =
    frequency === "Diario" ? "Diarias" :
    frequency === "Semanal" ? "Semanais" :
    frequency === "Quinzenal" ? "Quinzenais" :
    frequency === "Mensal" ? "Mensais" : frequency;

  const clauseOneParagraph = client?.client_type === "grupo"
    ? `Pelo presente, concede-se ao grupo mutuaria ${escapeHtml(groupName)} (liderado por ${escapeHtml(groupLeaderName)}) o valor de ${principalWords}, a ser pago em ${escapeHtml(String(installmentsCount))} prestacoes ${escapeHtml(String(frequencyNoun || "-"))}.`
    : `Pelo presente, concede-se ao mutuario(a) o valor de ${principalWords}, a ser pago em ${escapeHtml(String(installmentsCount))} prestacoes ${escapeHtml(String(frequencyNoun || "-"))}.`;

  const partyDescription = client?.client_type === "grupo"
    ? `E o grupo ${escapeHtml(groupName)}, representado por ${escapeHtml(groupLeaderName)}, doravante designado por Mutuario.`
    : `E ${escapeHtml(clientName)}, doravante designado por Mutuario.`;

  const signatureGroupMembers = client?.client_type === "grupo" && groupMemberList.length > 0
    ? `
      <div class="section">
        <h2 style="margin-top: 12px;">Assinaturas dos Membros do Grupo</h2>
        <div class="sign-grid members">
          ${groupMemberList
            .map((row) => `<div class="sign-box"><div class="sign-line">${escapeHtml(row.memberName || "Membro do grupo")}</div></div>`)
            .join("")}
        </div>
      </div>`
    : "";

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Contrato de Emprestimo - ${escapeHtml(contractNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.35; }
      h1 { margin: 8px 0 6px; text-align: center; font-size: 18px; letter-spacing: .4px; text-transform: uppercase; }
      h2 { margin: 10px 0 6px; font-size: 11px; text-transform: uppercase; color: #1e293b; }
      p { margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 4px; }
      th, td { border: 1px solid #cbd5e1; padding: 4px 5px; font-size: 10px; vertical-align: top; }
      th { background: #f8fafc; text-align: left; }
      .center { text-align: center; }
      .right { text-align: right; }
      .muted { color: #475569; }
      .small { font-size: 10px; }
      .head { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; display: grid; grid-template-columns: 1fr auto; gap: 8px; }
      .brand { display:flex; gap:10px; align-items:center; }
      .logo { width:54px; height:54px; border:1px solid #cbd5e1; border-radius:6px; object-fit:cover; }
      .logo-ph { width:54px; height:54px; border:1px dashed #94a3b8; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:10px; }
      .meta { min-width: 225px; text-align: right; }
      .meta p { margin: 2px 0; }
      .section { margin-top: 7px; }
      .two-col { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px; }
      .clause-title { font-weight: 700; text-transform: uppercase; margin-top: 6px; }
      .sign-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 10px; }
      .sign-grid.members { grid-template-columns: 1fr 1fr; gap: 14px; }
      .sign-box { min-height: 46px; }
      .sign-line { border-top: 1px solid #475569; padding-top: 3px; margin-top: 28px; text-align: center; font-size: 10px; }
      .page-break { page-break-before: always; break-before: page; height: 0; }
      .footer { margin-top: 8px; border-top: 1px dashed #94a3b8; padding-top: 5px; font-size: 9.5px; text-align:center; color:#475569; }
      .no-border td { border: none; padding: 1px 0; }
    </style>
  </head>
  <body>
    <div class="head">
      <div class="brand">
        ${companyLogo ? `<img src="${escapeHtml(companyLogo)}" alt="Logo" class="logo" />` : `<div class="logo-ph">LOGO</div>`}
        <div>
          <p><strong>${escapeHtml(companyName)}</strong></p>
          <p class="small muted">${escapeHtml(companyAddress)}</p>
          <p class="small muted">NUIT: ${escapeHtml(companyNuit)}${companyPhone ? ` | Tel: ${escapeHtml(companyPhone)}` : ""}${companyEmail ? ` | Email: ${escapeHtml(companyEmail)}` : ""}</p>
          ${
            ownerName
              ? `<p class="small muted">Proprietario: ${escapeHtml(ownerName)}${ownerNuit ? ` | NUIT: ${escapeHtml(ownerNuit)}` : ""}</p>`
              : ""
          }
        </div>
      </div>
      <div class="meta">
        <p><strong>Documento:</strong> ${escapeHtml(docNo || "-")}</p>
        <p><strong>Contrato:</strong> ${escapeHtml(contractNo)}</p>
        <p><strong>Data:</strong> ${escapeHtml(generatedDate)}</p>
        <p><strong>Gerado por:</strong> ${escapeHtml(generatedByName || "Sistema")}</p>
        <p><strong>Funcao:</strong> ${escapeHtml(roleLabel(generatedByRole || ""))}</p>
      </div>
    </div>

    <h1>Contrato de Emprestimo</h1>

    <div class="section">
      <p>Entre a <strong>${escapeHtml(companyName)}</strong>, Operador de Microcreditos, e ${partyDescription}</p>
      <p>E celebrado o presente contrato de emprestimo, que se regera pelas clausulas e termos seguintes:</p>
    </div>

    <div class="section two-col">
      <div class="card">
        <h2>Identificacao do Mutuario</h2>
        <table class="no-border">
          <tbody>
            <tr><td><strong>Nome:</strong> ${escapeHtml(clientName)}</td></tr>
            <tr><td><strong>Tipo:</strong> ${escapeHtml(clientType)}</td></tr>
            <tr><td><strong>Documento:</strong> ${escapeHtml(clientDocType)} ${escapeHtml(clientDocNumber)}</td></tr>
            <tr><td><strong>NUIT:</strong> ${escapeHtml(clientNuit)}</td></tr>
            <tr><td><strong>Estado civil:</strong> ${escapeHtml(clientMaritalStatus)}</td></tr>
            <tr><td><strong>Nacionalidade:</strong> ${escapeHtml(clientNationality)}</td></tr>
            <tr><td><strong>Nascimento:</strong> ${escapeHtml(clientBirthDate)}</td></tr>
            <tr><td><strong>Contacto:</strong> ${escapeHtml(clientPhone)}${clientPhoneAlt ? ` / ${escapeHtml(clientPhoneAlt)}` : ""}</td></tr>
            <tr><td><strong>Morada:</strong> ${escapeHtml(clientAddress)}</td></tr>
            <tr><td><strong>Ocupacao/Atividade:</strong> ${escapeHtml(clientOccupation)}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="card">
        <h2>Dados do Credito</h2>
        <table class="no-border">
          <tbody>
            <tr><td><strong>Produto:</strong> ${escapeHtml(product)}</td></tr>
            <tr><td><strong>Capital:</strong> ${escapeHtml(formatMoneyDoc(principal))} MT</td></tr>
            <tr><td><strong>Saldo atual:</strong> ${escapeHtml(formatMoneyDoc(balance))} MT</td></tr>
            <tr><td><strong>Taxa:</strong> ${escapeHtml(rate.toFixed(2))}%</td></tr>
            <tr><td><strong>Mora diaria apos vencimento:</strong> ${escapeHtml((FIXED_MORA_RATE * 100).toFixed(2))}% ao dia</td></tr>
            <tr><td><strong>Frequencia:</strong> ${escapeHtml(frequency)}</td></tr>
            <tr><td><strong>Metodo amortizacao:</strong> ${escapeHtml(amortizationMethod)}</td></tr>
            <tr><td><strong>Desembolso:</strong> ${escapeHtml(disbursed)}</td></tr>
            <tr><td><strong>Prox. pagamento:</strong> ${escapeHtml(nextPayment)}</td></tr>
            <tr><td><strong>Vencimento:</strong> ${escapeHtml(maturity)}</td></tr>
            <tr><td><strong>Gestor da carteira:</strong> ${escapeHtml(managerName)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="section card">
      <h2>Representante / Proprietario da Empresa</h2>
      <table class="no-border">
        <tbody>
          <tr><td><strong>Nome do proprietario:</strong> ${escapeHtml(ownerName || "-")}</td></tr>
          <tr><td><strong>NUIT do proprietario:</strong> ${escapeHtml(ownerNuit || "-")}</td></tr>
          <tr><td><strong>Documento:</strong> ${escapeHtml(ownerDocumentType || "-")} ${escapeHtml(ownerDocumentNumber || "")}</td></tr>
          <tr><td><strong>Contacto:</strong> ${escapeHtml(ownerPhone || "-")}${ownerEmail ? ` | ${escapeHtml(ownerEmail)}` : ""}</td></tr>
          <tr><td><strong>Morada do proprietario:</strong> ${escapeHtml(ownerAddress || "-")}</td></tr>
        </tbody>
      </table>
    </div>

    ${
      client?.client_type === "grupo"
        ? `
    <div class="section">
      <h2>Membros do Grupo e Alocacao do Credito</h2>
      <p class="small muted">Grupo: <strong>${escapeHtml(groupName)}</strong> | Lider: <strong>${escapeHtml(groupLeaderName)}</strong> | Cidade: <strong>${escapeHtml(clientCity)}</strong></p>
      <table>
        <thead>
          <tr>
            <th style="width:7%;">#</th>
            <th>Nome do membro</th>
            <th style="width:18%;">ID Cliente</th>
            <th style="width:22%;">Valor alocado (MT)</th>
            <th style="width:16%;">Estado</th>
          </tr>
        </thead>
        <tbody>${groupMembersRowsHtml}</tbody>
        <tfoot>
          <tr>
            <th colspan="3" class="right">Total alocado ao grupo</th>
            <th class="right">${escapeHtml(formatMoneyDoc(groupMembersTotal))}</th>
            <th class="center">-</th>
          </tr>
        </tfoot>
      </table>
    </div>`
        : ""
    }

    <div class="section">
      <div class="clause-title">Primeira (Valor do emprestimo)</div>
      <p>${clauseOneParagraph}</p>

      <div class="clause-title">Segunda (Taxas de Juros)</div>
      <p>O emprestimo vence juros a taxa de <strong>${escapeHtml(rate.toFixed(2))}%</strong>, sendo as prestacoes de juros ${escapeHtml(String(frequencyNoun || frequency || "-"))}, sucessivas e contadas em forma de prestacoes sobre o capital em divida.</p>

      <div class="clause-title">Terceira (Modo e lugar de reembolso)</div>
      <p>1. O mutuario aceita expressamente devolver o credito dentro do prazo contratual, contados a partir da data de desembolso do credito, bem como de acordo com o plano de pagamento em anexo ao contrato.</p>
      <p>2. O mutuario compromete-se ainda a efectuar os reembolsos do credito nas contas em anexo ao plano de pagamento, apresentando o comprovativo do reembolso junto da sede do operador para emissao do recibo.</p>

      <div class="clause-title">Quarta (Custos Administrativos)</div>
      <p>Os custos administrativos associados a operacao de credito, quando aplicaveis de acordo com as condicoes aprovadas e documentos do processo, sao da responsabilidade do mutuario.</p>

      <div class="clause-title">Quinta (Vencimento Imediato)</div>
      <p>Pode ser considerado imediatamente vencido o presente contrato exigindo-se de imediato o pagamento de todo o valor de capital, juros e demais encargos devidos pelo mutuario ao Operador de Credito, nomeadamente em caso de falta de pagamento pontual, infraccao de clausulas contratuais ou prestacao de informacao falsa.</p>

      <div class="clause-title">Sexta (Garantias do mutuario)</div>
      <p>Para assegurar o reembolso do capital, juros e demais encargos inerentes ao emprestimo, o mutuario constitui garantias a favor de <strong>${escapeHtml(companyName)}</strong>, no valor total de <strong>${escapeHtml(formatMoneyDoc(collateralsTotal))} MT</strong>, conforme relacao abaixo.</p>
    </div>

    <div class="section">
      <h2>Garantias do Mutuario</h2>
      <table>
        <thead>
          <tr>
            <th style="width:7%;">#</th>
            <th style="width:18%;">Tipo de garantia</th>
            <th>Descricao</th>
            <th style="width:20%;">Referencia</th>
            <th style="width:18%;">Montante (MT)</th>
          </tr>
        </thead>
        <tbody>${collateralRowsHtml}</tbody>
        <tfoot>
          <tr>
            <th colspan="4" class="right">Total</th>
            <th class="right">${escapeHtml(formatMoneyDoc(collateralsTotal))}</th>
          </tr>
        </tfoot>
      </table>
      <p class="small muted">As garantias descritas poderao ser usadas em futuros creditos, sendo o seu montante actualizado conforme reavaliacao.</p>
    </div>

    <div class="section">
      <h2>Avalista(s)</h2>
      <table>
        <thead>
          <tr>
            <th style="width:7%;">#</th>
            <th>Nome</th>
            <th style="width:18%;">NUIT</th>
            <th style="width:20%;">Contacto</th>
            <th style="width:20%;">Montante garantido (MT)</th>
          </tr>
        </thead>
        <tbody>${guarantorRowsHtml}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="clause-title">Setima (Arresto e venda dos bens)</div>
      <p>1. O presente penhor pode ser executado logo que, vencida qualquer obrigacao que sirva de garantia, se verifique mora no seu cumprimento, ou ainda quando qualquer bem dado em penhor seja alienado, onerado, penhorado ou objecto de apreensao judicial.</p>
      <p>2. O Operador fica autorizado, em caso de ocorrencia das situacoes previstas, a proceder a venda extra-judicial dos bens empenhados a quem melhor entender pelo preco e demais condicoes que tenha por convenientes, para reembolsar-se das quantias em divida.</p>

      <div class="clause-title">Oitava (Sancoes)</div>
      <p>Em caso de falta de pagamento pontual das prestacoes de capital e juros, o mutuario aceita e autoriza a aplicacao das sancoes previstas na politica de cobranca e no presente contrato, incluindo juros moratorios, custos administrativos/legais de cobranca e medidas de recuperacao de garantias nos termos da lei.</p>

      <div class="clause-title">Nona (Lei e foro)</div>
      <p>Quaisquer diferendos relacionados com o presente contrato serao resolvidos amigavelmente pelas partes. Nao sendo possivel, sera competente o Tribunal da area da empresa/operacao, com renuncia expressa a outros tribunais, salvo disposicao legal em contrario.</p>

      <div class="clause-title">Decima (Salvaguarda contratual)</div>
      <p>A nulidade ou anulacao parcial do contrato nao determina a invalidade de todo o contrato, salvo quando se mostre que este nao teria sido concluido sem a parte viciada.</p>
    </div>

    <div class="section page-break"></div>

    <div class="section">
      <h2>Plano de Pagamento (Anexo ao Contrato)</h2>
      <p class="small muted">Contrato ${escapeHtml(contractNo)} | Produto ${escapeHtml(product)} | Gerado em ${escapeHtml(todayLong)}</p>
      <table>
        <thead>
          <tr>
            <th style="width:8%;">No</th>
            <th style="width:18%;">Data</th>
            <th style="width:18%;">Capital</th>
            <th style="width:18%;">Juro</th>
            <th style="width:18%;">Prestacao</th>
            <th style="width:20%;">Saldo</th>
          </tr>
        </thead>
        <tbody>${installmentRowsHtml}</tbody>
      </table>
    </div>

    <div class="sign-grid">
      <div class="sign-box"><div class="sign-line">Assinatura do Operador (${escapeHtml(companyName)})</div></div>
      <div class="sign-box"><div class="sign-line">${client?.client_type === "grupo" ? "Assinatura do Lider do Grupo / Mutuario" : "Assinatura do Mutuario"}</div></div>
    </div>

    ${
      guarantorList.length > 0
        ? `
    <div class="section">
      <h2>Assinatura(s) do(s) Avalista(s)</h2>
      <div class="sign-grid members">
        ${guarantorList.map((row) => `<div class="sign-box"><div class="sign-line">${escapeHtml(row?.name || "Avalista")}</div></div>`).join("")}
      </div>
    </div>`
        : ""
    }

    ${signatureGroupMembers}

    <div class="footer">
      ${escapeHtml(companyName)} | ${escapeHtml(companyAddress)} | NUIT ${escapeHtml(companyNuit)} | Documento ${escapeHtml(docNo || "-")}
    </div>
  </body>
</html>`;
}

function renderDebtConfessionHtml({
  company,
  client,
  loan,
  generatedAt,
  docNo,
  generatedByName,
  generatedByRole,
  installments = [],
  reimbursementAccounts = [],
  disbursementAccounts = [],
}) {
  const companyName = company?.legal_name || company?.name || "Empresa";
  const companyAddress = company?.address || "Endereco nao informado";
  const companyNuit = company?.nuit || "-";
  const companyEmail = company?.email || "";
  const companyPhone = company?.phone || "";
  const clientName = client?.name || "-";
  const clientDocType = client?.document_type || "Documento";
  const clientDocNumber = client?.document_number || "-";
  const clientPhone = client?.phone || "-";
  const clientAddress = client?.address_line || client?.address || "-";
  const contractNo = loan?.contract_no || "-";
  const principal = Number(loan?.principal || 0);
  const rate = Number(loan?.interest_rate || 0);
  const frequency = paymentFrequencyLabelDoc(loan?.payment_frequency || "-");
  const disbursed = formatDocDate(loan?.disbursed_on);
  const maturity = formatDocDate(loan?.maturity_on);
  const generatedDate = formatDocDate(generatedAt || new Date().toISOString());
  const reimbursementRows = normalizeDocAccounts(reimbursementAccounts, companyName);
  const disbursementRows = normalizeDocAccounts(disbursementAccounts, clientName);

  const scheduleRows = (Array.isArray(installments) ? installments : [])
    .map((row, idx) => ({
      installmentNo: Number(row?.installment_no || row?.installmentNo || idx + 1),
      dueOn: row?.due_on || row?.dueOn || "",
      principalAmount: Number(row?.principal_amount || row?.principalAmount || 0),
      interestAmount: Number(row?.interest_amount || row?.interestAmount || 0),
      paymentAmount: Number(row?.payment_amount || row?.paymentAmount || 0),
      balanceAfter: Number(row?.balance_after || row?.balanceAfter || 0),
    }))
    .sort((a, b) => a.installmentNo - b.installmentNo);

  const totals = scheduleRows.reduce(
    (acc, row) => {
      acc.principal += row.principalAmount;
      acc.interest += row.interestAmount;
      acc.payment += row.paymentAmount;
      return acc;
    },
    { principal: 0, interest: 0, payment: 0 },
  );

  const FIRST_PAGE_ROW_LIMIT = 16;
  const SECOND_PAGE_ROW_LIMIT = 22;
  const firstPageRows = scheduleRows.slice(0, FIRST_PAGE_ROW_LIMIT);
  let secondPageRows = scheduleRows.slice(FIRST_PAGE_ROW_LIMIT);
  let omittedRows = 0;
  if (secondPageRows.length > SECOND_PAGE_ROW_LIMIT) {
    omittedRows = secondPageRows.length - SECOND_PAGE_ROW_LIMIT;
    secondPageRows = secondPageRows.slice(-SECOND_PAGE_ROW_LIMIT);
  }
  const hasSecondPage = secondPageRows.length > 0;

  const renderScheduleTableRows = (rows) => {
    if (!rows.length) {
      return "<tr><td colspan='6' class='center muted'>Sem parcelas registadas para este contrato.</td></tr>";
    }
    return rows
      .map(
        (row) => `
        <tr>
          <td class="center">${row.installmentNo}</td>
          <td class="center">${escapeHtml(formatDocDate(row.dueOn))}</td>
          <td class="right">${escapeHtml(formatMoneyDoc(row.principalAmount))}</td>
          <td class="right">${escapeHtml(formatMoneyDoc(row.interestAmount))}</td>
          <td class="right">${escapeHtml(formatMoneyDoc(row.paymentAmount))}</td>
          <td class="right">${escapeHtml(formatMoneyDoc(row.balanceAfter))}</td>
        </tr>`,
      )
      .join("");
  };

  const renderAccountRows = (rows) =>
    rows
      .map(
        (row) => `
        <tr>
          <td>${escapeHtml(row.bank)}</td>
          <td>${escapeHtml(row.accountNumber)}</td>
          <td>${escapeHtml(row.nib)}</td>
          <td>${escapeHtml(row.holder)}</td>
        </tr>`,
      )
      .join("");

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Confissao de Divida - ${escapeHtml(contractNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; font-size: 11px; line-height: 1.3; }
      h1 { margin: 10px 0 8px; text-align: center; font-size: 18px; letter-spacing: .6px; }
      h2 { margin: 9px 0 5px; font-size: 12px; text-transform: uppercase; color: #1e293b; }
      p { margin: 4px 0; }
      .muted { color: #475569; font-size: 10px; }
      .sheet { width: 100%; }
      .head { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; display: grid; grid-template-columns: 1fr auto; gap: 8px; }
      .head p { margin: 2px 0; }
      .meta { text-align: right; min-width: 230px; }
      .section { margin-top: 7px; }
      .meta-line { font-size: 10.5px; color: #334155; }
      table { width: 100%; border-collapse: collapse; margin-top: 4px; }
      th, td { border: 1px solid #cbd5e1; padding: 4px 5px; font-size: 10px; }
      th { background: #f8fafc; text-align: left; }
      .center { text-align: center; }
      .right { text-align: right; }
      .declaration { margin-top: 8px; font-weight: 600; font-size: 10.5px; }
      .signatures { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
      .sign-line { border-top: 1px solid #475569; margin-top: 26px; padding-top: 3px; text-align: center; font-size: 10px; }
      .foot { margin-top: 10px; border-top: 1px dashed #94a3b8; padding-top: 5px; font-size: 9.5px; color: #475569; text-align: center; }
      .page-break { page-break-before: always; break-before: page; height: 0; }
      .keep { page-break-inside: avoid; break-inside: avoid; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="head keep">
        <div>
          <p><strong>${escapeHtml(companyName)}</strong></p>
          <p class="muted">${escapeHtml(companyAddress)}</p>
          <p class="muted">NUIT: ${escapeHtml(companyNuit)}${companyEmail ? ` | Email: ${escapeHtml(companyEmail)}` : ""}${companyPhone ? ` | Tel: ${escapeHtml(companyPhone)}` : ""}</p>
        </div>
        <div class="meta">
          <p><strong>Documento:</strong> ${escapeHtml(docNo || "-")}</p>
          <p><strong>Data:</strong> ${escapeHtml(generatedDate)}</p>
          <p><strong>Gerado por:</strong> ${escapeHtml(generatedByName || "Sistema")}</p>
          <p><strong>Funcao:</strong> ${escapeHtml(roleLabel(generatedByRole || ""))}</p>
        </div>
      </div>

      <h1>CONFISSAO DA DIVIDA</h1>

      <p>
        Eu, <strong>${escapeHtml(clientName)}</strong>, portador do <strong>${escapeHtml(clientDocType)} ${escapeHtml(clientDocNumber)}</strong>,
        contacto <strong>${escapeHtml(clientPhone)}</strong>, residente em <strong>${escapeHtml(clientAddress)}</strong>,
        declaro para os devidos efeitos que reconheco a divida referente ao contrato <strong>${escapeHtml(contractNo)}</strong>
        celebrado com <strong>${escapeHtml(companyName)}</strong>.
      </p>

      <div class="section keep">
        <h2>1. Plano de Amortizacao</h2>
        <p class="meta-line">
          Montante: <strong>${escapeHtml(formatMoneyDoc(principal))} MT</strong>, com a taxa de juro de <strong>${escapeHtml(rate.toFixed(2))}%</strong> ao mes.
          Frequencia: <strong>${escapeHtml(frequency)}</strong>. Desembolso: <strong>${escapeHtml(disbursed)}</strong>.
          Vencimento: <strong>${escapeHtml(maturity)}</strong>.
        </p>
        <table>
          <thead>
            <tr>
              <th style="width:8%;">No</th>
              <th style="width:20%;">Data</th>
              <th style="width:18%;">Capital</th>
              <th style="width:18%;">Juro</th>
              <th style="width:18%;">Prestacao</th>
              <th style="width:18%;">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${renderScheduleTableRows(firstPageRows)}
          </tbody>
          <tfoot>
            <tr>
              <th colspan="2" class="right">Total</th>
              <th class="right">${escapeHtml(formatMoneyDoc(totals.principal))}</th>
              <th class="right">${escapeHtml(formatMoneyDoc(totals.interest))}</th>
              <th class="right">${escapeHtml(formatMoneyDoc(totals.payment))}</th>
              <th class="right">-</th>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="section keep">
        <h2>2. Numero de conta para reembolso, ${escapeHtml(companyName)}</h2>
        <table>
          <thead>
            <tr>
              <th>Banco</th>
              <th>Numero de Conta</th>
              <th>NIB</th>
              <th>Titular</th>
            </tr>
          </thead>
          <tbody>
            ${renderAccountRows(reimbursementRows)}
          </tbody>
        </table>
      </div>

      <div class="section keep">
        <h2>3. Numero de conta para desembolso, ${escapeHtml(clientName)}</h2>
        <table>
          <thead>
            <tr>
              <th>Banco</th>
              <th>Numero de Conta</th>
              <th>NIB</th>
              <th>Titular</th>
            </tr>
          </thead>
          <tbody>
            ${renderAccountRows(disbursementRows)}
          </tbody>
        </table>
      </div>

      <p class="declaration">
        Nos termos acima descritos declaro-me responsavel pelo pagamento da divida acima mencionada a ${escapeHtml(companyName)},
        aos prazos acordados.
      </p>

      <div class="signatures keep">
        <div>
          <div class="sign-line">${escapeHtml(clientName)}</div>
        </div>
        <div>
          <div class="sign-line">Representante ${escapeHtml(companyName)}</div>
        </div>
      </div>

      <div class="foot">
        ${escapeHtml(companyName)} | ${escapeHtml(companyAddress)} | NUIT ${escapeHtml(companyNuit)}
      </div>
    </div>

    ${
      hasSecondPage
        ? `
      <div class="page-break"></div>
      <div class="sheet">
        <h2>1. Plano de Amortizacao (continuacao)</h2>
        ${
          omittedRows > 0
            ? `<p class="muted">Foram omitidas ${omittedRows} parcelas intermediarias para manter a confissao em no maximo 2 paginas. O cronograma completo permanece no contrato/plano do sistema.</p>`
            : ""
        }
        <table>
          <thead>
            <tr>
              <th style="width:8%;">No</th>
              <th style="width:20%;">Data</th>
              <th style="width:18%;">Capital</th>
              <th style="width:18%;">Juro</th>
              <th style="width:18%;">Prestacao</th>
              <th style="width:18%;">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${renderScheduleTableRows(secondPageRows)}
          </tbody>
        </table>
        <div class="foot">
          ${escapeHtml(companyName)} | ${escapeHtml(companyAddress)} | NUIT ${escapeHtml(companyNuit)}
        </div>
      </div>`
        : ""
    }
  </body>
</html>`;
}

function renderLoanDocumentHtml({
  company,
  client,
  loan,
  docType,
  generatedAt,
  docNo,
  generatedByName,
  generatedByRole,
  collaterals = [],
  guarantors = [],
  groupMembers = [],
  installments = [],
  reimbursementAccounts = [],
  disbursementAccounts = [],
}) {
  if (docType === "contrato") {
    return renderContractLoanHtml({
      company,
      client,
      loan,
      generatedAt,
      docNo,
      generatedByName,
      generatedByRole,
      collaterals,
      guarantors,
      groupMembers,
      installments,
    });
  }
  if (docType === "confissao_divida") {
    return renderDebtConfessionHtml({
      company,
      client,
      loan,
      generatedAt,
      docNo,
      generatedByName,
      generatedByRole,
      installments,
      reimbursementAccounts,
      disbursementAccounts,
    });
  }
  const title = formatDocTypeLabel(docType);
  const showCorporateHeader = docType !== "contrato";
  const todayText = new Date(generatedAt || Date.now()).toLocaleDateString("pt-PT");
  const companyName = company?.legal_name || company?.name || "Empresa";
  const companyAddress = company?.address || "Endereco nao informado";
  const companyNuit = company?.nuit || "-";
  const companyLogo = company?.logo_url || "";
  const clientName = client?.name || "-";
  const clientDocType = client?.document_type || "Documento";
  const clientDocNumber = client?.document_number || "-";
  const clientPhone = client?.phone || "-";
  const clientAddress = client?.address_line || client?.address || "-";
  const principal = Number(loan?.principal || 0).toFixed(2);
  const administrativeFeeAmount = Number(
    loan?.administrative_fee_amount
    ?? calculateAdministrativeFeeAmount(loan?.principal || 0, loan?.administrative_fee_mode || "isento"),
  ).toFixed(2);
  const disbursementNetAmount = Number(
    loan?.disbursement_net_amount
    ?? calculateDisbursementNetAmount(loan?.principal || 0, loan?.administrative_fee_amount || 0),
  ).toFixed(2);
  const rate = Number(loan?.interest_rate || 0).toFixed(2);
  const frequency = loan?.payment_frequency || "-";
  const maturity = loan?.maturity_on || "-";
  const disbursed = loan?.disbursed_on || "-";
  const contractNo = loan?.contract_no || "-";
  const collateralsList = Array.isArray(collaterals) ? collaterals : [];
  const collateralsTotal = collateralsList.reduce((sum, item) => sum + Number(item?.estimated_value || 0), 0);
  const collateralRows = collateralsList
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item?.collateral_type || "-")}</td>
          <td>${escapeHtml(item?.description || "-")}</td>
          <td>${escapeHtml(item?.document_ref || "-")}</td>
          <td style="text-align:right;">${escapeHtml(formatMoneyDoc(item?.estimated_value || 0))} MT</td>
        </tr>`,
    )
    .join("");
  const collateralSection = docType === "contrato"
    ? `
    <h2>Garantias Arroladas</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Tipo</th>
          <th>Descricao</th>
          <th>Referencia</th>
          <th style="text-align:right;">Valor (MT)</th>
        </tr>
      </thead>
      <tbody>
        ${
          collateralRows ||
          "<tr><td colspan='5'>Sem garantias cadastradas para este cliente.</td></tr>"
        }
      </tbody>
      <tfoot>
        <tr>
          <th colspan="4" style="text-align:right;">Total Geral das Garantias</th>
          <th style="text-align:right;">${escapeHtml(formatMoneyDoc(collateralsTotal))} MT</th>
        </tr>
      </tfoot>
    </table>`
    : "";
  const clausesByDocType = {
    contrato: [
      `Entre ${escapeHtml(companyName)}, com sede em ${escapeHtml(companyAddress)}, e o cliente identificado acima, fica acordado o credito sob as condicoes registadas no contrato e no plano de pagamento.`,
      "O cliente reconhece a divida, compromete-se ao pagamento pontual das prestacoes e aceita os encargos de mora definidos na politica da empresa para prestacoes vencidas.",
      "Este documento foi gerado automaticamente pelo sistema e integra o processo formal do contrato de credito.",
    ],
    confissao_divida: [
      `O cliente ${escapeHtml(clientName)} declara, para os devidos efeitos, que reconhece a divida associada ao contrato ${escapeHtml(contractNo)}.`,
      "Compromete-se a liquidar os valores nas datas acordadas e aceita a aplicacao de mora em caso de incumprimento.",
      "A presente confissao tem valor probatorio e integra o processo de credito da instituicao.",
    ],
    declaracao: [
      `Declara-se que o credito referente ao contrato ${escapeHtml(contractNo)} foi concedido a ${escapeHtml(clientName)} nos termos aprovados pela instituicao.`,
      "O cliente confirma ter recebido informacoes claras sobre o plano de pagamento, encargos e condicoes de regularizacao.",
      "Este documento deve acompanhar o dossie do cliente para fins de controlo interno e auditoria.",
    ],
    desconto_salarial: [
      `O cliente ${escapeHtml(clientName)} autoriza o desconto salarial para regularizacao do contrato ${escapeHtml(contractNo)}.`,
      "A autorizacao cobre prestacoes vincendas, juros e encargos de mora previstos nas politicas da empresa.",
      "A revogacao desta autorizacao deve obedecer aos termos contratuais e aprovacao formal da instituicao.",
    ],
    termo_compromisso: [
      `Pelo presente termo, ${escapeHtml(clientName)} compromete-se a cumprir integralmente o plano de pagamento do contrato ${escapeHtml(contractNo)}.`,
      "Em caso de incumprimento, o cliente aceita os procedimentos de cobranca previstos, incluindo renegociacao e medidas legais.",
      "O presente termo passa a integrar os documentos obrigatorios do processo de credito.",
    ],
    termo_entrega: [
      `Fica registado que o valor do credito do contrato ${escapeHtml(contractNo)} foi disponibilizado ao cliente ${escapeHtml(clientName)}.`,
      `Data de desembolso: ${escapeHtml(disbursed)}. Valor principal: ${escapeHtml(principal)} MT. Preparo: ${escapeHtml(administrativeFeeAmount)} MT. Valor liquido entregue: ${escapeHtml(disbursementNetAmount)} MT.`,
      "Este termo confirma a entrega e deve ser assinado pelas partes para fecho do processo de desembolso.",
    ],
  };
  const clauseParagraphs = (clausesByDocType[docType] || clausesByDocType.contrato)
    .map((line) => `<p>${line}</p>`)
    .join("");

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)} - ${escapeHtml(contractNo)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 28px; color: #0f172a; line-height: 1.45; }
      h1 { font-size: 22px; margin: 0 0 10px; }
      h2 { font-size: 14px; margin: 16px 0 8px; text-transform: uppercase; letter-spacing: .6px; color: #334155; }
      p { margin: 8px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; text-align: left; vertical-align: top; }
      th { background: #f8fafc; }
      .muted { color: #475569; font-size: 12px; }
      .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-top: 10px; }
      .corp-head { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; display:flex; justify-content:space-between; gap:14px; margin-bottom: 12px; }
      .corp-brand { display:flex; gap:12px; align-items:center; }
      .corp-logo { width:64px; height:64px; object-fit:cover; border:1px solid #cbd5e1; border-radius:8px; }
      .corp-logo-ph { width:64px; height:64px; border:1px dashed #94a3b8; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:11px; }
      .corp-meta p { margin: 3px 0; font-size: 12px; }
      .sign { margin-top: 38px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
      .line { border-top: 1px solid #475569; margin-top: 48px; padding-top: 6px; font-size: 12px; }
    </style>
  </head>
  <body>
    ${showCorporateHeader ? `
    <div class="corp-head">
      <div class="corp-brand">
        ${companyLogo ? `<img src="${escapeHtml(companyLogo)}" class="corp-logo" alt="Logo empresa" />` : `<div class="corp-logo-ph">LOGO</div>`}
        <div>
          <h1 style="margin:0;">${escapeHtml(companyName)}</h1>
          <p class="muted" style="margin:2px 0;"><strong>NUIT:</strong> ${escapeHtml(companyNuit)}</p>
          <p class="muted" style="margin:2px 0;"><strong>Endereco:</strong> ${escapeHtml(companyAddress)}</p>
        </div>
      </div>
      <div class="corp-meta">
        <p><strong>Documento:</strong> ${escapeHtml(docNo || "-")}</p>
        <p><strong>Gerado por:</strong> ${escapeHtml(generatedByName || "Sistema")}</p>
        <p><strong>Funcao:</strong> ${escapeHtml(roleLabel(generatedByRole))}</p>
        <p><strong>Data:</strong> ${escapeHtml(todayText)}</p>
      </div>
    </div>` : ""}
    <h1>${escapeHtml(title)}</h1>
    <div class="card">
      <p><strong>Contrato:</strong> ${escapeHtml(contractNo)}</p>
      <p><strong>Cliente:</strong> ${escapeHtml(clientName)} (${escapeHtml(clientDocType)} ${escapeHtml(clientDocNumber)})</p>
      <p><strong>Contacto:</strong> ${escapeHtml(clientPhone)} | <strong>Morada:</strong> ${escapeHtml(clientAddress)}</p>
      <p><strong>Capital:</strong> ${escapeHtml(principal)} MT | <strong>Taxa mensal:</strong> ${escapeHtml(rate)}%</p>
      <p><strong>Preparo:</strong> ${escapeHtml(administrativeFeeAmount)} MT | <strong>Desembolso liquido:</strong> ${escapeHtml(disbursementNetAmount)} MT</p>
      <p><strong>Frequencia:</strong> ${escapeHtml(frequency)} | <strong>Desembolso:</strong> ${escapeHtml(disbursed)} | <strong>Vencimento:</strong> ${escapeHtml(maturity)}</p>
    </div>
    ${collateralSection}
    <h2>Clausulas</h2>
    ${clauseParagraphs}
    <div class="sign">
      <div>
        <div class="line">Cliente</div>
      </div>
      <div>
        <div class="line">Representante ${escapeHtml(companyName)}</div>
      </div>
    </div>
  </body>
</html>`;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function normalizeLoanProductType(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  if (normalized.includes("acrescimo") || normalized.includes("negocio") || normalized.includes("comercial")) return LOAN_PRODUCT_TYPES.ACRESCIMO;
  if (normalized.includes("reemprestimo") || normalized.includes("renovacao")) return LOAN_PRODUCT_TYPES.REEMPRESTIMO;
  if (normalized.includes("especial") || normalized.includes("emergencia") || normalized.includes("rapido")) return LOAN_PRODUCT_TYPES.ESPECIAL;
  return LOAN_PRODUCT_TYPES.NORMAL;
}

function normalizeRatePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  // Accept both formats: 30 (30%) and 0.30 (30%).
  if (numeric > 0 && numeric < 1) return numeric * 100;
  return numeric;
}

const FIXED_MORA_RATE = 0.02; // 2% ao dia sobre a prestacao em mora
const FIXED_MORA_GRACE_DAYS = 0; // Mora inicia no dia seguinte ao vencimento
const ADMINISTRATIVE_FEE_RATE = 0.02; // 2% do capital
const ADMINISTRATIVE_FEE_RATE_PERCENT = 2;

function normalizeMoraPolicySettings(rawPolicy) {
  const dailyEnabledRaw = rawPolicy?.mora_daily_enabled !== undefined
    ? Boolean(rawPolicy.mora_daily_enabled)
    : rawPolicy?.moraDailyEnabled !== undefined
      ? Boolean(rawPolicy.moraDailyEnabled)
      : DEFAULT_APPROVAL_POLICY.moraDailyEnabled;
  const weeklyEnabledRaw = rawPolicy?.mora_weekly_enabled !== undefined
    ? Boolean(rawPolicy.mora_weekly_enabled)
    : rawPolicy?.moraWeeklyEnabled !== undefined
      ? Boolean(rawPolicy.moraWeeklyEnabled)
      : DEFAULT_APPROVAL_POLICY.moraWeeklyEnabled;
  const monthlyEnabledRaw = rawPolicy?.mora_monthly_enabled !== undefined
    ? Boolean(rawPolicy.mora_monthly_enabled)
    : rawPolicy?.moraMonthlyEnabled !== undefined
      ? Boolean(rawPolicy.moraMonthlyEnabled)
      : DEFAULT_APPROVAL_POLICY.moraMonthlyEnabled;

  // Precedencia para evitar duplicacao: diaria > semanal > mensal.
  const moraDailyEnabled = dailyEnabledRaw;
  const moraWeeklyEnabled = !moraDailyEnabled && weeklyEnabledRaw;
  const moraMonthlyEnabled = !moraDailyEnabled && !moraWeeklyEnabled && monthlyEnabledRaw;
  const moraMode = moraDailyEnabled
    ? "daily"
    : moraWeeklyEnabled
      ? "weekly"
      : moraMonthlyEnabled
        ? "monthly"
        : "none";

  return {
    moraMonthlyEnabled,
    moraWeeklyEnabled,
    moraDailyEnabled,
    moraMode,
  };
}

function normalizePaymentFrequencyValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["diario", "semanal", "quinzenal", "mensal"].includes(normalized)) return normalized;
  return "mensal";
}

function resolveMoraMode(policySettings = null) {
  const policy = normalizeMoraPolicySettings(policySettings);
  return policy.moraMode || "none";
}

function resolvePenaltyRateDecimal(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric / 100;
  }
  return FIXED_MORA_RATE;
}

function resolveMoraPeriods({ moraMode, daysOverdue, dueDate, referenceDate, disbursedDate }) {
  const overdueDays = Number(daysOverdue || 0);
  if (!Number.isFinite(overdueDays) || overdueDays <= 0) return 0;

  if (moraMode === "daily") {
    return Math.max(1, Math.floor(overdueDays));
  }

  if (moraMode === "weekly") {
    return Math.max(1, Math.ceil(overdueDays / 7));
  }

  if (moraMode === "monthly") {
    const refDate = referenceDate instanceof Date ? referenceDate : parseIsoDate(referenceDate);
    const disbursed = disbursedDate instanceof Date
      ? disbursedDate
      : parseIsoDate(disbursedDate) || (dueDate instanceof Date ? dueDate : parseIsoDate(dueDate));
    if (!refDate || !disbursed) return 0;
    const daysSinceDisbursement = Math.max(0, daysBetween(disbursed, refDate));
    if (daysSinceDisbursement < 30) return 0;
    return Math.max(1, Math.floor(daysSinceDisbursement / 30));
  }

  return 0;
}

function isMoraEnabledForFrequency(_paymentFrequency, policySettings = null) {
  return resolveMoraMode(policySettings) !== "none";
}

function normalizeAdministrativeFeeMode(value) {
  void value;
  return "aplicar";
}

function calculateAdministrativeFeeAmount(principal, administrativeFeeMode) {
  const normalizedPrincipal = Number(principal || 0);
  if (!Number.isFinite(normalizedPrincipal) || normalizedPrincipal <= 0) return 0;
  void administrativeFeeMode;
  return round2(normalizedPrincipal * ADMINISTRATIVE_FEE_RATE);
}

function calculateDisbursementNetAmount(principal, administrativeFeeAmount) {
  return round2(Math.max(0, Number(principal || 0) - Number(administrativeFeeAmount || 0)));
}

function resolveFixedMoraDays(daysOverdue) {
  const normalizedDays = Number(daysOverdue || 0);
  if (!Number.isFinite(normalizedDays) || normalizedDays <= FIXED_MORA_GRACE_DAYS) return 0;
  return Math.max(0, Math.floor(normalizedDays - FIXED_MORA_GRACE_DAYS));
}

function calculateFixedMoraAmount(amount, options = {}) {
  const moraEnabled = options?.moraEnabled !== undefined ? Boolean(options.moraEnabled) : true;
  const normalizedAmount = Number(amount || 0);
  const moraDays = resolveFixedMoraDays(options?.daysOverdue);
  const penaltyRate = resolvePenaltyRateDecimal(options?.dailyPenaltyRate);
  if (!moraEnabled) return 0;
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return 0;
  if (moraDays <= 0) return 0;
  return round2(normalizedAmount * penaltyRate * moraDays);
}

function calculateMora(balance, dailyPenaltyRate, daysOverdue, options = {}) {
  return calculateFixedMoraAmount(balance, {
    ...options,
    dailyPenaltyRate,
    daysOverdue,
  });
}

function calculateNetMora(balance, dailyPenaltyRate, daysOverdue, waivedTotal, options = {}) {
  return Math.max(0, round2(calculateMora(balance, dailyPenaltyRate, daysOverdue, options) - (Number(waivedTotal) || 0)));
}

function deriveLoanStatus(daysOverdue) {
  if (!Number.isFinite(daysOverdue) || daysOverdue <= 0) return "active";
  if (daysOverdue <= 30) return "warning";
  return "overdue";
}

function calculateInstallmentsMora(overdueAmount, dailyPenaltyRate, waivedTotal, options = {}) {
  const moraEnabled = options?.moraEnabled !== undefined ? Boolean(options.moraEnabled) : true;
  const weightedOverdueAmount = Number(options?.weightedOverdueAmount || 0);
  const penaltyRate = resolvePenaltyRateDecimal(dailyPenaltyRate);
  const gross = moraEnabled && Number.isFinite(weightedOverdueAmount) && weightedOverdueAmount > 0
    ? round2(weightedOverdueAmount * penaltyRate)
    : calculateFixedMoraAmount(overdueAmount, {
      ...options,
      dailyPenaltyRate,
      daysOverdue: options?.daysOverdue,
    });
  return Math.max(0, round2(gross - (Number(waivedTotal) || 0)));
}

async function fetchLoanDelinquencyMetrics(dbClient, loanId) {
  const runner = dbClient?.query ? dbClient : { query };
  const result = await runner.query(
    `
    SELECT
      COALESCE(MAX(CASE
        WHEN li.status <> 'paid'
          AND li.due_date < CURRENT_DATE
          AND ((li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
        THEN (CURRENT_DATE - li.due_date)
        ELSE 0
      END), 0)::INT AS days_overdue,
      COALESCE(SUM(CASE
        WHEN li.status <> 'paid'
          AND li.due_date < CURRENT_DATE
          AND ((li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
        THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
        ELSE 0
      END), 0)::NUMERIC AS overdue_amount,
      COALESCE(SUM(CASE
        WHEN li.status <> 'paid'
          AND li.due_date < CURRENT_DATE
          AND ((li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
        THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
          * GREATEST(0, (CURRENT_DATE - li.due_date) - ${FIXED_MORA_GRACE_DAYS})
        ELSE 0
      END), 0)::NUMERIC AS overdue_weighted_amount
    FROM loan_installments li
    WHERE li.loan_id = $1
    `,
    [loanId],
  );
  const row = result.rows[0] || {};
  return {
    daysOverdue: Number(row.days_overdue || 0),
    overdueAmount: Number(row.overdue_amount || 0),
    overdueWeightedAmount: Number(row.overdue_weighted_amount || 0),
  };
}

async function syncLoanDelinquencyState(dbClient, loanId, companyId) {
  const metrics = await fetchLoanDelinquencyMetrics(dbClient, loanId);
  const nextStatus = deriveLoanStatus(metrics.daysOverdue);
  const runner = dbClient?.query ? dbClient : { query };
  await runner.query(
    `
    UPDATE loans
    SET days_overdue = $1,
        status = $2
    WHERE id = $3 AND company_id = $4
    `,
    [metrics.daysOverdue, nextStatus, loanId, companyId],
  );
  return { ...metrics, status: nextStatus };
}

function getDelinquencyBucket(daysOverdue) {
  if (daysOverdue <= 0) return "0";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

function getCollectionStage(daysOverdue) {
  if (daysOverdue <= 0) return { code: "on_time", title: "Em dia", action: "Sem cobranca ativa." };
  if (daysOverdue <= 7) return { code: "friendly_reminder", title: "Lembrete amigavel", action: "SMS/WhatsApp e chamada de confirmacao." };
  if (daysOverdue <= 15) return { code: "call_followup", title: "Follow-up telefonico", action: "Contato telefonico estruturado e registro de resposta." };
  if (daysOverdue <= 30) return { code: "field_followup", title: "Cobranca intensiva", action: "Visita/contato presencial e proposta de regularizacao." };
  if (daysOverdue <= 60) return { code: "formal_notice", title: "Aviso formal", action: "Notificacao formal e exigencia de promessa de pagamento." };
  if (daysOverdue <= 90) return { code: "pre_legal", title: "Pre-juridico", action: "Preparacao de recuperacao juridica e renegociacao obrigatoria." };
  return { code: "legal", title: "Juridico", action: "Encaminhamento para acao juridica." };
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseDateRangeQuery(query) {
  const fromRaw = String(query.from || "").trim();
  const toRaw = String(query.to || "").trim();
  if (!fromRaw && !toRaw) {
    return { hasRange: false, from: null, to: null, error: null };
  }
  const normalizedFrom = fromRaw || toRaw;
  const normalizedTo = toRaw || fromRaw;
  const parsedFrom = parseIsoDate(normalizedFrom);
  const parsedTo = parseIsoDate(normalizedTo);
  if (!parsedFrom || !parsedTo) {
    return { hasRange: false, from: null, to: null, error: "Intervalo de datas invalido. Use formato YYYY-MM-DD." };
  }
  if (parsedFrom.getTime() > parsedTo.getTime()) {
    return { hasRange: false, from: null, to: null, error: "Data inicial nao pode ser maior que data final." };
  }
  return {
    hasRange: true,
    from: formatIsoDate(parsedFrom),
    to: formatIsoDate(parsedTo),
    error: null,
  };
}

function parseYearMonthQuery(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const first = new Date(Date.UTC(year, month - 1, 1));
  if (Number.isNaN(first.getTime())) return null;
  return first;
}

function monthContextFromQuery(monthQuery) {
  const today = parseIsoDate(new Date().toISOString().slice(0, 10)) || new Date();
  const selectedMonthStart = parseYearMonthQuery(monthQuery) || new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthStart = new Date(Date.UTC(selectedMonthStart.getUTCFullYear(), selectedMonthStart.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(selectedMonthStart.getUTCFullYear(), selectedMonthStart.getUTCMonth() + 1, 0));
  const referenceDate = monthEnd.getTime() < today.getTime() ? monthEnd : today;
  const monthKey = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = monthStart.getUTCFullYear() === today.getUTCFullYear() && monthStart.getUTCMonth() === today.getUTCMonth();
  return {
    monthKey,
    monthStart,
    monthEnd,
    referenceDate,
    isCurrentMonth,
    periodStart: formatIsoDate(monthStart),
    periodEnd: formatIsoDate(monthEnd),
    referenceDateIso: formatIsoDate(referenceDate),
  };
}

function isFutureMonthContext(monthCtx) {
  if (!monthCtx?.monthStart) return false;
  const today = parseIsoDate(new Date().toISOString().slice(0, 10)) || new Date();
  const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return monthCtx.monthStart.getTime() > currentMonthStart.getTime();
}

function currentYearMonthKey() {
  const today = parseIsoDate(new Date().toISOString().slice(0, 10)) || new Date();
  return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
}

function roundRowValues(row) {
  const numericKeys = [
    "disbursementAmount",
    "vigenteCapital",
    "reimbursementInterest",
    "reimbursementPrincipal",
    "moraTodayCapital",
    "moraTotalCapital",
    "moraRiskPercent",
    "moraOver7Capital",
    "moraOver15Capital",
    "moraOver30Capital",
  ];
  const result = { ...row };
  for (const key of numericKeys) {
    result[key] = round2(Number(result[key] || 0));
  }
  return result;
}

function buildMonthlyPerformanceTotals(rows) {
  const totals = rows.reduce(
    (acc, row) => {
      acc.disbursementAmount += Number(row.disbursementAmount || 0);
      acc.newClients += Number(row.newClients || 0);
      acc.reimbursementCount += Number(row.reimbursementCount || 0);
      acc.vigenteCount += Number(row.vigenteCount || 0);
      acc.vigenteCapital += Number(row.vigenteCapital || 0);
      acc.reimbursementInterest += Number(row.reimbursementInterest || 0);
      acc.reimbursementPrincipal += Number(row.reimbursementPrincipal || 0);
      acc.moraTodayCount += Number(row.moraTodayCount || 0);
      acc.moraTodayCapital += Number(row.moraTodayCapital || 0);
      acc.moraTotalCount += Number(row.moraTotalCount || 0);
      acc.moraTotalCapital += Number(row.moraTotalCapital || 0);
      acc.moraOver7Count += Number(row.moraOver7Count || 0);
      acc.moraOver7Capital += Number(row.moraOver7Capital || 0);
      acc.moraOver15Count += Number(row.moraOver15Count || 0);
      acc.moraOver15Capital += Number(row.moraOver15Capital || 0);
      acc.moraOver30Count += Number(row.moraOver30Count || 0);
      acc.moraOver30Capital += Number(row.moraOver30Capital || 0);
      return acc;
    },
    {
      disbursementAmount: 0,
      newClients: 0,
      reimbursementCount: 0,
      vigenteCount: 0,
      vigenteCapital: 0,
      reimbursementInterest: 0,
      reimbursementPrincipal: 0,
      moraTodayCount: 0,
      moraTodayCapital: 0,
      moraTotalCount: 0,
      moraTotalCapital: 0,
      moraRiskPercent: 0,
      moraOver7Count: 0,
      moraOver7Capital: 0,
      moraOver15Count: 0,
      moraOver15Capital: 0,
      moraOver30Count: 0,
      moraOver30Capital: 0,
    },
  );
  totals.moraRiskPercent = totals.vigenteCapital > 0 ? round2((totals.moraTotalCapital / totals.vigenteCapital) * 100) : 0;
  return roundRowValues(totals);
}

async function computeMonthlyPerformanceSnapshot({ companyId, monthStartIso, monthEndIso, referenceDateIso }) {
  const actorRows = await query(
    `
    SELECT id, full_name, LOWER(role) AS role
    FROM users
    WHERE company_id = $1
      AND LOWER(role) IN ('manager', 'agent')
    ORDER BY full_name ASC
    `,
    [companyId],
  );

  const actorMap = new Map(
    actorRows.rows.map((row) => [
      Number(row.id),
      {
        actorId: Number(row.id),
        actorName: row.full_name || "Sem Nome",
        actorRole: (row.role || "manager") === "agent" ? "agent" : "manager",
        disbursementAmount: 0,
        newClients: 0,
        reimbursementCount: 0,
        vigenteCount: 0,
        vigenteCapital: 0,
        reimbursementInterest: 0,
        reimbursementPrincipal: 0,
        moraTodayCount: 0,
        moraTodayCapital: 0,
        moraTotalCount: 0,
        moraTotalCapital: 0,
        moraRiskPercent: 0,
        moraOver7Count: 0,
        moraOver7Capital: 0,
        moraOver15Count: 0,
        moraOver15Capital: 0,
        moraOver30Count: 0,
        moraOver30Capital: 0,
      },
    ]),
  );

  const ensureActor = (actorId) => {
    const id = Number(actorId);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (!actorMap.has(id)) {
      actorMap.set(id, {
        actorId: id,
        actorName: `Utilizador #${id}`,
        actorRole: "manager",
        disbursementAmount: 0,
        newClients: 0,
        reimbursementCount: 0,
        vigenteCount: 0,
        vigenteCapital: 0,
        reimbursementInterest: 0,
        reimbursementPrincipal: 0,
        moraTodayCount: 0,
        moraTodayCapital: 0,
        moraTotalCount: 0,
        moraTotalCapital: 0,
        moraRiskPercent: 0,
        moraOver7Count: 0,
        moraOver7Capital: 0,
        moraOver15Count: 0,
        moraOver15Capital: 0,
        moraOver30Count: 0,
        moraOver30Capital: 0,
      });
    }
    return actorMap.get(id);
  };

  const disbursementRows = await query(
    `
    SELECT manager_user_id AS actor_id, COUNT(*)::INT AS disbursement_count, COALESCE(SUM(principal), 0)::NUMERIC AS disbursement_amount
    FROM loans
    WHERE company_id = $1
      AND manager_user_id IS NOT NULL
      AND disbursed_on IS NOT NULL
      AND disbursed_on BETWEEN $2::date AND $3::date
    GROUP BY manager_user_id
    `,
    [companyId, monthStartIso, monthEndIso],
  );
  for (const row of disbursementRows.rows) {
    const target = ensureActor(row.actor_id);
    if (!target) continue;
    target.disbursementAmount = round2(Number(target.disbursementAmount || 0) + Number(row.disbursement_amount || 0));
  }

  const vigenteRows = await query(
    `
    SELECT
      manager_user_id AS actor_id,
      COUNT(*) FILTER (
        WHERE COALESCE(balance, 0) > 0.009 AND COALESCE(disbursement_status, 'disbursed') = 'disbursed'
      )::INT AS vigente_count,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(balance, 0) > 0.009 AND COALESCE(disbursement_status, 'disbursed') = 'disbursed'
          THEN balance ELSE 0
        END
      ), 0)::NUMERIC AS vigente_capital
    FROM loans
    WHERE company_id = $1
      AND manager_user_id IS NOT NULL
    GROUP BY manager_user_id
    `,
    [companyId],
  );
  for (const row of vigenteRows.rows) {
    const target = ensureActor(row.actor_id);
    if (!target) continue;
    target.vigenteCount = Number(row.vigente_count || 0);
    target.vigenteCapital = round2(Number(row.vigente_capital || 0));
  }

  const reimbursementRows = await query(
    `
    SELECT
      l.manager_user_id AS actor_id,
      COUNT(DISTINCT lr.id)::INT AS reimbursement_count,
      COALESCE(SUM(COALESCE(lra.interest_amount, 0)), 0)::NUMERIC AS reimbursement_interest,
      COALESCE(SUM(COALESCE(lra.principal_amount, 0)), 0)::NUMERIC AS reimbursement_principal
    FROM loan_repayments lr
    JOIN loan_repayment_allocations lra ON lra.repayment_id = lr.id
    JOIN loans l ON l.id = lra.loan_id
    WHERE lr.company_id = $1
      AND l.company_id = $1
      AND l.manager_user_id IS NOT NULL
      AND lr.payment_date BETWEEN $2::date AND $3::date
    GROUP BY l.manager_user_id
    `,
    [companyId, monthStartIso, monthEndIso],
  );
  for (const row of reimbursementRows.rows) {
    const target = ensureActor(row.actor_id);
    if (!target) continue;
    target.reimbursementCount = Number(row.reimbursement_count || 0);
    target.reimbursementInterest = round2(Number(row.reimbursement_interest || 0));
    target.reimbursementPrincipal = round2(Number(row.reimbursement_principal || 0));
  }

  const newClientRows = await query(
    `
    SELECT created_by_user_id AS actor_id, COUNT(*)::INT AS new_clients
    FROM clients
    WHERE company_id = $1
      AND created_by_user_id IS NOT NULL
      AND created_at::date BETWEEN $2::date AND $3::date
    GROUP BY created_by_user_id
    `,
    [companyId, monthStartIso, monthEndIso],
  );
  for (const row of newClientRows.rows) {
    const target = ensureActor(row.actor_id);
    if (!target) continue;
    target.newClients = Number(row.new_clients || 0);
  }

  const delinquencyRows = await query(
    `
    SELECT
      l.manager_user_id AS actor_id,
      COUNT(*) FILTER (
        WHERE li.status <> 'paid'
          AND li.due_date = $2::date
          AND GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
      )::INT AS mora_today_count,
      COALESCE(SUM(
        CASE
          WHEN li.status <> 'paid'
            AND li.due_date = $2::date
            AND GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
          THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
          ELSE 0
        END
      ), 0)::NUMERIC AS mora_today_capital,
      COUNT(*) FILTER (
        WHERE li.status <> 'paid'
          AND li.due_date < $2::date
          AND GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
      )::INT AS mora_total_count,
      COALESCE(SUM(
        CASE
          WHEN li.status <> 'paid'
            AND li.due_date < $2::date
            AND GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
          THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
          ELSE 0
        END
      ), 0)::NUMERIC AS mora_total_capital,
      COUNT(*) FILTER (
        WHERE li.status <> 'paid'
          AND li.due_date < ($2::date - INTERVAL '7 days')
          AND GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
      )::INT AS mora_over_7_count,
      COALESCE(SUM(
        CASE
          WHEN li.status <> 'paid'
            AND li.due_date < ($2::date - INTERVAL '7 days')
            AND GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
          THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
          ELSE 0
        END
      ), 0)::NUMERIC AS mora_over_7_capital,
      COUNT(*) FILTER (
        WHERE li.status <> 'paid'
          AND li.due_date < ($2::date - INTERVAL '15 days')
          AND GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
      )::INT AS mora_over_15_count,
      COALESCE(SUM(
        CASE
          WHEN li.status <> 'paid'
            AND li.due_date < ($2::date - INTERVAL '15 days')
            AND GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
          THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
          ELSE 0
        END
      ), 0)::NUMERIC AS mora_over_15_capital,
      COUNT(*) FILTER (
        WHERE li.status <> 'paid'
          AND li.due_date < ($2::date - INTERVAL '30 days')
          AND GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
      )::INT AS mora_over_30_count,
      COALESCE(SUM(
        CASE
          WHEN li.status <> 'paid'
            AND li.due_date < ($2::date - INTERVAL '30 days')
            AND GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
          THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
          ELSE 0
        END
      ), 0)::NUMERIC AS mora_over_30_capital
    FROM loans l
    JOIN loan_installments li ON li.loan_id = l.id
    WHERE l.company_id = $1
      AND l.manager_user_id IS NOT NULL
    GROUP BY l.manager_user_id
    `,
    [companyId, referenceDateIso],
  );
  for (const row of delinquencyRows.rows) {
    const target = ensureActor(row.actor_id);
    if (!target) continue;
    target.moraTodayCount = Number(row.mora_today_count || 0);
    target.moraTodayCapital = round2(Number(row.mora_today_capital || 0));
    target.moraTotalCount = Number(row.mora_total_count || 0);
    target.moraTotalCapital = round2(Number(row.mora_total_capital || 0));
    target.moraOver7Count = Number(row.mora_over_7_count || 0);
    target.moraOver7Capital = round2(Number(row.mora_over_7_capital || 0));
    target.moraOver15Count = Number(row.mora_over_15_count || 0);
    target.moraOver15Capital = round2(Number(row.mora_over_15_capital || 0));
    target.moraOver30Count = Number(row.mora_over_30_count || 0);
    target.moraOver30Capital = round2(Number(row.mora_over_30_capital || 0));
  }

  const rows = Array.from(actorMap.values())
    .map((row) => {
      const vigenteCapital = Number(row.vigenteCapital || 0);
      const moraTotalCapital = Number(row.moraTotalCapital || 0);
      return roundRowValues({
        ...row,
        moraRiskPercent: vigenteCapital > 0 ? (moraTotalCapital / vigenteCapital) * 100 : 0,
      });
    })
    .filter((row) =>
      Number(row.disbursementAmount || 0) > 0
      || Number(row.newClients || 0) > 0
      || Number(row.reimbursementCount || 0) > 0
      || Number(row.vigenteCount || 0) > 0
      || Number(row.moraTotalCount || 0) > 0
      || Number(row.moraTodayCount || 0) > 0,
    )
    .sort((a, b) => {
      if (Number(b.vigenteCapital || 0) !== Number(a.vigenteCapital || 0)) {
        return Number(b.vigenteCapital || 0) - Number(a.vigenteCapital || 0);
      }
      return String(a.actorName || "").localeCompare(String(b.actorName || ""), "pt");
    });

  return {
    rows,
    totals: buildMonthlyPerformanceTotals(rows),
  };
}

function filterMonthlyPerformanceSnapshot(snapshot, managerFilter) {
  const managerEnabled = String(managerFilter || "all").trim().toLowerCase() !== "all";
  if (!snapshot || typeof snapshot !== "object") {
    return { rows: [], totals: buildMonthlyPerformanceTotals([]) };
  }
  const rowsRaw = Array.isArray(snapshot.rows) ? snapshot.rows : [];
  const rows = rowsRaw
    .filter((row) => {
      if (!managerEnabled) return true;
      return String(row?.actorName || "").trim().toLowerCase() === String(managerFilter || "").trim().toLowerCase();
    })
    .map((row) => roundRowValues({
      actorId: Number(row?.actorId || 0) || null,
      actorName: String(row?.actorName || "Sem Nome"),
      actorRole: String(row?.actorRole || "manager") === "agent" ? "agent" : "manager",
      disbursementAmount: Number(row?.disbursementAmount || 0),
      newClients: Number(row?.newClients || 0),
      reimbursementCount: Number(row?.reimbursementCount || 0),
      vigenteCount: Number(row?.vigenteCount || 0),
      vigenteCapital: Number(row?.vigenteCapital || 0),
      reimbursementInterest: Number(row?.reimbursementInterest || 0),
      reimbursementPrincipal: Number(row?.reimbursementPrincipal || 0),
      moraTodayCount: Number(row?.moraTodayCount || 0),
      moraTodayCapital: Number(row?.moraTodayCapital || 0),
      moraTotalCount: Number(row?.moraTotalCount || 0),
      moraTotalCapital: Number(row?.moraTotalCapital || 0),
      moraRiskPercent: Number(row?.moraRiskPercent || 0),
      moraOver7Count: Number(row?.moraOver7Count || 0),
      moraOver7Capital: Number(row?.moraOver7Capital || 0),
      moraOver15Count: Number(row?.moraOver15Count || 0),
      moraOver15Capital: Number(row?.moraOver15Capital || 0),
      moraOver30Count: Number(row?.moraOver30Count || 0),
      moraOver30Capital: Number(row?.moraOver30Capital || 0),
    }));
  return { rows, totals: buildMonthlyPerformanceTotals(rows) };
}

function formatIsoDate(value) {
  return value.toISOString().slice(0, 10);
}

function addDays(value, daysToAdd) {
  const date = new Date(value.getTime());
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return date;
}

function addMonthsPreserveDay(value, monthsToAdd) {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  const target = new Date(Date.UTC(year, month + monthsToAdd, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function monthsBetweenInclusive(startDate, endDate) {
  if (endDate < startDate) return 0;
  let months = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + (endDate.getUTCMonth() - startDate.getUTCMonth());
  if (endDate.getUTCDate() < startDate.getUTCDate()) {
    months -= 1;
  }
  return Math.max(1, months + 1);
}

function daysBetween(startDate, endDate) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
}

function isBusinessDay(date) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function normalizePaymentDays(value) {
  const list = Array.isArray(value) ? value : [];
  const normalized = Array.from(
    new Set(
      list
        .map((item) => Number(item))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ).sort((a, b) => a - b);
  return normalized;
}

function generateDueDates(data, { disbursedDate, nextPaymentDate, maturityDate }) {
  if (data.paymentFrequency !== "diario") {
    const frequency = FREQUENCY_CONFIG[data.paymentFrequency];
    const rows = [];
    if (data.paymentFrequency === "mensal") {
      let current = new Date(nextPaymentDate.getTime());
      while (current <= maturityDate) {
        rows.push(new Date(current.getTime()));
        current = addMonthsPreserveDay(current, 1);
      }
      return rows;
    }

    if (!frequency?.intervalDays) return rows;
    let current = new Date(nextPaymentDate.getTime());
    while (current <= maturityDate) {
      rows.push(new Date(current.getTime()));
      current = addDays(current, frequency.intervalDays);
    }
    return rows;
  }

  const selectedDays = normalizePaymentDays(data.paymentDays);
  const allowedWeekdays = selectedDays.length > 0 ? selectedDays : [1, 2, 3, 4, 5];
  const rows = [];
  let current = new Date(addDays(disbursedDate, 1).getTime());
  if (nextPaymentDate > current) current = new Date(nextPaymentDate.getTime());
  while (current <= maturityDate) {
    const weekDay = current.getUTCDay();
    if (
      (selectedDays.length > 0 && allowedWeekdays.includes(weekDay)) ||
      (selectedDays.length === 0 && isBusinessDay(current))
    ) {
      rows.push(new Date(current.getTime()));
    }
    current = addDays(current, 1);
  }
  return rows;
}

function calculatePrice(principal, monthlyRate, installmentsCount) {
  if (monthlyRate >= 1) {
    return [];
  }

  // Interest is applied over each installment amount (prestacao), not over outstanding capital.
  const fixedPayment = monthlyRate === 0 ? principal / installmentsCount : (principal / installmentsCount) / (1 - monthlyRate);
  let balance = principal;
  return Array.from({ length: installmentsCount }).map((_, idx) => {
    const installmentNo = idx + 1;
    const provisionalPrincipal = fixedPayment * (1 - monthlyRate);
    const principalAmount = installmentNo === installmentsCount ? balance : provisionalPrincipal;
    const paymentAmount = monthlyRate === 0 ? principalAmount : principalAmount / (1 - monthlyRate);
    const interestAmount = paymentAmount - principalAmount;
    balance = Math.max(0, balance - principalAmount);
    return {
      installmentNo,
      paymentAmount: round2(paymentAmount),
      principalAmount: round2(principalAmount),
      interestAmount: round2(interestAmount),
      balanceAfter: round2(balance),
    };
  });
}

function calculateSac(principal, monthlyRate, installmentsCount) {
  const amortization = principal / installmentsCount;
  let balance = principal;
  return Array.from({ length: installmentsCount }).map((_, idx) => {
    const installmentNo = idx + 1;
    const interestAmount = balance * monthlyRate;
    const principalAmount = installmentNo === installmentsCount ? balance : amortization;
    const paymentAmount = principalAmount + interestAmount;
    balance = Math.max(0, balance - principalAmount);
    return {
      installmentNo,
      paymentAmount: round2(paymentAmount),
      principalAmount: round2(principalAmount),
      interestAmount: round2(interestAmount),
      balanceAfter: round2(balance),
    };
  });
}

function calculateAmericano(principal, monthlyRate, installmentsCount) {
  const interestOnlyPayment = principal * monthlyRate;
  return Array.from({ length: installmentsCount }).map((_, idx) => {
    const installmentNo = idx + 1;
    const isLast = installmentNo === installmentsCount;
    const principalAmount = isLast ? principal : 0;
    const paymentAmount = interestOnlyPayment + principalAmount;
    const balanceAfter = isLast ? 0 : principal;
    return {
      installmentNo,
      paymentAmount: round2(paymentAmount),
      principalAmount: round2(principalAmount),
      interestAmount: round2(interestOnlyPayment),
      balanceAfter: round2(balanceAfter),
    };
  });
}

function countContractMonths(disbursedDate, maturityDate) {
  if (maturityDate <= disbursedDate) return 1;
  let months =
    (maturityDate.getUTCFullYear() - disbursedDate.getUTCFullYear()) * 12 +
    (maturityDate.getUTCMonth() - disbursedDate.getUTCMonth());
  if (months <= 0) return 1;
  if (maturityDate.getUTCDate() > disbursedDate.getUTCDate()) months += 1;
  return Math.max(1, months);
}

function buildInstallments(data) {
  const nextPaymentDate = parseIsoDate(data.nextPayment);
  const maturityDate = parseIsoDate(data.maturity);
  const disbursedDate = parseIsoDate(data.disbursed);
  if (!nextPaymentDate || !maturityDate || !disbursedDate) {
    return { valid: false, message: "Datas invalidas para gerar cronograma." };
  }
  if (nextPaymentDate < disbursedDate) {
    return { valid: false, message: "A data do primeiro pagamento nao pode ser antes do desembolso." };
  }
  if (maturityDate < nextPaymentDate) {
    return { valid: false, message: "A data de vencimento final deve ser igual ou superior ao primeiro pagamento." };
  }

  const frequency = FREQUENCY_CONFIG[data.paymentFrequency];
  if (!frequency) {
    return { valid: false, message: "Frequencia de pagamento invalida." };
  }
  const contractMonths = countContractMonths(disbursedDate, maturityDate);

  const dueDates = generateDueDates(data, { disbursedDate, nextPaymentDate, maturityDate });
  let installmentsCount = dueDates.length;
  if (data.paymentFrequency === "mensal") {
    installmentsCount = Math.max(1, monthsBetweenInclusive(nextPaymentDate, maturityDate));
  } else if (data.paymentFrequency === "semanal") {
    // Business rule: weekly plans always use 4 installments per contract month.
    installmentsCount = Math.max(1, contractMonths * 4);
  } else if (data.paymentFrequency === "diario" && !data.paymentDays?.length) {
    // Business rule (default): daily plans use 21 business days per contract month.
    installmentsCount = Math.max(1, contractMonths * 21);
  }
  if (!Number.isInteger(installmentsCount) || installmentsCount <= 0 || installmentsCount > 2000) {
    return { valid: false, message: "Nao foi possivel calcular o numero de parcelas pelo periodo informado." };
  }

  const monthlyRate = data.rate / 100;
  if (monthlyRate >= 1 && contractMonths > 1) {
    return { valid: false, message: "Taxa mensal muito alta para o calculo da prestacao no periodo selecionado." };
  }

  // Regra de negocio: amortizacao pela Tabela Price (PMT = PV * i / (1 - (1+i)^-n)); frequencia reparte o total.
  const totalAmountRaw =
    monthlyRate === 0
      ? data.amount
      : ((data.amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -contractMonths))) * contractMonths;
  const totalAmount = round2(totalAmountRaw);
  const principalBase = round2(data.amount / installmentsCount);
  const paymentBase = round2(totalAmount / installmentsCount);

  let paidTotal = 0;
  let paidPrincipal = 0;
  const rows = Array.from({ length: installmentsCount }).map((_, idx) => {
    const installmentNo = idx + 1;
    const isLast = installmentNo === installmentsCount;
    const principalAmount = isLast ? round2(data.amount - paidPrincipal) : principalBase;
    const paymentAmount = isLast ? round2(totalAmount - paidTotal) : paymentBase;
    const interestAmount = round2(paymentAmount - principalAmount);
    paidPrincipal = round2(paidPrincipal + principalAmount);
    paidTotal = round2(paidTotal + paymentAmount);
    const balanceAfter = round2(Math.max(0, data.amount - paidPrincipal));
    return {
      installmentNo,
      dueDate: formatIsoDate(dueDates[idx] || addMonthsPreserveDay(nextPaymentDate, installmentNo - 1)),
      paymentAmount,
      principalAmount,
      interestAmount,
      balanceAfter,
    };
  });

  return { valid: true, rows };
}

async function replaceLoanInstallments(dbClient, loanId, installments) {
  await dbClient.query("DELETE FROM loan_installments WHERE loan_id = $1", [loanId]);
  for (const installment of installments) {
    await dbClient.query(
      `
      INSERT INTO loan_installments (
        loan_id, installment_no, due_date, payment_amount, principal_amount, interest_amount, balance_after, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      `,
      [
        loanId,
        installment.installmentNo,
        installment.dueDate,
        installment.paymentAmount,
        installment.principalAmount,
        installment.interestAmount,
        installment.balanceAfter,
      ],
    );
  }
}

async function insertLoanContractAudit(dbClient, { companyId, loanId, contractNo, action, actorUserId, actorName, payloadSnapshot }) {
  await dbClient.query(
    `
    INSERT INTO loan_contract_audit (
      company_id, loan_id, contract_no, action, changed_by_user_id, changed_by_name, payload_snapshot
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      companyId,
      loanId ?? null,
      contractNo,
      action,
      actorUserId || null,
      actorName || null,
      JSON.stringify(payloadSnapshot || {}),
    ],
  );
}

async function updateInstallmentStatusWithAudit({
  scope,
  loanId,
  installmentId,
  nextStatus,
  paidAt,
  actorUserId,
  actorName,
  action,
  onUpdated,
}) {
  return withTransaction(async (dbClient) => {
    const current = await dbClient.query(
      `
      SELECT li.id, li.status, li.payment_amount, li.principal_amount, li.interest_amount, l.contract_no
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      WHERE li.id = $1
        AND li.loan_id = $2
        AND l.company_id = $3
      FOR UPDATE
      `,
      [installmentId, loanId, scope.companyId],
    );
    if (!current.rows[0]) {
      return null;
    }

    const previousStatus = current.rows[0].status;
    const paymentAmount = Number(current.rows[0].payment_amount || 0);
    const principalAmount = Number(current.rows[0].principal_amount || 0);
    const interestAmount = Number(current.rows[0].interest_amount || 0);
    const contractNo = current.rows[0].contract_no;
    const updated = await dbClient.query(
      `
      UPDATE loan_installments li
      SET status = $1,
          principal_paid_amount = CASE
            WHEN $1 = 'paid' THEN li.principal_amount
            WHEN $6 = 'paid' AND $1 <> 'paid' THEN 0
            ELSE COALESCE(li.principal_paid_amount, 0)
          END,
          interest_paid_amount = CASE
            WHEN $1 = 'paid' THEN li.interest_amount
            WHEN $6 = 'paid' AND $1 <> 'paid' THEN 0
            ELSE COALESCE(li.interest_paid_amount, 0)
          END,
          mora_paid_amount = CASE
            WHEN $6 = 'paid' AND $1 <> 'paid' THEN 0
            ELSE COALESCE(li.mora_paid_amount, 0)
          END,
          paid_at = CASE
            WHEN $1 = 'paid' THEN COALESCE($2::timestamptz, NOW())
            ELSE NULL
          END
      FROM loans l
      WHERE li.id = $3
        AND li.loan_id = $4
        AND l.id = li.loan_id
        AND l.company_id = $5
      RETURNING li.id
      `,
      [nextStatus, paidAt, installmentId, loanId, scope.companyId, previousStatus],
    );
    if (!updated.rows[0]) {
      return null;
    }

    await dbClient.query(
      `
      INSERT INTO loan_installment_audit (
        company_id, loan_id, installment_id, previous_status, new_status, action, changed_by_user_id, changed_by_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [scope.companyId, loanId, installmentId, previousStatus, nextStatus, action, actorUserId || null, actorName || null],
    );

    const result = {
      id: updated.rows[0].id,
      previousStatus,
      nextStatus,
      paymentAmount,
      principalAmount,
      interestAmount,
      contractNo,
    };
    if (typeof onUpdated === "function") {
      await onUpdated({ dbClient, result });
    }
    return result;
  });
}

function validateLoanPayload(body, options = {}) {
  const defaultDailyPenaltyRate = Number.isFinite(Number(options?.defaultDailyPenaltyRate))
    ? Number(options.defaultDailyPenaltyRate)
    : DEFAULT_APPROVAL_POLICY.defaultDailyPenaltyRate;
  const maxLoanTermMonths = Number.isInteger(Number(options?.maxLoanTermMonths)) && Number(options.maxLoanTermMonths) > 0
    ? Number(options.maxLoanTermMonths)
    : null;
  const forcePriceMethod = Boolean(options?.forcePriceMethod);
  const contractNo = String(body?.contractNo || "").trim();
  const clientId = Number(body?.clientId);
  const managerUserId = Number(body?.managerUserId);
  const product = String(body?.product || "").trim();
  const amount = Number(body?.amount);
  const balance = Number(body?.balance);
  const rate = normalizeRatePercent(body?.rate);
  const administrativeFeeModeRaw = String(body?.administrativeFeeMode ?? body?.administrativeCostMode ?? "aplicar").trim().toLowerCase();
  const administrativeFeeMode = normalizeAdministrativeFeeMode(administrativeFeeModeRaw);
  const administrativeFeeAmount = calculateAdministrativeFeeAmount(amount, administrativeFeeMode);
  const disbursementNetAmount = calculateDisbursementNetAmount(amount, administrativeFeeAmount);
  const dailyPenaltyRate = defaultDailyPenaltyRate;
  const disbursed = String(body?.disbursed || "").trim();
  const maturity = String(body?.maturity || "").trim();
  const nextPayment = String(body?.nextPayment || "").trim();
  const daysOverdue = Number(body?.daysOverdue);
  const status = String(body?.status || "").trim();
  const amortizationMethod = String(body?.amortizationMethod || "price").trim().toLowerCase();
  const paymentFrequency = String(body?.paymentFrequency || "mensal").trim().toLowerCase();
  const paymentDays = normalizePaymentDays(body?.paymentDays);
  const applicantTypeRaw = String(body?.applicantType || body?.clientType || "singular").trim().toLowerCase();
  const applicantType = ["singular", "grupo", "empresa"].includes(applicantTypeRaw) ? applicantTypeRaw : "singular";
  const groupMemberClientIds = Array.isArray(body?.groupMemberClientIds)
    ? Array.from(
        new Set(
          body.groupMemberClientIds
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
        ),
      )
    : [];
  const requestedGroupMemberCount = Number(body?.groupMemberCount);
  const groupMemberCount = Number.isInteger(requestedGroupMemberCount) && requestedGroupMemberCount > 0
    ? requestedGroupMemberCount
    : groupMemberClientIds.length;
  const groupFinancingModeRaw = String(body?.groupFinancingMode || "total").trim().toLowerCase();
  const groupFinancingMode = ["total", "per_member"].includes(groupFinancingModeRaw) ? groupFinancingModeRaw : "total";
  const groupAllocations = Array.isArray(body?.groupAllocations)
    ? body.groupAllocations
      .map((item) => ({
        memberClientId: Number(item?.memberClientId) > 0 ? Number(item.memberClientId) : null,
        memberName: String(item?.memberName || "").trim(),
        amount: round2(Number(item?.amount || 0)),
      }))
      .filter((item) => (item.memberClientId || item.memberName) && item.amount > 0)
    : [];

  if (!product) {
    return { valid: false, message: "Produto e obrigatorio." };
  }
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { valid: false, message: "Cliente invalido." };
  }
  if (!Number.isInteger(managerUserId) || managerUserId <= 0) {
    return { valid: false, message: "Gestor da carteira e obrigatorio." };
  }
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(balance) || balance < 0) {
    return { valid: false, message: "Valores de montante/saldo invalidos." };
  }
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
    return { valid: false, message: "Taxa de juro invalida." };
  }
  if (!Number.isFinite(dailyPenaltyRate) || dailyPenaltyRate < 0 || dailyPenaltyRate > 100) {
    return { valid: false, message: "Taxa diaria de mora invalida." };
  }
  if (!disbursed || !maturity || !nextPayment) {
    return { valid: false, message: "Datas obrigatorias em falta." };
  }
  if (maxLoanTermMonths) {
    const disbursedDate = new Date(`${disbursed}T00:00:00Z`);
    const maturityDate = new Date(`${maturity}T00:00:00Z`);
    if (!Number.isNaN(disbursedDate.getTime()) && !Number.isNaN(maturityDate.getTime()) && maturityDate > disbursedDate) {
      const termDays = Math.ceil((maturityDate.getTime() - disbursedDate.getTime()) / 86400000);
      const termMonths = Math.ceil(termDays / 30.4375);
      if (termMonths > maxLoanTermMonths) {
        return {
          valid: false,
          message: `Prazo do credito excede o limite operacional de ${maxLoanTermMonths} meses.`,
        };
      }
    }
  }
  if (!Number.isInteger(daysOverdue) || daysOverdue < 0) {
    return { valid: false, message: "Dias de atraso invalido." };
  }
  if (!["active", "warning", "overdue"].includes(status)) {
    return { valid: false, message: "Status invalido." };
  }
  if (!AMORTIZATION_METHODS.includes(amortizationMethod)) {
    return { valid: false, message: "Metodo de amortizacao invalido." };
  }
  if (forcePriceMethod && amortizationMethod !== "price") {
    return { valid: false, message: "Metodo de amortizacao bloqueado. Apenas PRICE e permitido para o seu perfil." };
  }
  if (!PAYMENT_FREQUENCIES.includes(paymentFrequency)) {
    return { valid: false, message: "Frequencia de pagamento invalida." };
  }
  if (paymentFrequency === "diario" && paymentDays.length === 0) {
    return { valid: false, message: "Selecione ao menos um dia util para pagamentos diarios." };
  }
  if (applicantType === "grupo" && groupMemberCount < 2) {
    return { valid: false, message: "Para solicitacao em grupo informe ao menos 2 membros (selecionados ou quantidade)." };
  }
  if (applicantType === "grupo" && groupFinancingMode === "per_member" && groupAllocations.length === 0) {
    return { valid: false, message: "No modo por pessoa, informe os membros e os valores do grupo." };
  }
  if (applicantType === "grupo" && groupFinancingMode === "per_member") {
    const allocationsTotal = round2(groupAllocations.reduce((sum, item) => sum + item.amount, 0));
    if (allocationsTotal <= 0) {
      return { valid: false, message: "Total de alocacoes por membro deve ser maior que zero." };
    }
    if (Math.abs(allocationsTotal - amount) > 0.01) {
      return { valid: false, message: "No modo por pessoa, a soma dos valores por membro deve igualar o valor total do emprestimo." };
    }
  }

  return {
    valid: true,
    data: {
      contractNo,
      clientId,
      managerUserId,
      product,
      amount,
      balance,
      rate,
      administrativeFeeMode,
      administrativeFeeRate: ADMINISTRATIVE_FEE_RATE_PERCENT,
      administrativeFeeAmount,
      disbursementNetAmount,
      dailyPenaltyRate,
      disbursed,
      maturity,
      nextPayment,
      daysOverdue,
      status,
      amortizationMethod,
      paymentFrequency,
      paymentDays,
      applicantType,
      groupMemberClientIds,
      groupMemberCount,
      groupFinancingMode,
      groupAllocations,
    },
  };
}

function parsePositiveInt(value, fallback, { min = 1, max = 1000 } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function resolveManagerForCompany(companyId, managerUserId, dbClient = null) {
  const runner = dbClient?.query ? dbClient : { query };
  if (managerUserId && Number(managerUserId) > 0) {
    const result = await runner.query(
      `
      SELECT id, full_name
      FROM users
      WHERE id = $1
        AND company_id = $2
        AND is_active = true
      LIMIT 1
      `,
      [managerUserId, companyId],
    );
    if (result.rows[0]) return result.rows[0];
  }
  // Fallback to any active manager or admin in the company
  const fallback = await runner.query(
    `
    SELECT id, full_name
    FROM users
    WHERE company_id = $1
      AND is_active = true
    ORDER BY CASE WHEN LOWER(role) = 'manager' THEN 1 WHEN LOWER(role) = 'admin' THEN 2 ELSE 3 END, id ASC
    LIMIT 1
    `,
    [companyId],
  );
  return fallback.rows[0] || { id: 1, full_name: "Administrador Geral" };
}

function buildContractAuditFilterSql({ period, userFilter, actionFilter, searchTerm }) {
  const clauses = [];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (period === "today") clauses.push("a.changed_at >= CURRENT_DATE");
  if (period === "7d") clauses.push("a.changed_at >= NOW() - INTERVAL '7 days'");
  if (period === "30d") clauses.push("a.changed_at >= NOW() - INTERVAL '30 days'");
  if (period === "90d") clauses.push("a.changed_at >= NOW() - INTERVAL '90 days'");

  if (userFilter && userFilter !== "all") {
    const p = add(userFilter.toLowerCase());
    clauses.push(`LOWER(COALESCE(a.changed_by_name, u.full_name, 'sistema')) = ${p}`);
  }
  if (actionFilter && actionFilter !== "all") {
    const p = add(actionFilter);
    clauses.push(`a.action = ${p}`);
  }
  if (searchTerm) {
    const p = add(`%${searchTerm.toLowerCase()}%`);
    clauses.push(`(
      LOWER(a.contract_no) LIKE ${p}
      OR LOWER(a.action) LIKE ${p}
      OR LOWER(COALESCE(a.changed_by_name, u.full_name, 'sistema')) LIKE ${p}
    )`);
  }

  return {
    sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
    params,
  };
}

function buildInstallmentAuditFilterSql({ period, userFilter, actionFilter, searchTerm }) {
  const clauses = [];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (period === "today") clauses.push("a.changed_at >= CURRENT_DATE");
  if (period === "7d") clauses.push("a.changed_at >= NOW() - INTERVAL '7 days'");
  if (period === "30d") clauses.push("a.changed_at >= NOW() - INTERVAL '30 days'");
  if (period === "90d") clauses.push("a.changed_at >= NOW() - INTERVAL '90 days'");

  if (userFilter && userFilter !== "all") {
    const p = add(userFilter.toLowerCase());
    clauses.push(`LOWER(COALESCE(a.changed_by_name, u.full_name, 'sistema')) = ${p}`);
  }
  if (actionFilter && actionFilter !== "all") {
    const p = add(actionFilter);
    clauses.push(`a.action = ${p}`);
  }
  if (searchTerm) {
    const p = add(`%${searchTerm.toLowerCase()}%`);
    clauses.push(`(
      CAST(li.installment_no AS TEXT) LIKE ${p}
      OR LOWER(a.previous_status) LIKE ${p}
      OR LOWER(a.new_status) LIKE ${p}
      OR LOWER(a.action) LIKE ${p}
      OR LOWER(COALESCE(a.changed_by_name, u.full_name, 'sistema')) LIKE ${p}
    )`);
  }

  return {
    sql: clauses.length ? ` AND ${clauses.join(" AND ")}` : "",
    params,
  };
}

async function generateContractNo(companyId) {
  const year = new Date().getFullYear();
  const result = await query(
    `
    SELECT COALESCE(MAX(CAST(SPLIT_PART(contract_no, '-', 3) AS INTEGER)), 0) AS max_seq
    FROM loans
    WHERE contract_no LIKE $1 AND company_id = $2
    `,
    [`MC-${year}-%`, companyId],
  );
  const nextSeq = Number(result.rows[0]?.max_seq || 0) + 1;
  return `MC-${year}-${String(nextSeq).padStart(3, "0")}`;
}

async function generateRepaymentReceiptNo(dbClient, companyId, paymentDateIso) {
  const runner = dbClient?.query ? dbClient : { query };
  const parsed = parseIsoDate(paymentDateIso);
  const year = parsed ? parsed.getUTCFullYear() : new Date().getUTCFullYear();
  const prefix = `RC-${year}-`;
  const result = await runner.query(
    `
    SELECT COALESCE(MAX(CAST(SPLIT_PART(receipt_no, '-', 3) AS INTEGER)), 0) AS max_seq
    FROM loan_repayments
    WHERE company_id = $1
      AND receipt_no LIKE $2
    `,
    [companyId, `${prefix}%`],
  );
  const nextSeq = Number(result.rows[0]?.max_seq || 0) + 1;
  return `${prefix}${String(nextSeq).padStart(6, "0")}`;
}

async function getLoanByIdForCompany(loanId, companyId) {
  const result = await query(
    `
    SELECT
      id,
      contract_no,
      client_id,
      product,
      principal,
      balance,
      interest_rate,
      administrative_fee_mode,
      administrative_fee_rate,
      administrative_fee_amount,
      disbursement_net_amount,
      payment_frequency,
      daily_penalty_rate,
      mora_waived_total,
      disbursed_on,
      maturity_on,
      next_payment_on,
      days_overdue,
      status
    FROM loans
    WHERE id = $1 AND company_id = $2
    LIMIT 1
    `,
    [loanId, companyId],
  );
  return result.rows[0] || null;
}

function calculateInstallmentMora(paymentAmount, _dailyPenaltyRate, daysOverdue, options = {}) {
  return calculateFixedMoraAmount(paymentAmount, {
    ...options,
    daysOverdue,
  });
}

function clampMoney(value, max) {
  const n = round2(Number(value || 0));
  const upper = round2(Number(max || 0));
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(upper) || upper <= 0) return 0;
  return round2(Math.min(n, upper));
}

function computeInstallmentOutstandingState(row, referenceDate, policySettings = null) {
  const principalAmount = round2(Number(row?.principal_amount ?? row?.principalAmount ?? 0));
  const interestAmount = round2(Number(row?.interest_amount ?? row?.interestAmount ?? 0));
  const installmentAmount = round2(
    Number(
      row?.payment_amount
      ?? row?.paymentAmount
      ?? (principalAmount + interestAmount),
    ),
  );

  const principalPaidAmount = clampMoney(row?.principal_paid_amount ?? row?.principalPaidAmount ?? 0, principalAmount);
  const interestPaidAmount = clampMoney(row?.interest_paid_amount ?? row?.interestPaidAmount ?? 0, interestAmount);
  const basePaidAmount = round2(principalPaidAmount + interestPaidAmount);
  const baseRemainingAmount = round2(Math.max(0, installmentAmount - basePaidAmount));

  const dueDateRaw = row?.due_date ?? row?.dueDate ?? null;
  const dueDate = parseIsoDate(dueDateRaw);
  const disbursedDateRaw = row?.disbursed_on ?? row?.loan_disbursed_on ?? row?.disbursedOn ?? row?.disbursed ?? null;
  const disbursedDate = parseIsoDate(disbursedDateRaw);
  const refDate = referenceDate ? parseIsoDate(referenceDate) : parseIsoDate(new Date().toISOString().slice(0, 10));
  const daysOverdue = dueDate && refDate ? Math.max(0, daysBetween(dueDate, refDate)) : 0;
  const paymentFrequency = row?.payment_frequency ?? row?.paymentFrequency ?? "mensal";
  const moraPolicy = normalizeMoraPolicySettings(policySettings || {});
  const moraMode = moraPolicy.moraMode || "none";
  const moraEnabledForInstallment = moraMode !== "none" && isMoraEnabledForFrequency(paymentFrequency, moraPolicy);
  // Mora fixa de 2% sobre cada prestacao vencida ainda em aberto.
  const moraAccruedAmount = calculateInstallmentMora(
    baseRemainingAmount,
    Number(row?.daily_penalty_rate ?? row?.dailyPenaltyRate ?? 0),
    daysOverdue,
    {
      moraEnabled: moraEnabledForInstallment,
      moraMode,
      dueDate,
      referenceDate: refDate,
      disbursedDate,
    },
  );
  const moraPaidAmount = clampMoney(row?.mora_paid_amount ?? row?.moraPaidAmount ?? 0, moraAccruedAmount);
  const moraRemainingAmount = round2(Math.max(0, moraAccruedAmount - moraPaidAmount));

  const totalOutstandingAmount = round2(baseRemainingAmount + moraRemainingAmount);
  const computedStatus = totalOutstandingAmount <= 0.009
    ? "paid"
    : daysOverdue > 0
      ? "late"
      : "pending";

  return {
    principalAmount,
    interestAmount,
    installmentAmount,
    principalPaidAmount,
    interestPaidAmount,
    basePaidAmount,
    baseRemainingAmount,
    paymentFrequency: normalizePaymentFrequencyValue(paymentFrequency),
    moraMode,
    moraEnabledForInstallment,
    moraAccruedAmount,
    moraPaidAmount,
    moraRemainingAmount,
    totalOutstandingAmount,
    daysOverdue,
    computedStatus,
  };
}

async function insertLoanInstallmentAuditRow(dbClient, {
  scope,
  loanId,
  installmentId,
  previousStatus,
  nextStatus,
  action,
  actor,
}) {
  await dbClient.query(
    `
    INSERT INTO loan_installment_audit (
      company_id, loan_id, installment_id, previous_status, new_status, action, changed_by_user_id, changed_by_name
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [
      scope.companyId,
      loanId,
      installmentId,
      previousStatus || "pending",
      nextStatus || "pending",
      action,
      Number(actor?.userId) || null,
      actor?.name || null,
    ],
  );
}

async function applyMoraForgivenessToLoanInstallments(dbClient, {
  scope,
  loanId,
  amount,
  eventDateIso,
  policy,
  actor,
}) {
  let remaining = round2(Number(amount || 0));
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return { applied: 0, unapplied: 0 };
  }

  const rows = await dbClient.query(
    `
    SELECT
      li.id,
      li.installment_no,
      li.due_date,
      li.payment_amount,
      li.principal_amount,
      li.interest_amount,
      li.principal_paid_amount,
      li.interest_paid_amount,
      li.mora_paid_amount,
      li.status,
      l.daily_penalty_rate,
      l.payment_frequency,
      l.disbursed_on
    FROM loan_installments li
    JOIN loans l ON l.id = li.loan_id
    WHERE li.loan_id = $1
      AND l.company_id = $2
      AND li.status <> 'paid'
    ORDER BY li.due_date ASC, li.installment_no ASC, li.id ASC
    FOR UPDATE OF li
    `,
    [loanId, scope.companyId],
  );

  let applied = 0;
  const paidAtIso = `${eventDateIso}T00:00:00.000Z`;
  for (const row of rows.rows) {
    if (remaining <= 0.009) break;
    const state = computeInstallmentOutstandingState(row, eventDateIso, policy);
    const moraOutstanding = round2(Number(state.moraRemainingAmount || 0));
    if (moraOutstanding <= 0.009) continue;

    const appliedRow = clampMoney(remaining, moraOutstanding);
    if (appliedRow <= 0.009) continue;

    const nextMoraPaid = round2(Number(row.mora_paid_amount || 0) + appliedRow);
    const nextState = computeInstallmentOutstandingState(
      { ...row, mora_paid_amount: nextMoraPaid },
      eventDateIso,
      policy,
    );
    const nextStatus = nextState.computedStatus;

    await dbClient.query(
      `
      UPDATE loan_installments li
      SET mora_paid_amount = $1,
          status = $2,
          paid_at = CASE
            WHEN $2 = 'paid' THEN COALESCE(li.paid_at, $3::timestamptz, NOW())
            ELSE NULL
          END
      FROM loans l
      WHERE li.id = $4
        AND li.loan_id = $5
        AND l.id = li.loan_id
        AND l.company_id = $6
      `,
      [nextMoraPaid, nextStatus, paidAtIso, Number(row.id), loanId, scope.companyId],
    );

    await insertLoanInstallmentAuditRow(dbClient, {
      scope,
      loanId,
      installmentId: Number(row.id),
      previousStatus: row.status || state.computedStatus,
      nextStatus,
      action: "perdao_mora_event",
      actor,
    });

    remaining = round2(Math.max(0, remaining - appliedRow));
    applied = round2(applied + appliedRow);
  }

  await syncLoanDelinquencyState(dbClient, loanId, scope.companyId);
  return { applied, unapplied: remaining };
}

async function applyPrincipalReductionToLoanInstallments(dbClient, {
  scope,
  loanId,
  amount,
  eventDateIso,
  policy,
  actor,
  auditAction,
}) {
  let remaining = round2(Number(amount || 0));
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return { applied: 0, unapplied: 0 };
  }

  const rows = await dbClient.query(
    `
    SELECT
      li.id,
      li.installment_no,
      li.due_date,
      li.payment_amount,
      li.principal_amount,
      li.interest_amount,
      li.principal_paid_amount,
      li.interest_paid_amount,
      li.mora_paid_amount,
      li.status,
      l.daily_penalty_rate,
      l.payment_frequency,
      l.disbursed_on
    FROM loan_installments li
    JOIN loans l ON l.id = li.loan_id
    WHERE li.loan_id = $1
      AND l.company_id = $2
      AND li.status <> 'paid'
    ORDER BY li.due_date ASC, li.installment_no ASC, li.id ASC
    FOR UPDATE OF li
    `,
    [loanId, scope.companyId],
  );

  let applied = 0;
  const paidAtIso = `${eventDateIso}T00:00:00.000Z`;
  for (const row of rows.rows) {
    if (remaining <= 0.009) break;
    const state = computeInstallmentOutstandingState(row, eventDateIso, policy);
    const principalOutstanding = round2(Math.max(0, Number(state.principalAmount || 0) - Number(state.principalPaidAmount || 0)));
    if (principalOutstanding <= 0.009) continue;

    const appliedRow = clampMoney(remaining, principalOutstanding);
    if (appliedRow <= 0.009) continue;

    const nextPrincipalPaid = round2(Number(row.principal_paid_amount || 0) + appliedRow);
    const nextState = computeInstallmentOutstandingState(
      { ...row, principal_paid_amount: nextPrincipalPaid },
      eventDateIso,
      policy,
    );
    const nextStatus = nextState.computedStatus;

    await dbClient.query(
      `
      UPDATE loan_installments li
      SET principal_paid_amount = $1,
          status = $2,
          paid_at = CASE
            WHEN $2 = 'paid' THEN COALESCE(li.paid_at, $3::timestamptz, NOW())
            ELSE NULL
          END
      FROM loans l
      WHERE li.id = $4
        AND li.loan_id = $5
        AND l.id = li.loan_id
        AND l.company_id = $6
      `,
      [nextPrincipalPaid, nextStatus, paidAtIso, Number(row.id), loanId, scope.companyId],
    );

    await insertLoanInstallmentAuditRow(dbClient, {
      scope,
      loanId,
      installmentId: Number(row.id),
      previousStatus: row.status || state.computedStatus,
      nextStatus,
      action: auditAction || "ajuste_principal_event",
      actor,
    });

    remaining = round2(Math.max(0, remaining - appliedRow));
    applied = round2(applied + appliedRow);
  }

  await syncLoanDelinquencyState(dbClient, loanId, scope.companyId);
  return { applied, unapplied: remaining };
}

async function applyPrincipalReversalToLoanInstallments(dbClient, {
  scope,
  loanId,
  amount,
  eventDateIso,
  policy,
  actor,
  auditAction,
}) {
  let remaining = round2(Number(amount || 0));
  if (!Number.isFinite(remaining) || remaining <= 0) {
    return { applied: 0, unapplied: 0 };
  }

  const rows = await dbClient.query(
    `
    SELECT
      li.id,
      li.installment_no,
      li.due_date,
      li.payment_amount,
      li.principal_amount,
      li.interest_amount,
      li.principal_paid_amount,
      li.interest_paid_amount,
      li.mora_paid_amount,
      li.status,
      l.daily_penalty_rate,
      l.payment_frequency,
      l.disbursed_on
    FROM loan_installments li
    JOIN loans l ON l.id = li.loan_id
    WHERE li.loan_id = $1
      AND l.company_id = $2
      AND COALESCE(li.principal_paid_amount, 0) > 0
    ORDER BY li.due_date DESC, li.installment_no DESC, li.id DESC
    FOR UPDATE OF li
    `,
    [loanId, scope.companyId],
  );

  let applied = 0;
  const paidAtIso = `${eventDateIso}T00:00:00.000Z`;
  for (const row of rows.rows) {
    if (remaining <= 0.009) break;
    const state = computeInstallmentOutstandingState(row, eventDateIso, policy);
    const reversiblePrincipal = clampMoney(Number(row.principal_paid_amount || 0), Number(row.principal_amount || 0));
    if (reversiblePrincipal <= 0.009) continue;

    const appliedRow = clampMoney(remaining, reversiblePrincipal);
    if (appliedRow <= 0.009) continue;

    const nextPrincipalPaid = round2(Math.max(0, Number(row.principal_paid_amount || 0) - appliedRow));
    const nextState = computeInstallmentOutstandingState(
      { ...row, principal_paid_amount: nextPrincipalPaid },
      eventDateIso,
      policy,
    );
    const nextStatus = nextState.computedStatus;

    await dbClient.query(
      `
      UPDATE loan_installments li
      SET principal_paid_amount = $1,
          status = $2,
          paid_at = CASE
            WHEN $2 = 'paid' THEN COALESCE(li.paid_at, $3::timestamptz, NOW())
            ELSE NULL
          END
      FROM loans l
      WHERE li.id = $4
        AND li.loan_id = $5
        AND l.id = li.loan_id
        AND l.company_id = $6
      `,
      [nextPrincipalPaid, nextStatus, paidAtIso, Number(row.id), loanId, scope.companyId],
    );

    await insertLoanInstallmentAuditRow(dbClient, {
      scope,
      loanId,
      installmentId: Number(row.id),
      previousStatus: row.status || state.computedStatus,
      nextStatus,
      action: auditAction || "estorno_event",
      actor,
    });

    remaining = round2(Math.max(0, remaining - appliedRow));
    applied = round2(applied + appliedRow);
  }

  await syncLoanDelinquencyState(dbClient, loanId, scope.companyId);
  return { applied, unapplied: remaining };
}

async function settleLoanInstallmentsAsPaidByAbatimento(dbClient, {
  scope,
  loanId,
  eventDateIso,
  actor,
}) {
  const rows = await dbClient.query(
    `
    SELECT
      li.id,
      li.principal_amount,
      li.interest_amount,
      li.principal_paid_amount,
      li.interest_paid_amount,
      li.status
    FROM loan_installments li
    JOIN loans l ON l.id = li.loan_id
    WHERE li.loan_id = $1
      AND l.company_id = $2
      AND li.status <> 'paid'
    ORDER BY li.installment_no ASC, li.id ASC
    FOR UPDATE OF li
    `,
    [loanId, scope.companyId],
  );

  let forgivenPrincipal = 0;
  let forgivenInterest = 0;
  const paidAtIso = `${eventDateIso}T00:00:00.000Z`;
  for (const row of rows.rows) {
    const principalOutstanding = round2(Math.max(0, Number(row.principal_amount || 0) - Number(row.principal_paid_amount || 0)));
    const interestOutstanding = round2(Math.max(0, Number(row.interest_amount || 0) - Number(row.interest_paid_amount || 0)));
    forgivenPrincipal = round2(forgivenPrincipal + principalOutstanding);
    forgivenInterest = round2(forgivenInterest + interestOutstanding);

    await dbClient.query(
      `
      UPDATE loan_installments li
      SET principal_paid_amount = li.principal_amount,
          interest_paid_amount = li.interest_amount,
          mora_paid_amount = COALESCE(li.mora_paid_amount, 0),
          status = 'paid',
          paid_at = COALESCE(li.paid_at, $1::timestamptz, NOW())
      FROM loans l
      WHERE li.id = $2
        AND li.loan_id = $3
        AND l.id = li.loan_id
        AND l.company_id = $4
      `,
      [paidAtIso, Number(row.id), loanId, scope.companyId],
    );

    await insertLoanInstallmentAuditRow(dbClient, {
      scope,
      loanId,
      installmentId: Number(row.id),
      previousStatus: row.status || "pending",
      nextStatus: "paid",
      action: "abatimento_event",
      actor,
    });
  }

  await syncLoanDelinquencyState(dbClient, loanId, scope.companyId);
  return {
    forgivenPrincipal,
    forgivenInterest,
    forgivenTotal: round2(forgivenPrincipal + forgivenInterest),
  };
}

async function applyCapitalizacaoToLoanInstallments(dbClient, {
  scope,
  loanId,
  amount,
  eventDateIso,
  policy,
  actor,
}) {
  const normalizedAmount = round2(Number(amount || 0));
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return { applied: 0 };
  }

  const targetResult = await dbClient.query(
    `
    SELECT
      li.id,
      li.installment_no,
      li.due_date,
      li.payment_amount,
      li.principal_amount,
      li.interest_amount,
      li.principal_paid_amount,
      li.interest_paid_amount,
      li.mora_paid_amount,
      li.status,
      l.daily_penalty_rate,
      l.payment_frequency,
      l.disbursed_on
    FROM loan_installments li
    JOIN loans l ON l.id = li.loan_id
    WHERE li.loan_id = $1
      AND l.company_id = $2
    ORDER BY
      CASE WHEN li.status = 'paid' THEN 1 ELSE 0 END,
      li.installment_no DESC,
      li.id DESC
    LIMIT 1
    FOR UPDATE OF li
    `,
    [loanId, scope.companyId],
  );
  const row = targetResult.rows[0];
  if (!row) {
    return { applied: 0 };
  }

  const nextPrincipalAmount = round2(Number(row.principal_amount || 0) + normalizedAmount);
  const nextPaymentAmount = round2(Number(row.payment_amount || 0) + normalizedAmount);
  const nextState = computeInstallmentOutstandingState(
    {
      ...row,
      principal_amount: nextPrincipalAmount,
      payment_amount: nextPaymentAmount,
    },
    eventDateIso,
    policy,
  );
  const nextStatus = nextState.computedStatus;

  await dbClient.query(
    `
    UPDATE loan_installments li
    SET principal_amount = $1,
        payment_amount = $2,
        status = $3,
        paid_at = CASE WHEN $3 = 'paid' THEN li.paid_at ELSE NULL END
    FROM loans l
    WHERE li.id = $4
      AND li.loan_id = $5
      AND l.id = li.loan_id
      AND l.company_id = $6
    `,
    [nextPrincipalAmount, nextPaymentAmount, nextStatus, Number(row.id), loanId, scope.companyId],
  );

  await insertLoanInstallmentAuditRow(dbClient, {
    scope,
    loanId,
    installmentId: Number(row.id),
    previousStatus: row.status || "pending",
    nextStatus,
    action: "capitalizacao_event",
    actor,
  });

  await syncLoanDelinquencyState(dbClient, loanId, scope.companyId);
  return { applied: normalizedAmount };
}

const GROUP_PAYMENT_MODE_NOTE_PREFIX = "[gpm:";

function encodeGroupPaymentModeNote(note, groupPaymentMode) {
  const cleanNote = String(note || "").trim();
  if (!groupPaymentMode || !["general", "individual"].includes(groupPaymentMode)) return cleanNote;
  const withoutMeta = cleanNote.replace(/^\[gpm:(general|individual)\]\s*/i, "").trim();
  const meta = `${GROUP_PAYMENT_MODE_NOTE_PREFIX}${groupPaymentMode}]`;
  return withoutMeta ? `${meta} ${withoutMeta}` : meta;
}

function decodeGroupPaymentModeNote(note) {
  const raw = String(note || "");
  const match = raw.match(/^\[gpm:(general|individual)\]\s*/i);
  if (!match) return { groupPaymentMode: "unknown", note: raw.trim() };
  return {
    groupPaymentMode: String(match[1] || "").toLowerCase(),
    note: raw.slice(match[0].length).trim(),
  };
}

function calculateDisplayBreakdown({
  amountReceived,
  moraApplied,
  principalApplied,
  interestApplied,
  allocationMode,
  loanPrincipal,
  loanInterestRate,
  loanDisbursedOn,
  loanMaturityOn,
}) {
  const paid = round2(Number(amountReceived || 0));
  const mora = round2(Math.max(0, Number(moraApplied || 0)));
  const baseWithoutMora = round2(Math.max(0, paid - mora));

  // Contract-mode display: use contract ratio for capital/interest so the result is business-readable.
  if (
    allocationMode === "loan"
    && Number.isFinite(Number(loanPrincipal))
    && Number(loanPrincipal) > 0
    && Number.isFinite(Number(loanInterestRate))
    && Number(loanInterestRate) >= 0
  ) {
    const principal = Number(loanPrincipal);
    const monthlyRate = Number(loanInterestRate) / 100;
    const disbursedDate = parseIsoDate(loanDisbursedOn);
    const maturityDate = parseIsoDate(loanMaturityOn);
    const contractMonths = disbursedDate && maturityDate ? countContractMonths(disbursedDate, maturityDate) : 1;
    const totalContract = contractMonths <= 1
      ? principal * (1 + monthlyRate)
      : monthlyRate === 0
        ? principal
        : ((principal / contractMonths) / (1 - monthlyRate)) * contractMonths;
    if (Number.isFinite(totalContract) && totalContract > 0) {
      const interestRatio = Math.max(0, Math.min(1, (totalContract - principal) / totalContract));
      const interest = round2(baseWithoutMora * interestRatio);
      const capital = round2(baseWithoutMora - interest);
      return {
        capital,
        interest,
        mora,
        total: round2(capital + interest + mora),
      };
    }
  }

  const fallbackCapital = round2(Math.max(0, Number(principalApplied || 0)));
  const fallbackInterest = round2(Math.max(0, Number(interestApplied || 0)));
  return {
    capital: fallbackCapital,
    interest: fallbackInterest,
    mora,
    total: round2(fallbackCapital + fallbackInterest + mora),
  };
}

async function applyRepaymentAllocation(dbClient, {
  scope,
  clientId,
  loanId,
  targetInstallmentId = null,
  amount,
  paymentDate,
  allocationMode,
  note,
  actor,
}) {
  const amountReceived = round2(Number(amount || 0));
  if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
    return { error: { status: 400, message: "Valor de pagamento invalido." } };
  }
  const installmentId =
    targetInstallmentId === null || targetInstallmentId === undefined || String(targetInstallmentId).trim() === ""
      ? null
      : Number(targetInstallmentId);
  if (installmentId !== null && (!Number.isInteger(installmentId) || installmentId <= 0)) {
    return { error: { status: 400, message: "Prestacao/parcela invalida para pagamento." } };
  }
  if (installmentId !== null && !loanId) {
    return { error: { status: 400, message: "Selecione um contrato para pagar uma prestacao especifica." } };
  }

  const paymentDateParsed = parseIsoDate(paymentDate);
  if (!paymentDateParsed) {
    return { error: { status: 400, message: "Data de pagamento invalida." } };
  }
  const paymentDateIso = formatIsoDate(paymentDateParsed);
  const policy = await getApprovalPolicy(scope.companyId);

  const clientExists = await dbClient.query(
    "SELECT id FROM clients WHERE id = $1 AND company_id = $2 LIMIT 1",
    [clientId, scope.companyId],
  );
  if (!clientExists.rows[0]) {
    return { error: { status: 404, message: "Cliente nao encontrado para a empresa selecionada." } };
  }

  const loanWhere = loanId ? "AND l.id = $3" : "";
  const loanParams = loanId ? [scope.companyId, clientId, loanId] : [scope.companyId, clientId];
  const loansResult = await dbClient.query(
    `
    SELECT
      l.id,
      l.contract_no,
      l.daily_penalty_rate,
      l.disbursement_status,
      COALESCE(li_base.base_outstanding, 0)::NUMERIC AS base_outstanding
    FROM loans l
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(GREATEST(
          0,
          (li.principal_amount + li.interest_amount)
          - COALESCE(li.principal_paid_amount, 0)
          - COALESCE(li.interest_paid_amount, 0)
        )), 0)::NUMERIC AS base_outstanding
      FROM loan_installments li
      WHERE li.loan_id = l.id
    ) li_base ON TRUE
    WHERE l.company_id = $1
      AND l.client_id = $2
      AND COALESCE(li_base.base_outstanding, 0) > 0.009
      AND l.disbursement_status = 'disbursed'
      ${loanWhere}
    ORDER BY
      CASE WHEN l.status = 'overdue' THEN 0 WHEN l.status = 'warning' THEN 1 ELSE 2 END,
      l.disbursed_on ASC,
      l.id ASC
    `,
    loanParams,
  );
  if (!loansResult.rows.length) {
    return { error: { status: 409, message: "Nao existem creditos desembolsados com saldo pendente para este cliente." } };
  }

  const loanIds = loansResult.rows.map((row) => Number(row.id));
  const installmentsWhereInstallment = installmentId ? "AND li.id = $3" : "";
  const installmentsParams = installmentId ? [scope.companyId, loanIds, installmentId] : [scope.companyId, loanIds];
  const installmentsResult = await dbClient.query(
    `
    SELECT
      li.id,
      li.loan_id,
      li.installment_no,
      li.due_date,
      li.payment_amount,
      li.principal_amount,
      li.interest_amount,
      li.principal_paid_amount,
      li.interest_paid_amount,
      li.mora_paid_amount,
      li.status,
      l.contract_no,
      l.daily_penalty_rate,
      l.payment_frequency,
      l.disbursed_on
    FROM loan_installments li
    JOIN loans l ON l.id = li.loan_id
    WHERE l.company_id = $1
      AND li.loan_id = ANY($2::int[])
      ${installmentsWhereInstallment}
      AND li.status <> 'paid'
    ORDER BY li.due_date ASC, li.installment_no ASC, li.id ASC
    FOR UPDATE OF li
    `,
    installmentsParams,
  );
  if (!installmentsResult.rows.length) {
    return {
      error: {
        status: 409,
        message: installmentId
          ? "A prestacao selecionada ja foi paga, nao pertence ao contrato ou nao esta disponivel."
          : "Nao existem parcelas pendentes para os creditos selecionados.",
      },
    };
  }

  const loansOrder = new Map(loanIds.map((id, idx) => [id, idx]));
  const installments = installmentsResult.rows
    .map((row) => {
      const state = computeInstallmentOutstandingState(
        {
          ...row,
          daily_penalty_rate: row.daily_penalty_rate,
          payment_frequency: row.payment_frequency,
        },
        paymentDateIso,
        policy,
      );
      return {
        installmentId: Number(row.id),
        loanId: Number(row.loan_id),
        contractNo: row.contract_no,
        installmentNo: Number(row.installment_no),
        dueDate: row.due_date,
        daysOverdue: state.daysOverdue,
        installmentAmount: state.installmentAmount,
        principalAmount: state.principalAmount,
        interestAmount: state.interestAmount,
        principalPaidAmount: state.principalPaidAmount,
        interestPaidAmount: state.interestPaidAmount,
        moraPaidAmount: state.moraPaidAmount,
        moraAccruedAmount: state.moraAccruedAmount,
        moraAmount: state.moraRemainingAmount,
        totalDue: state.totalOutstandingAmount,
        computedStatus: state.computedStatus,
        dbStatus: row.status || state.computedStatus,
        paymentFrequency: state.paymentFrequency,
        moraMode: state.moraMode,
        moraEnabledForInstallment: Boolean(state.moraEnabledForInstallment),
        dailyPenaltyRate: Number(row.daily_penalty_rate || 0),
        loanDisbursedOn: row.disbursed_on || null,
      };
    })
    .sort((a, b) => {
      if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue;
      const aOrder = loansOrder.get(a.loanId) ?? 0;
      const bOrder = loansOrder.get(b.loanId) ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      return a.installmentNo - b.installmentNo;
    });

  let remaining = amountReceived;
  const appliedRows = [];
  const loanPrincipalApplied = new Map();
  let principalApplied = 0;
  let interestApplied = 0;
  let moraApplied = 0;
  let amountApplied = 0;

  for (const row of installments) {
    if (remaining <= 0.009) break;
    if (row.totalDue <= 0.009) continue;

    const principalOutstanding = round2(Math.max(0, row.principalAmount - row.principalPaidAmount));
    const interestOutstanding = round2(Math.max(0, row.interestAmount - row.interestPaidAmount));
    let localRemaining = remaining;
    const principalAppliedRow = clampMoney(localRemaining, principalOutstanding);
    localRemaining = round2(localRemaining - principalAppliedRow);
    const interestAppliedRow = clampMoney(localRemaining, interestOutstanding);
    localRemaining = round2(localRemaining - interestAppliedRow);

    const baseAppliedRow = round2(principalAppliedRow + interestAppliedRow);
    const nextPrincipalPaidAmount = round2(row.principalPaidAmount + principalAppliedRow);
    const nextInterestPaidAmount = round2(row.interestPaidAmount + interestAppliedRow);
    const nextPrincipalOutstanding = round2(Math.max(0, row.principalAmount - nextPrincipalPaidAmount));
    const nextInterestOutstanding = round2(Math.max(0, row.interestAmount - nextInterestPaidAmount));
    const nextBaseOutstanding = round2(nextPrincipalOutstanding + nextInterestOutstanding);
    const recalculatedMoraAccrued = calculateInstallmentMora(
      nextBaseOutstanding,
      row.dailyPenaltyRate,
      row.daysOverdue,
      {
        moraEnabled: row.moraEnabledForInstallment,
        moraMode: row.moraMode,
        dueDate: row.dueDate,
        referenceDate: paymentDateIso,
        disbursedDate: row.loanDisbursedOn,
      },
    );
    const moraOutstanding = round2(Math.max(0, recalculatedMoraAccrued - row.moraPaidAmount));
    const moraAppliedRow = clampMoney(localRemaining, moraOutstanding);
    localRemaining = round2(localRemaining - moraAppliedRow);
    const nextMoraPaidAmount = round2(row.moraPaidAmount + moraAppliedRow);
    const nextMoraOutstanding = round2(Math.max(0, recalculatedMoraAccrued - nextMoraPaidAmount));
    const totalAppliedRow = round2(baseAppliedRow + moraAppliedRow);
    if (totalAppliedRow <= 0.009) continue;

    remaining = round2(Math.max(0, localRemaining));

    const nextTotalOutstanding = round2(nextBaseOutstanding + nextMoraOutstanding);
    const nextStatus = nextTotalOutstanding <= 0.009
      ? "paid"
      : row.daysOverdue > 0
        ? "late"
        : "pending";
    const paidAtIso = nextStatus === "paid" ? `${paymentDateIso}T00:00:00.000Z` : null;

    const updated = await dbClient.query(
      `
      UPDATE loan_installments li
      SET principal_paid_amount = $1,
          interest_paid_amount = $2,
          mora_paid_amount = $3,
          status = $4,
          paid_at = CASE
            WHEN $4 = 'paid' THEN COALESCE(li.paid_at, $5::timestamptz, NOW())
            ELSE NULL
          END
      FROM loans l
      WHERE li.id = $6
        AND li.loan_id = $7
        AND l.id = li.loan_id
        AND l.company_id = $8
      RETURNING li.id
      `,
      [
        nextPrincipalPaidAmount,
        nextInterestPaidAmount,
        nextMoraPaidAmount,
        nextStatus,
        paidAtIso,
        row.installmentId,
        row.loanId,
        scope.companyId,
      ],
    );
    if (!updated.rows[0]) {
      return { error: { status: 409, message: "Conflito ao atualizar parcela durante aplicacao do pagamento." } };
    }

    await dbClient.query(
      `
      INSERT INTO loan_installment_audit (
        company_id, loan_id, installment_id, previous_status, new_status, action, changed_by_user_id, changed_by_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        scope.companyId,
        row.loanId,
        row.installmentId,
        row.dbStatus || row.computedStatus || "pending",
        nextStatus,
        nextStatus === "paid" ? "mark_paid" : "partial_payment_apply",
        actor.userId || null,
        actor.name || null,
      ],
    );

    principalApplied = round2(principalApplied + principalAppliedRow);
    interestApplied = round2(interestApplied + interestAppliedRow);
    moraApplied = round2(moraApplied + moraAppliedRow);
    amountApplied = round2(amountApplied + totalAppliedRow);
    loanPrincipalApplied.set(row.loanId, round2((loanPrincipalApplied.get(row.loanId) || 0) + principalAppliedRow));

    appliedRows.push({
      ...row,
      principalAmount: principalAppliedRow,
      interestAmount: interestAppliedRow,
      installmentAmount: baseAppliedRow,
      moraAmount: moraAppliedRow,
      totalDue: totalAppliedRow,
    });
  }

  if (!appliedRows.length) {
    return {
      error: {
        status: 409,
        message: "Pagamento nao pode ser aplicado porque nao existe saldo pendente para os contratos/parcelas selecionados.",
      },
    };
  }

  for (const [affectedLoanId, principalValue] of loanPrincipalApplied.entries()) {
    await dbClient.query(
      `
      UPDATE loans
      SET balance = GREATEST(0, balance - $1)
      WHERE id = $2 AND company_id = $3
      `,
      [principalValue, affectedLoanId, scope.companyId],
    );
    await syncLoanDelinquencyState(dbClient, affectedLoanId, scope.companyId);
  }

  const repaymentInserted = await dbClient.query(
    `
    INSERT INTO loan_repayments (
      company_id, client_id, loan_id, receipt_no, payment_date, amount_received, amount_applied,
      principal_applied, interest_applied, mora_applied, unapplied_amount, allocation_mode, note, created_by_user_id, created_by_name
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING id, receipt_no
    `,
    [
      scope.companyId,
      clientId,
      loanId || null,
      await generateRepaymentReceiptNo(dbClient, scope.companyId, paymentDateIso),
      paymentDateIso,
      amountReceived,
      amountApplied,
      principalApplied,
      interestApplied,
      moraApplied,
      round2(amountReceived - amountApplied),
      allocationMode,
      note || null,
      actor.userId || null,
      actor.name || null,
    ],
  );
  const repaymentId = Number(repaymentInserted.rows[0].id);
  const receiptNo = repaymentInserted.rows[0].receipt_no || null;

  for (const row of appliedRows) {
    await dbClient.query(
      `
      INSERT INTO loan_repayment_allocations (
        repayment_id, loan_id, installment_id, installment_no, due_date, days_overdue,
        principal_amount, interest_amount, installment_amount, mora_amount, total_applied
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [
        repaymentId,
        row.loanId,
        row.installmentId,
        row.installmentNo,
        row.dueDate,
        row.daysOverdue,
        row.principalAmount,
        row.interestAmount,
        row.installmentAmount,
        row.moraAmount,
        row.totalDue,
      ],
    );
  }

  const credit1210 = round2(principalApplied + interestApplied);
  const credit4110 = moraApplied;
  await postDoubleEntry(dbClient, {
    companyId: scope.companyId,
    entryDate: paymentDateIso,
    eventType: "pagamento",
    description: `Reembolso aplicado ao cliente ${clientId}`,
    referenceType: "loan_repayment",
    referenceId: repaymentId,
    loanId: loanId || null,
    actorUserId: actor.userId,
    actorName: actor.name,
    lines: [
      { accountCode: "1110", debit: amountApplied, credit: 0, memo: "Entrada de caixa por reembolso" },
      { accountCode: "1210", debit: 0, credit: credit1210, memo: "Reducao da carteira de credito" },
      ...(credit4110 > 0 ? [{ accountCode: "4110", debit: 0, credit: credit4110, memo: "Receita de mora recebida" }] : []),
    ],
  });

  return {
    repaymentId,
    receiptNo,
    paymentDate: paymentDateIso,
    amountReceived,
    amountApplied,
    unappliedAmount: round2(amountReceived - amountApplied),
    principalApplied,
    interestApplied,
    moraApplied,
    allocations: appliedRows.map((row) => ({
      loanId: row.loanId,
      contractNo: row.contractNo,
      installmentId: row.installmentId,
      installmentNo: row.installmentNo,
      dueDate: row.dueDate,
      daysOverdue: row.daysOverdue,
      installmentAmount: row.installmentAmount,
      moraAmount: row.moraAmount,
      totalApplied: row.totalDue,
    })),
  };
}

function getRoleApprovalStage(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "operator") return "analyst";
  if (normalized === "manager") return "manager";
  if (normalized === "admin") return "final";
  return null;
}

function normalizeApprovalPolicy(row) {
  const moraPolicy = normalizeMoraPolicySettings(row || {});
  return {
    analystLimit: Number(row?.analyst_limit ?? DEFAULT_APPROVAL_POLICY.analystLimit),
    managerLimit: Number(row?.manager_limit ?? DEFAULT_APPROVAL_POLICY.managerLimit),
    finalLimit: Number(row?.final_limit ?? DEFAULT_APPROVAL_POLICY.finalLimit),
    minScore: Number(row?.min_score ?? DEFAULT_APPROVAL_POLICY.minScore),
    maxDebt: Number(row?.max_debt ?? DEFAULT_APPROVAL_POLICY.maxDebt),
    defaultDailyPenaltyRate: Number(row?.default_daily_penalty_rate ?? DEFAULT_APPROVAL_POLICY.defaultDailyPenaltyRate),
    defaultAdministrativeFeeRate: Number(row?.default_administrative_fee_rate ?? DEFAULT_APPROVAL_POLICY.defaultAdministrativeFeeRate),
    defaultInterestRate: Number(row?.default_interest_rate ?? DEFAULT_APPROVAL_POLICY.defaultInterestRate),
    maxLoanTermMonths: Number(row?.max_loan_term_months ?? DEFAULT_APPROVAL_POLICY.maxLoanTermMonths),
    moraMonthlyEnabled: moraPolicy.moraMonthlyEnabled,
    moraWeeklyEnabled: moraPolicy.moraWeeklyEnabled,
    moraDailyEnabled: moraPolicy.moraDailyEnabled,
    blockAlertStatus: Boolean(row?.block_alert_status ?? DEFAULT_APPROVAL_POLICY.blockAlertStatus),
  };
}

async function getApprovalPolicy(companyId) {
  const policyResult = await query(
    `
    SELECT
      analyst_limit,
      manager_limit,
      final_limit,
      min_score,
      max_debt,
      default_daily_penalty_rate,
      default_administrative_fee_rate,
      default_interest_rate,
      max_loan_term_months,
      mora_monthly_enabled,
      mora_weekly_enabled,
      mora_daily_enabled,
      block_alert_status
    FROM loan_approval_policies
    WHERE company_id = $1
    LIMIT 1
    `,
    [companyId],
  );
  return normalizeApprovalPolicy(policyResult.rows[0] || null);
}

function resolveRiskEvaluation({ client, policy }) {
  const status = String(client?.status || "").trim().toLowerCase();
  const score = Number(client?.score || 0);
  const debt = Number(client?.debt || 0);
  const reasons = [];

  if (policy.blockAlertStatus && status === "alert") reasons.push("Cliente em estado de alerta.");
  if (score < policy.minScore) reasons.push(`Score abaixo do minimo (${policy.minScore}).`);
  if (debt >= policy.maxDebt) reasons.push(`Divida atual acima do limite (${policy.maxDebt}).`);

  const blocked = reasons.length > 0;
  const riskLevel = blocked ? "risk" : status === "warning" ? "attention" : "clear";
  return { blocked, riskLevel, reasons };
}

async function createLoanDocuments(dbClient, { companyId, loanId, contractNo, actorUserId, actorName, payloadSnapshot }) {
  const year = new Date().getFullYear();
  const suffixMap = {
    contrato: "CTR",
    confissao_divida: "CD",
    declaracao: "DEC",
    desconto_salarial: "DS",
    termo_compromisso: "TC",
    termo_entrega: "TE",
  };
  for (const docType of LOAN_DOC_TYPES) {
    const suffix = suffixMap[docType] || "DOC";
    const docNo = `${suffix}-${year}-${contractNo}`;
    await dbClient.query(
      `
      INSERT INTO loan_documents (
        company_id, loan_id, doc_type, doc_no, payload_snapshot, generated_by_user_id, generated_by_name
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
      ON CONFLICT (loan_id, doc_type) DO NOTHING
      `,
      [companyId, loanId, docType, docNo, JSON.stringify(payloadSnapshot || {}), actorUserId || null, actorName || null],
    );
  }
}

async function createLoanFromPayload(dbClient, { scope, payload, actor, disbursementStatus = "disbursed" }) {
  const contractNo =
    payload.contractNo && !String(payload.contractNo).startsWith("REQ-")
      ? payload.contractNo
      : await generateContractNo(scope.companyId);
  const installments = buildInstallments(payload);
  if (!installments.valid) {
    return { error: { status: 400, message: installments.message } };
  }
  const isPendingDisbursement = disbursementStatus === "pending";
  const administrativeFeeMode = normalizeAdministrativeFeeMode(payload?.administrativeFeeMode);
  const administrativeFeeRate = Number.isFinite(Number(payload?.administrativeFeeRate))
    ? round2(Number(payload.administrativeFeeRate))
    : ADMINISTRATIVE_FEE_RATE_PERCENT;
  const administrativeFeeAmount = Number.isFinite(Number(payload?.administrativeFeeAmount))
    ? round2(Number(payload.administrativeFeeAmount))
    : calculateAdministrativeFeeAmount(payload?.amount, administrativeFeeMode);
  const disbursementNetAmount = Number.isFinite(Number(payload?.disbursementNetAmount))
    ? round2(Number(payload.disbursementNetAmount))
    : calculateDisbursementNetAmount(payload?.amount, administrativeFeeAmount);

  const loanInserted = await dbClient.query(
    `
    INSERT INTO loans (
      contract_no, company_id, client_id, manager_user_id, product, principal, balance, interest_rate,
      administrative_fee_mode, administrative_fee_rate, administrative_fee_amount, disbursement_net_amount,
      daily_penalty_rate, amortization_method, payment_frequency,
      disbursement_status, disbursed_at, disbursed_on, maturity_on, next_payment_on, days_overdue, status, carteira_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
      (SELECT c.carteira_id FROM clients c WHERE c.id = $3 AND c.company_id = $2 AND c.carteira_id IS NOT NULL LIMIT 1)
    )
    RETURNING id, contract_no
    `,
    [
      contractNo,
      scope.companyId,
      payload.clientId,
      payload.managerUserId,
      payload.product,
      payload.amount,
      payload.balance,
      payload.rate,
      administrativeFeeMode,
      administrativeFeeRate,
      administrativeFeeAmount,
      disbursementNetAmount,
      payload.dailyPenaltyRate,
      payload.amortizationMethod,
      payload.paymentFrequency,
      isPendingDisbursement ? "pending" : "disbursed",
      isPendingDisbursement ? null : new Date().toISOString(),
      payload.disbursed,
      payload.maturity,
      payload.nextPayment,
      payload.daysOverdue,
      payload.status,
    ],
  );

  const loanId = Number(loanInserted.rows[0].id);
  await replaceLoanInstallments(dbClient, loanId, installments.rows);
  await syncLoanDelinquencyState(dbClient, loanId, scope.companyId);
  await insertLoanContractAudit(dbClient, {
    companyId: scope.companyId,
    loanId,
    contractNo: loanInserted.rows[0].contract_no,
    action: "create",
    actorUserId: actor.userId,
    actorName: actor.name,
    payloadSnapshot: {
      clientId: payload.clientId,
      applicantType: payload.applicantType || "singular",
      groupMemberCount: Number(payload.groupMemberCount || 0),
      groupMemberClientIds: Array.isArray(payload.groupMemberClientIds) ? payload.groupMemberClientIds : [],
      groupFinancingMode: payload.groupFinancingMode || "total",
      groupAllocations: Array.isArray(payload.groupAllocations) ? payload.groupAllocations : [],
      managerUserId: payload.managerUserId,
      product: payload.product,
      amount: payload.amount,
      balance: payload.balance,
      rate: payload.rate,
      administrativeFeeMode,
      administrativeFeeRate,
      administrativeFeeAmount,
      disbursementNetAmount,
      dailyPenaltyRate: payload.dailyPenaltyRate,
      amortizationMethod: payload.amortizationMethod,
      paymentFrequency: payload.paymentFrequency,
      disbursed: payload.disbursed,
      maturity: payload.maturity,
      nextPayment: payload.nextPayment,
      status: payload.status,
    },
  });
  await createLoanDocuments(dbClient, {
    companyId: scope.companyId,
    loanId,
    contractNo: loanInserted.rows[0].contract_no,
    actorUserId: actor.userId,
    actorName: actor.name,
    payloadSnapshot: {
      clientId: payload.clientId,
      applicantType: payload.applicantType || "singular",
      groupMemberCount: Number(payload.groupMemberCount || 0),
      groupMemberClientIds: Array.isArray(payload.groupMemberClientIds) ? payload.groupMemberClientIds : [],
      groupFinancingMode: payload.groupFinancingMode || "total",
      groupAllocations: Array.isArray(payload.groupAllocations) ? payload.groupAllocations : [],
      managerUserId: payload.managerUserId,
      amount: payload.amount,
      balance: payload.balance,
      rate: payload.rate,
      administrativeFeeMode,
      administrativeFeeRate,
      administrativeFeeAmount,
      disbursementNetAmount,
      disbursed: payload.disbursed,
      maturity: payload.maturity,
      nextPayment: payload.nextPayment,
      product: payload.product,
      paymentFrequency: payload.paymentFrequency,
      groupFinancingMode: payload.groupFinancingMode || "total",
      groupAllocations: Array.isArray(payload.groupAllocations) ? payload.groupAllocations : [],
    },
  });

  if ((payload.applicantType || "singular") === "grupo") {
    let allocations = Array.isArray(payload.groupAllocations) ? payload.groupAllocations : [];
    if (!allocations.length) {
      const groupMembersResult = await dbClient.query(
        `
        SELECT member_client_id, member_name, allocation_amount
        FROM client_group_members
        WHERE company_id = $1
          AND group_client_id = $2
        ORDER BY id ASC
        `,
        [scope.companyId, payload.clientId],
      );
      allocations = groupMembersResult.rows.map((row) => ({
        memberClientId: row.member_client_id ? Number(row.member_client_id) : null,
        memberName: row.member_name || "",
        amount: Number(row.allocation_amount || 0),
      }));
    }
    for (const allocation of allocations) {
      await dbClient.query(
        `
        INSERT INTO loan_group_member_allocations (
          company_id, loan_id, member_client_id, member_name, allocated_amount, paid_amount, status
        )
        VALUES ($1,$2,$3,$4,$5,0,'open')
        `,
        [
          scope.companyId,
          loanId,
          allocation.memberClientId || null,
          allocation.memberName || "Membro",
          round2(Number(allocation.amount || 0)),
        ],
      );
    }
  }

  if (!isPendingDisbursement) {
    await postDoubleEntry(dbClient, {
      companyId: scope.companyId,
      entryDate: payload.disbursed,
      eventType: "desembolso",
      description: `Desembolso do contrato ${loanInserted.rows[0].contract_no}`,
      referenceType: "loan",
      referenceId: loanId,
      loanId,
      actorUserId: actor.userId,
      actorName: actor.name,
      lines: [
        { accountCode: "1210", debit: payload.amount, credit: 0, memo: "Constituicao da carteira de credito" },
        { accountCode: "1110", debit: 0, credit: disbursementNetAmount, memo: "Saida de caixa/banco no desembolso liquido" },
        ...(administrativeFeeAmount > 0 ? [{ accountCode: "4120", debit: 0, credit: administrativeFeeAmount, memo: "Preparo/custos administrativos retidos no desembolso" }] : []),
      ],
    });
  }

  return { loanId, contractNo: loanInserted.rows[0].contract_no };
}

loanRouter.get("/approval/policy", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar politica de aprovacao." });
    const policy = await getApprovalPolicy(scope.companyId);
    return res.json({ policy });
  } catch (error) {
    return next(error);
  }
});

loanRouter.put("/approval/policy", requireReadWrite("alterar.parametros.negocio"), async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para atualizar politica de aprovacao." });
    const analystLimit = Number(req.body?.analystLimit);
    const managerLimit = Number(req.body?.managerLimit);
    const finalLimit = Number(req.body?.finalLimit);
    const minScore = Number(req.body?.minScore);
    const maxDebt = Number(req.body?.maxDebt);
    const defaultDailyPenaltyRate = Number.isFinite(Number(req.body?.defaultDailyPenaltyRate))
      ? Number(req.body.defaultDailyPenaltyRate)
      : DEFAULT_APPROVAL_POLICY.defaultDailyPenaltyRate;
    const defaultAdministrativeFeeRate = Number.isFinite(Number(req.body?.defaultAdministrativeFeeRate))
      ? Number(req.body.defaultAdministrativeFeeRate)
      : DEFAULT_APPROVAL_POLICY.defaultAdministrativeFeeRate;
    const defaultInterestRate = Number.isFinite(Number(req.body?.defaultInterestRate))
      ? Number(req.body.defaultInterestRate)
      : DEFAULT_APPROVAL_POLICY.defaultInterestRate;
    const maxLoanTermMonths = Number.isInteger(Number(req.body?.maxLoanTermMonths)) && Number(req.body?.maxLoanTermMonths) > 0
      ? Number(req.body.maxLoanTermMonths)
      : DEFAULT_APPROVAL_POLICY.maxLoanTermMonths;

    const requestedMoraPolicy = normalizeMoraPolicySettings({
      moraMonthlyEnabled: req.body?.moraMonthlyEnabled,
      moraWeeklyEnabled: req.body?.moraWeeklyEnabled,
      moraDailyEnabled: req.body?.moraDailyEnabled,
    });
    const moraMonthlyEnabled = requestedMoraPolicy.moraMonthlyEnabled;
    const moraWeeklyEnabled = requestedMoraPolicy.moraWeeklyEnabled;
    const moraDailyEnabled = requestedMoraPolicy.moraDailyEnabled;
    const blockAlertStatus = req.body?.blockAlertStatus !== undefined ? Boolean(req.body.blockAlertStatus) : true;
    if (!Number.isFinite(analystLimit) || analystLimit <= 0) return res.status(400).json({ message: "analystLimit invalido." });
    if (!Number.isFinite(managerLimit) || managerLimit <= 0) return res.status(400).json({ message: "managerLimit invalido." });
    if (!Number.isFinite(finalLimit) || finalLimit <= 0) return res.status(400).json({ message: "finalLimit invalido." });
    if (!(analystLimit <= managerLimit && managerLimit <= finalLimit)) {
      return res.status(400).json({ message: "Alcadas invalidas: analyst <= manager <= final." });
    }
    if (!Number.isInteger(minScore) || minScore < 0 || minScore > 1000) return res.status(400).json({ message: "minScore invalido." });
    if (!Number.isFinite(maxDebt) || maxDebt < 0) return res.status(400).json({ message: "maxDebt invalido." });
    const saved = await query(
      `
      INSERT INTO loan_approval_policies (
        company_id, analyst_limit, manager_limit, final_limit, min_score, max_debt, default_daily_penalty_rate,
        default_administrative_fee_rate, default_interest_rate, max_loan_term_months,
        mora_monthly_enabled, mora_weekly_enabled, mora_daily_enabled, block_alert_status,
        updated_by_user_id, updated_by_name, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
      ON CONFLICT (company_id)
      DO UPDATE SET
        analyst_limit = EXCLUDED.analyst_limit,
        manager_limit = EXCLUDED.manager_limit,
        final_limit = EXCLUDED.final_limit,
        min_score = EXCLUDED.min_score,
        max_debt = EXCLUDED.max_debt,
        default_daily_penalty_rate = EXCLUDED.default_daily_penalty_rate,
        default_administrative_fee_rate = EXCLUDED.default_administrative_fee_rate,
        default_interest_rate = EXCLUDED.default_interest_rate,
        max_loan_term_months = EXCLUDED.max_loan_term_months,
        mora_monthly_enabled = EXCLUDED.mora_monthly_enabled,
        mora_weekly_enabled = EXCLUDED.mora_weekly_enabled,
        mora_daily_enabled = EXCLUDED.mora_daily_enabled,
        block_alert_status = EXCLUDED.block_alert_status,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_by_name = EXCLUDED.updated_by_name,
        updated_at = NOW()
      RETURNING
        analyst_limit,
        manager_limit,
        final_limit,
        min_score,
        max_debt,
        default_daily_penalty_rate,
        default_administrative_fee_rate,
        default_interest_rate,
        max_loan_term_months,
        mora_monthly_enabled,
        mora_weekly_enabled,
        mora_daily_enabled,
        block_alert_status
      `,
      [
        scope.companyId,
        analystLimit,
        managerLimit,
        finalLimit,
        minScore,
        maxDebt,
        defaultDailyPenaltyRate,
        defaultAdministrativeFeeRate,
        defaultInterestRate,
        maxLoanTermMonths,
        moraMonthlyEnabled,
        moraWeeklyEnabled,
        moraDailyEnabled,
        blockAlertStatus,
        Number(req.user?.sub) || null,
        req.user?.name || null,
      ],
    );

    return res.json({ message: "Politica de aprovacao atualizada.", policy: normalizeApprovalPolicy(saved.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

// ─── GESTAO DE ENCARGOS DA EMPRESA ──────────────────────────────────────────

loanRouter.get("/charges", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const result = await query(
      `
      SELECT id, company_id, name, type, default_value, is_required, is_active, created_at, updated_at
      FROM company_charges
      WHERE company_id = $1
      ORDER BY is_required DESC, name ASC
      `,
      [scope.companyId],
    );
    const charges = result.rows.map((r) => ({
      id: Number(r.id),
      companyId: Number(r.company_id),
      name: r.name,
      type: r.type || "fixed",
      defaultValue: Number(r.default_value || 0),
      isRequired: Boolean(r.is_required),
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
    }));
    return res.json({ charges });
  } catch (error) {
    return next(error);
  }
});

loanRouter.post("/charges", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (role !== "admin") return res.status(403).json({ message: "Apenas admin pode gerir encargos." });

    const name = String(req.body?.name || "").trim();
    const type = req.body?.type === "percentage" ? "percentage" : "fixed";
    const defaultValue = Number.isFinite(Number(req.body?.defaultValue)) ? Number(req.body.defaultValue) : 0;
    const isRequired = Boolean(req.body?.isRequired);
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true;

    if (!name) return res.status(400).json({ message: "Nome do encargo é obrigatório." });

    const inserted = await query(
      `
      INSERT INTO company_charges (company_id, name, type, default_value, is_required, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id, company_id, name, type, default_value, is_required, is_active, created_at
      `,
      [scope.companyId, name, type, defaultValue, isRequired, isActive],
    );
    const row = inserted.rows[0];
    return res.status(201).json({
      message: "Encargo criado com sucesso.",
      charge: {
        id: Number(row.id),
        companyId: Number(row.company_id),
        name: row.name,
        type: row.type,
        defaultValue: Number(row.default_value || 0),
        isRequired: Boolean(row.is_required),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.put("/charges/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (role !== "admin") return res.status(403).json({ message: "Apenas admin pode gerir encargos." });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID de encargo inválido." });

    const name = String(req.body?.name || "").trim();
    const type = req.body?.type === "percentage" ? "percentage" : "fixed";
    const defaultValue = Number.isFinite(Number(req.body?.defaultValue)) ? Number(req.body.defaultValue) : 0;
    const isRequired = Boolean(req.body?.isRequired);
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : true;

    if (!name) return res.status(400).json({ message: "Nome do encargo é obrigatório." });

    const updated = await query(
      `
      UPDATE company_charges
      SET name = $1, type = $2, default_value = $3, is_required = $4, is_active = $5, updated_at = NOW()
      WHERE id = $6 AND company_id = $7
      RETURNING id, company_id, name, type, default_value, is_required, is_active, created_at
      `,
      [name, type, defaultValue, isRequired, isActive, id, scope.companyId],
    );

    if (!updated.rows.length) return res.status(404).json({ message: "Encargo não encontrado." });

    const row = updated.rows[0];
    return res.json({
      message: "Encargo atualizado com sucesso.",
      charge: {
        id: Number(row.id),
        companyId: Number(row.company_id),
        name: row.name,
        type: row.type,
        defaultValue: Number(row.default_value || 0),
        isRequired: Boolean(row.is_required),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.delete("/charges/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (role !== "admin") return res.status(403).json({ message: "Apenas admin pode gerir encargos." });

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "ID de encargo inválido." });

    const deleted = await query(
      `DELETE FROM company_charges WHERE id = $1 AND company_id = $2 RETURNING id`,
      [id, scope.companyId],
    );
    if (!deleted.rows.length) return res.status(404).json({ message: "Encargo não encontrado." });

    return res.json({ message: "Encargo removido com sucesso." });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/approval/requests", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para listar solicitacoes." });
    const roleStage = getRoleApprovalStage(req.user?.role);
    const status = String(req.query.status || "all").trim().toLowerCase();
    const applicantTypeFilterRaw = String(req.query.applicantType || "all").trim().toLowerCase();
    const applicantTypeFilter = ["all", "singular", "grupo", "empresa"].includes(applicantTypeFilterRaw) ? applicantTypeFilterRaw : "all";
    const mine = String(req.query.mine || "0") === "1";
    const q = `%${String(req.query.search || "").trim().toLowerCase()}%`;

    const allowedStatuses = ["all", "my_stage", ...APPROVAL_STATUSES];
    const statusFilter = allowedStatuses.includes(status) ? status : "all";
    const stageStatus = roleStage === "analyst"
      ? "pending_analyst"
      : roleStage === "manager"
        ? "pending_manager"
        : roleStage === "final"
          ? "pending_final"
          : "";
    const effectiveStatus = statusFilter === "my_stage" ? stageStatus : statusFilter;
    const params = [scope.companyId, q];
    let whereStatus = "";
    let whereMine = "";
    let whereApplicantType = "";
    if (effectiveStatus && effectiveStatus !== "all") {
      params.push(effectiveStatus);
      whereStatus = `AND ar.status = $${params.length}`;
    }
    if (mine) {
      params.push(Number(req.user?.sub) || 0);
      whereMine = `AND ar.created_by_user_id = $${params.length}`;
    }
    if (applicantTypeFilter !== "all") {
      params.push(applicantTypeFilter);
      whereApplicantType = `AND LOWER(COALESCE(ar.payload->>'applicantType', c.client_type, 'singular')) = $${params.length}`;
    }

    const requestsResult = await query(
      `
      SELECT
        ar.id,
        ar.client_id,
        c.name AS client_name,
        c.client_type AS client_type,
        COALESCE(ar.payload->>'applicantType', c.client_type, 'singular') AS applicant_type,
        CASE
          WHEN COALESCE(ar.payload->>'groupMemberCount', '') ~ '^[0-9]+$' THEN (ar.payload->>'groupMemberCount')::int
          ELSE 0
        END AS group_member_count,
        ar.requested_amount,
        ar.payload,
        ar.status,
        ar.risk_level,
        ar.risk_reasons,
        ar.created_by_user_id,
        ar.created_by_name,
        ar.analyst_decision_by_name,
        ar.manager_decision_by_name,
        ar.final_decision_by_name,
        ar.generated_loan_id,
        ar.created_at,
        ar.updated_at
      FROM loan_approval_requests ar
      JOIN clients c ON c.id = ar.client_id
      WHERE ar.company_id = $1
        AND (LOWER(c.name) LIKE $2 OR CAST(ar.id AS TEXT) LIKE $2)
        ${whereStatus}
        ${whereMine}
        ${whereApplicantType}
      ORDER BY ar.created_at DESC
      LIMIT 300
      `,
      params,
    );

    return res.json({
      requests: requestsResult.rows.map((row) => ({
        id: Number(row.id),
        clientId: Number(row.client_id),
        clientName: row.client_name,
        clientType: row.client_type || "singular",
        applicantType: row.applicant_type || row.client_type || "singular",
        groupMemberCount: Number(row.group_member_count || 0),
        requestedAmount: Number(row.requested_amount),
        payload: row.payload || {},
        prazo: Number(row.payload?.periodMonths || row.payload?.prazo || 1),
        periodMonths: Number(row.payload?.periodMonths || row.payload?.prazo || 1),
        taxa: Number(row.payload?.monthlyRatePercent || row.payload?.taxa || 30),
        frequencia: row.payload?.paymentFrequency || row.payload?.frequencia || "mensal",
        status: row.status,
        riskLevel: row.risk_level,
        riskReasons: Array.isArray(row.risk_reasons) ? row.risk_reasons : [],
        createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
        createdByName: row.created_by_name || "",
        analystDecisionByName: row.analyst_decision_by_name || "",
        managerDecisionByName: row.manager_decision_by_name || "",
        finalDecisionByName: row.final_decision_by_name || "",
        generatedLoanId: row.generated_loan_id ? Number(row.generated_loan_id) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.post("/approval/requests", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para criar solicitação de crédito." });
    const policy = await getApprovalPolicy(scope.companyId);

    // 1. Identificação do Cliente
    const clientId = Number(req.body?.clientId || req.body?.client_id || 0);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.status(400).json({ message: "Cliente é obrigatório." });
    }

    const clientResult = await query(
      `
      SELECT
        c.id,
        c.name,
        c.client_type,
        c.status,
        c.score,
        c.carteira_id,
        p.name AS carteira_name,
        p.gestor_name,
        p.gestor_user_id,
        COALESCE(SUM(l.balance), 0)::numeric(14,2) AS debt
      FROM clients c
      LEFT JOIN portfolios p ON p.id = c.carteira_id AND p.company_id = c.company_id
      LEFT JOIN loans l ON l.client_id = c.id AND l.company_id = c.company_id
      WHERE c.id = $1 AND c.company_id = $2
      GROUP BY c.id, p.name, p.gestor_name, p.gestor_user_id
      `,
      [clientId, scope.companyId],
    );
    const client = clientResult.rows[0];
    if (!client) {
      return res.status(400).json({ message: "Cliente informado não pertence à empresa selecionada." });
    }

    // Regra de Negócio: Bloquear novo pedido se o cliente tiver dívida ativa pendente
    const isRefinancing = Boolean(req.body?.reemprestimo || req.body?.isRefinancing);
    if (!isRefinancing) {
      const activeLoanCheck = await query(
        `
        SELECT id, contract_no, balance, status
        FROM loans
        WHERE client_id = $1 AND company_id = $2 AND status IN ('active', 'late', 'defaulted') AND balance > 0.01
        ORDER BY id DESC LIMIT 1
        `,
        [clientId, scope.companyId],
      );
      if (activeLoanCheck.rows[0]) {
        const debtRow = activeLoanCheck.rows[0];
        return res.status(409).json({
          message: `O cliente possui um crédito pendente activo (Contrato nº ${debtRow.contract_no}, Saldo: ${Number(debtRow.balance).toLocaleString("pt-MZ", { minimumFractionDigits: 2 })} MT). É necessário liquidar o crédito anterior antes de abrir um novo pedido.`,
        });
      }

      const pendingReqCheck = await query(
        `
        SELECT id, status, payload
        FROM loan_approval_requests
        WHERE client_id = $1 AND company_id = $2 AND status IN ('pending_analyst', 'pending_manager', 'pending_final', 'approved')
        ORDER BY id DESC LIMIT 1
        `,
        [clientId, scope.companyId],
      );
      if (pendingReqCheck.rows[0]) {
        const pRow = pendingReqCheck.rows[0];
        const reqRef = pRow.payload?.contractNo || `#REQ-${pRow.id}`;
        return res.status(409).json({
          message: `O cliente já possui uma solicitação de crédito em andamento (Processo ${reqRef}). Conclua ou finalize o processo anterior antes de criar outro.`,
        });
      }
    }

    // 2. Produto e Montante
    const productType = normalizeLoanProductType(req.body?.product || req.body?.tipoCredito);
    const requestedAmount = Number(req.body?.amount ?? req.body?.requestedAmount ?? req.body?.valor ?? 0);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ message: "Montante solicitado deve ser maior que zero." });
    }

    // 3. Parâmetros, Carteira e Gestor
    const periodMonths = Math.max(1, Number(req.body?.periodMonths || req.body?.prazo || 1));
    const monthlyRatePercent = normalizeRatePercent(req.body?.monthlyRatePercent || req.body?.taxa || req.body?.rate || 5);
    const paymentFrequency = String(req.body?.paymentFrequency || req.body?.frequencia || "mensal").toLowerCase();
    const applicantType = String(req.body?.applicantType || req.body?.clienteType || client.client_type || "singular").toLowerCase();
    const carteiraId = Number(req.body?.carteiraId || client.carteira_id || 0) || null;
    const carteiraNome = String(req.body?.carteiraNome || client.carteira_name || "");
    const managerUserId = Number(req.body?.managerUserId || client.gestor_user_id || req.user?.sub || 1);
    const gestorName = String(req.body?.gestorName || client.gestor_name || req.user?.name || "");

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const maturityDate = new Date(today);
    maturityDate.setMonth(maturityDate.getMonth() + periodMonths);
    const maturityIso = maturityDate.toISOString().slice(0, 10);
    const nextPaymentDate = new Date(today);
    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    const nextPaymentIso = nextPaymentDate.toISOString().slice(0, 10);

    const groupMembers = Array.isArray(req.body?.groupMembers) ? req.body.groupMembers : [];
    const groupMemberCount = applicantType === "grupo" ? Math.max(groupMembers.length, 2) : 0;

    const payload = {
      ...req.body,
      clientId,
      amount: requestedAmount,
      balance: requestedAmount,
      product: productType,
      applicantType,
      periodMonths,
      rate: monthlyRatePercent,
      monthlyRatePercent,
      dailyPenaltyRate: policy.defaultDailyPenaltyRate || 0.02,
      paymentFrequency,
      amortizationMethod: req.body?.amortizationMethod || "price",
      carteiraId,
      carteiraNome,
      managerUserId,
      gestorName,
      purpose: req.body?.purpose || req.body?.finalidade || "Capital de Giro",
      disbursementChannel: req.body?.disbursementChannel || req.body?.formaDesembolso || "mpesa",
      disbursementAccount: req.body?.disbursementAccount || req.body?.dadosDesembolso || "",
      guarantorName: req.body?.guarantorName || req.body?.avalistaNome || "",
      guarantorPhone: req.body?.guarantorPhone || req.body?.avalistaTelefone || "",
      guarantorNuit: req.body?.guarantorNuit || req.body?.avalistaNuit || "",
      collateralDescription: req.body?.collateralDescription || req.body?.garantiaDescricao || "",
      collateralValue: Number(req.body?.collateralValue || req.body?.garantiaValor || 0),
      contractNo: req.body?.contractNo || `REQ-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`,
      disbursed: todayIso,
      maturity: maturityIso,
      nextPayment: nextPaymentIso,
      daysOverdue: 0,
      status: "active",
      groupMemberCount,
      groupMembers,
    };

    // 4. Verificação de Empréstimos Abertos (se for crédito normal e não for reempréstimo)
    const openLoansResult = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM loans
      WHERE company_id = $1
        AND client_id = $2
        AND balance > 0
        AND status IN ('active', 'warning', 'overdue')
      `,
      [scope.companyId, clientId],
    );
    const openLoans = Number(openLoansResult.rows[0]?.total || 0);
    const blocksWithOpenLoans = productType === LOAN_PRODUCT_TYPES.NORMAL || productType === LOAN_PRODUCT_TYPES.REEMPRESTIMO;
    if (blocksWithOpenLoans && openLoans > 0 && !req.body?.reemprestimo) {
      return res.status(409).json({
        message: "Cliente possui crédito vigente sem liquidação. Para novo contrato use Acréscimo ou Crédito Especial.",
      });
    }

    // 5. Avaliação de Risco e Inserção
    const risk = resolveRiskEvaluation({ client, policy });
    const actorUserId = Number(req.user?.sub) || null;
    const actorName = req.user?.name || null;

    const inserted = await query(
      `
      INSERT INTO loan_approval_requests (
        company_id, client_id, requested_amount, payload, status, risk_level, risk_reasons,
        created_by_user_id, created_by_name
      )
      VALUES ($1, $2, $3, $4::jsonb, 'pending_analyst', $5, $6::jsonb, $7, $8)
      RETURNING id, status, requested_amount, created_at
      `,
      [
        scope.companyId,
        clientId,
        requestedAmount,
        JSON.stringify(payload),
        risk.riskLevel,
        JSON.stringify(risk.reasons),
        actorUserId,
        actorName,
      ],
    );

    const row = inserted.rows[0];

    publishAppEvent(scope.companyId, "LOAN_REQUEST_CREATED", {
      id: Number(row.id),
      clientId,
      amount: requestedAmount,
      status: row.status,
    });

    return res.status(201).json({
      message: "Pedido de crédito submetido com sucesso para análise.",
      id: Number(row.id),
      status: row.status,
      requestedAmount,
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.patch("/approval/requests/:id/decision", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para decidir solicitacao." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });

    const decision = String(req.body?.decision || "").trim().toLowerCase();
    const note = String(req.body?.note || "").trim();
    if (!["approve", "reject", "reopen"].includes(decision)) {
      return res.status(400).json({ message: "Decisao invalida. Use approve, reject ou reopen." });
    }
    if (!note && decision !== "reopen") {
      return res.status(400).json({ message: "Justificativa obrigatoria para decidir a solicitacao." });
    }

    const isAdmin = String(req.user?.role || "").trim().toLowerCase() === "admin";
    const actor = {
      userId: Number(req.user?.sub) || null,
      name: req.user?.name || null,
      stage: isAdmin ? "final" : getRoleApprovalStage(req.user?.role),
    };
    if (!actor.stage) return res.status(403).json({ message: "Perfil sem permissao para decidir solicitacoes." });

    const result = await withTransaction(async (dbClient) => {
      const requestResult = await dbClient.query(
        `
        SELECT ar.id, ar.client_id, ar.requested_amount, ar.payload, ar.status, ar.created_by_user_id, ar.manager_decision_by_user_id, ar.generated_loan_id
        FROM loan_approval_requests ar
        WHERE ar.id = $1 AND ar.company_id = $2
        FOR UPDATE
        `,
        [id, scope.companyId],
      );
      const request = requestResult.rows[0];
      if (!request) return { error: { status: 404, message: "Solicitacao nao encontrada." } };
      if (request.generated_loan_id) {
        if (decision === "approve") {
          const loanRow = await dbClient.query(
            `
            UPDATE loans
            SET status = 'active',
                disbursement_status = 'disbursed',
                disbursed_on = COALESCE(disbursed_on, CURRENT_DATE),
                disbursed_at = COALESCE(disbursed_at, NOW())
            WHERE id = $1 AND company_id = $2
            RETURNING id, contract_no
            `,
            [request.generated_loan_id, scope.companyId],
          );
          await dbClient.query(
            `
            UPDATE loan_approval_requests
            SET status = 'disbursed',
                updated_at = NOW()
            WHERE id = $1 AND company_id = $2
            `,
            [id, scope.companyId],
          );
          return {
            approved: true,
            status: "disbursed",
            loanId: request.generated_loan_id,
            contractNo: loanRow.rows[0]?.contract_no || null,
          };
        }
        return { error: { status: 400, message: "Solicitacao ja concluida com emprestimo gerado." } };
      }

      if (decision === "reopen") {
        if (request.status !== "rejected" && request.status !== "risk_blocked") {
          return { error: { status: 400, message: "Apenas pedidos rejeitados ou bloqueados podem ser reabertos." } };
        }
        const payloadObj = typeof request.payload === "object" && request.payload ? request.payload : {};
        const prevStatus = payloadObj.previousStatus;
        // Restaura exatamente a fase em que estava antes de ser rejeitado:
        const targetStatus = (prevStatus && prevStatus !== "rejected" && prevStatus !== "risk_blocked")
          ? prevStatus
          : (request.manager_decision_at ? "pending_final" : request.analyst_decision_at ? "pending_manager" : "pending_analyst");

        await dbClient.query(
          `
          UPDATE loan_approval_requests
          SET status = $3,
              updated_at = NOW()
          WHERE id = $1 AND company_id = $2
          `,
          [id, scope.companyId, targetStatus],
        );
        return { reopened: true, status: targetStatus };
      }

      if (!isAdmin && request.created_by_user_id && Number(request.created_by_user_id) === actor.userId) {
        return { error: { status: 403, message: "O solicitante nao pode decidir a propria solicitacao." } };
      }

      const policyRow = await dbClient.query(
        `
        SELECT
          analyst_limit,
          manager_limit,
          final_limit,
          min_score,
          max_debt,
          default_daily_penalty_rate,
          mora_monthly_enabled,
          mora_weekly_enabled,
          mora_daily_enabled,
          block_alert_status
        FROM loan_approval_policies
        WHERE company_id = $1
        LIMIT 1
        `,
        [scope.companyId],
      );
      const policy = normalizeApprovalPolicy(policyRow.rows[0] || null);

      const requiredStage = request.status === "pending_analyst"
        ? "analyst"
        : request.status === "pending_manager"
          ? "manager"
          : request.status === "pending_final"
            ? "final"
            : isAdmin ? "final" : null;

      if (request.status === "risk_blocked") {
        if (decision !== "reject" && !isAdmin) {
          return { error: { status: 400, message: "Solicitacao bloqueada por risco nao pode ser aprovada." } };
        }
        if (!isAdmin && !["manager", "final"].includes(actor.stage)) {
          return { error: { status: 403, message: "Apenas gestor ou aprovacao final podem encerrar solicitacao bloqueada por risco." } };
        }
        await dbClient.query(
          `
          UPDATE loan_approval_requests
          SET status = 'rejected',
              updated_at = NOW(),
              manager_decision_by_user_id = CASE WHEN $3 = 'manager' OR $7 = true THEN $4 ELSE manager_decision_by_user_id END,
              manager_decision_by_name = CASE WHEN $3 = 'manager' OR $7 = true THEN $5 ELSE manager_decision_by_name END,
              manager_decision_at = CASE WHEN $3 = 'manager' OR $7 = true THEN NOW() ELSE manager_decision_at END,
              manager_decision_note = CASE WHEN $3 = 'manager' OR $7 = true THEN $6 ELSE manager_decision_note END,
              final_decision_by_user_id = CASE WHEN $3 = 'final' OR $7 = true THEN $4 ELSE final_decision_by_user_id END,
              final_decision_by_name = CASE WHEN $3 = 'final' OR $7 = true THEN $5 ELSE final_decision_by_name END,
              final_decision_at = CASE WHEN $3 = 'final' OR $7 = true THEN NOW() ELSE final_decision_at END,
              final_decision_note = CASE WHEN $3 = 'final' OR $7 = true THEN $6 ELSE final_decision_note END
          WHERE id = $1 AND company_id = $2
          `,
          [id, scope.companyId, actor.stage, actor.userId, actor.name, note, isAdmin],
        );
        return { rejected: true };
      }

      if (!requiredStage && !isAdmin) {
        return { error: { status: 400, message: "Solicitacao nao esta em etapa de aprovacao." } };
      }
      if (!isAdmin && actor.stage !== requiredStage) {
        return { error: { status: 403, message: "Perfil atual nao pode decidir esta etapa." } };
      }

      const amount = Number(request.requested_amount || 0);
      if (decision === "approve" && !isAdmin) {
        if (requiredStage === "analyst" && amount > policy.analystLimit) {
          return { error: { status: 403, message: "Valor excede alcada do analista." } };
        }
        if (requiredStage === "manager" && amount > policy.managerLimit) {
          return { error: { status: 403, message: "Valor excede alcada do gestor." } };
        }
        if (requiredStage === "final" && amount > policy.finalLimit) {
          return { error: { status: 403, message: "Valor excede alcada de aprovacao final." } };
        }
      }

      const analystSet = requiredStage === "analyst"
        ? ", analyst_decision_by_user_id = $3, analyst_decision_by_name = $4, analyst_decision_at = NOW(), analyst_decision_note = $5"
        : "";
      const managerSet = requiredStage === "manager"
        ? ", manager_decision_by_user_id = $3, manager_decision_by_name = $4, manager_decision_at = NOW(), manager_decision_note = $5"
        : "";
      const finalSet = requiredStage === "final"
        ? ", final_decision_by_user_id = $3, final_decision_by_name = $4, final_decision_at = NOW(), final_decision_note = $5"
        : "";

      if (decision === "reject") {
        await dbClient.query(
          `
          UPDATE loan_approval_requests
          SET status = 'rejected',
              updated_at = NOW(),
              payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{previousStatus}', to_jsonb($6::text))
              ${analystSet}
              ${managerSet}
              ${finalSet}
          WHERE id = $1 AND company_id = $2
          `,
          [id, scope.companyId, actor.userId, actor.name, note, request.status],
        );
        return { rejected: true };
      }

      const shouldFinalizeDirectly = isAdmin && (req.body?.directApproval === true || requiredStage === "final");
      if (requiredStage !== "final" && !shouldFinalizeDirectly) {
        const nextStatus = requiredStage === "analyst" ? "pending_manager" : "pending_final";
        await dbClient.query(
          `
          UPDATE loan_approval_requests
          SET status = $6,
              updated_at = NOW()
              ${analystSet}
              ${managerSet}
          WHERE id = $1 AND company_id = $2
          `,
          [id, scope.companyId, actor.userId, actor.name, note, nextStatus],
        );
        return { approved: true, status: nextStatus };
      }

      const payloadRaw = typeof request.payload === "object" && request.payload ? request.payload : {};
      const requestedAmt = Number(payloadRaw.amount || payloadRaw.valor || request.requested_amount || 0);
      const prazo = Number(payloadRaw.prazo || payloadRaw.installments || 1);
      const taxa = Number(payloadRaw.taxa || payloadRaw.rate || 5);
      const frequencia = String(payloadRaw.frequencia || payloadRaw.paymentFrequency || "mensal").toLowerCase();
      const today = new Date();
      const maturityDate = new Date();
      if (frequencia === "diario") maturityDate.setDate(today.getDate() + prazo);
      else if (frequencia === "semanal") maturityDate.setDate(today.getDate() + prazo * 7);
      else if (frequencia === "quinzenal") maturityDate.setDate(today.getDate() + prazo * 15);
      else maturityDate.setMonth(today.getMonth() + prazo);

      const nextPayDate = new Date();
      if (frequencia === "diario") nextPayDate.setDate(today.getDate() + 1);
      else if (frequencia === "semanal") nextPayDate.setDate(today.getDate() + 7);
      else if (frequencia === "quinzenal") nextPayDate.setDate(today.getDate() + 15);
      else nextPayDate.setMonth(today.getMonth() + 1);

      const toIso = (dt) => dt.toISOString().split("T")[0];

      const resolvedManager = await resolveManagerForCompany(
        scope.companyId,
        payloadRaw.managerUserId || request.manager_decision_by_user_id || actor.userId,
        dbClient,
      );

      const payload = {
        ...payloadRaw,
        product: String(payloadRaw.product || payloadRaw.tipoCredito || "Crédito Individual").trim(),
        clientId: Number(payloadRaw.clientId || request.client_id),
        managerUserId: resolvedManager ? Number(resolvedManager.id) : (Number(actor.userId) || 1),
        amount: requestedAmt,
        balance: requestedAmt,
        rate: taxa,
        disbursed: payloadRaw.disbursed || toIso(today),
        maturity: payloadRaw.maturity || toIso(maturityDate),
        nextPayment: payloadRaw.nextPayment || toIso(nextPayDate),
        daysOverdue: 0,
        status: "active",
        amortizationMethod: payloadRaw.amortizationMethod || "price",
        paymentFrequency: frequencia,
      };
      const validation = validateLoanPayload(payload, {
        defaultDailyPenaltyRate: policy.defaultDailyPenaltyRate,
        maxLoanTermMonths: policy.maxLoanTermMonths,
      });
      if (!validation.valid) return { error: { status: 400, message: `Payload invalido na aprovacao final: ${validation.message}` } };
      const d = validation.data;

      const clientExists = await dbClient.query("SELECT id FROM clients WHERE id = $1 AND company_id = $2 LIMIT 1", [d.clientId, scope.companyId]);
      if (!clientExists.rows[0]) return { error: { status: 400, message: "Cliente da solicitacao nao existe mais nesta empresa." } };
      const manager = await resolveManagerForCompany(scope.companyId, d.managerUserId, dbClient);
      if (!manager) return { error: { status: 400, message: "Gestor invalido para a carteira deste emprestimo." } };

      const createResult = await createLoanFromPayload(dbClient, {
        scope,
        payload: d,
        actor: { userId: actor.userId, name: actor.name },
        disbursementStatus: "pending",
      });
      if (createResult?.error) return createResult;

      await dbClient.query(
        `
        UPDATE loan_approval_requests
        SET status = 'approved',
            updated_at = NOW(),
            final_decision_by_user_id = $3,
            final_decision_by_name = $4,
            final_decision_at = NOW(),
            final_decision_note = $5,
            generated_loan_id = $6
        WHERE id = $1 AND company_id = $2
        `,
        [id, scope.companyId, actor.userId, actor.name, note, createResult.loanId],
      );
      return { approved: true, status: "approved", loanId: createResult.loanId, contractNo: createResult.contractNo };
    });

    if (result?.error) return res.status(result.error.status).json({ message: result.error.message });

    publishAppEvent(scope.companyId, "LOAN_DECISION_UPDATED", {
      requestId: id,
      status: result.status || (result.rejected ? "rejected" : "pending"),
      loanId: result.loanId || null,
      contractNo: result.contractNo || null,
      rejected: Boolean(result.rejected),
    });

    if (result?.rejected) return res.json({ message: "Solicitacao rejeitada com sucesso.", status: "rejected" });
    return res.json({
      message: result.status === "approved" ? "Solicitacao aprovada e emprestimo criado com sucesso." : "Etapa aprovada e encaminhada para proxima alcada.",
      status: result.status,
      loanId: result.loanId || null,
      contractNo: result.contractNo || null,
    });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ message: "Conflito ao concluir aprovacao. Tente novamente." });
    return next(error);
  }
});

loanRouter.get("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para listar emprestimos." });
    const policy = await getApprovalPolicy(scope.companyId);
    const { search = "", status = "all" } = req.query;
    const carteiraIdRaw = Number(req.query.carteiraId);
    const carteiraIdFilter = Number.isInteger(carteiraIdRaw) && carteiraIdRaw > 0 ? carteiraIdRaw : null;
    const applicantTypeRaw = String(req.query.clientType || req.query.applicantType || "all").trim().toLowerCase();
    const applicantTypeFilter = ["all", "singular", "grupo", "empresa"].includes(applicantTypeRaw) ? applicantTypeRaw : "all";
    const searchValue = `%${String(search).trim().toLowerCase()}%`;
    const filterStatus = ["all", "active", "warning", "overdue"].includes(String(status))
      ? String(status)
      : "all";
    const params = [searchValue, scope.companyId, applicantTypeFilter, carteiraIdFilter];

    const loansResult = await query(
      `
      SELECT
        l.id,
        l.client_id,
        l.manager_user_id,
        l.contract_no,
        c.name AS client,
        c.client_type,
        COALESCE(ar_meta.applicant_type, c.client_type, 'singular') AS applicant_type,
        COALESCE(ar_meta.group_member_count, 0) AS group_member_count,
        COALESCE(mu.full_name, 'Sem Gestor') AS manager_name,
        l.product,
        l.principal,
        l.balance,
        l.interest_rate,
        l.administrative_fee_mode,
        l.administrative_fee_rate,
        l.administrative_fee_amount,
        l.disbursement_net_amount,
        l.daily_penalty_rate,
        l.mora_waived_total,
        l.amortization_method,
        l.payment_frequency,
        l.disbursement_status,
        l.disbursed_at,
        l.disbursed_on,
        l.maturity_on,
        l.next_payment_on,
        l.days_overdue,
        l.status,
        l.carteira_id,
        COALESCE(rp.total_paid_principal, 0) AS total_paid_principal,
        COALESCE(fe.total_forgiven_principal, 0) AS total_forgiven_principal,
        COALESCE(fe.total_forgiven_mora, 0) AS total_forgiven_mora,
        g.id AS guarantor_id,
        g.name AS guarantor_name,
        g.phone AS guarantor_phone,
        g.guaranteed_amount AS guarantor_guaranteed_amount,
        g.active_guarantees AS guarantor_active_guarantees,
        COALESCE(dl.days_overdue, 0) AS calc_days_overdue,
        COALESCE(dl.overdue_amount, 0) AS calc_overdue_amount,
        COALESCE(dl.overdue_weighted_amount, 0) AS calc_overdue_weighted_amount
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      LEFT JOIN users mu ON mu.id = l.manager_user_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(ar1.payload->>'applicantType', c.client_type, 'singular') AS applicant_type,
          CASE
            WHEN COALESCE(ar1.payload->>'groupMemberCount', '') ~ '^[0-9]+$' THEN (ar1.payload->>'groupMemberCount')::int
            ELSE 0
          END AS group_member_count
        FROM loan_approval_requests ar1
        WHERE ar1.company_id = l.company_id
          AND ar1.generated_loan_id = l.id
        ORDER BY ar1.id DESC
        LIMIT 1
      ) ar_meta ON TRUE
      LEFT JOIN guarantors g ON g.client_id = l.client_id AND g.company_id = l.company_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(r.principal_applied), 0)::NUMERIC AS total_paid_principal
        FROM loan_repayments r
        WHERE r.company_id = l.company_id
          AND r.loan_id = l.id
      ) rp ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(CASE WHEN e.event_type = 'abatimento' THEN e.amount ELSE 0 END), 0)::NUMERIC AS total_forgiven_principal,
          COALESCE(SUM(CASE WHEN e.event_type = 'perdao_mora' THEN e.amount ELSE 0 END), 0)::NUMERIC AS total_forgiven_mora
        FROM loan_financial_events e
        WHERE e.company_id = l.company_id
          AND e.loan_id = l.id
          AND e.workflow_status IN ('executed', 'approved')
      ) fe ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(MAX(CASE
            WHEN li.status <> 'paid'
              AND li.due_date < CURRENT_DATE
              AND ((li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
            THEN (CURRENT_DATE - li.due_date)
            ELSE 0
          END), 0)::INT AS days_overdue,
          COALESCE(SUM(CASE
            WHEN li.status <> 'paid'
              AND li.due_date < CURRENT_DATE
              AND ((li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
            THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
            ELSE 0
          END), 0)::NUMERIC AS overdue_amount,
          COALESCE(SUM(CASE
            WHEN li.status <> 'paid'
              AND li.due_date < CURRENT_DATE
              AND ((li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
            THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
              * GREATEST(0, (CURRENT_DATE - li.due_date) - ${FIXED_MORA_GRACE_DAYS})
            ELSE 0
          END), 0)::NUMERIC AS overdue_weighted_amount
        FROM loan_installments li
        WHERE li.loan_id = l.id
      ) dl ON TRUE
      WHERE (LOWER(c.name) LIKE $1 OR LOWER(l.contract_no) LIKE $1)
        AND l.company_id = $2
        AND ($3 = 'all' OR LOWER(COALESCE(ar_meta.applicant_type, c.client_type, 'singular')) = $3)
        AND ($4::int IS NULL OR l.carteira_id = $4::int)
      ORDER BY l.disbursed_on DESC
    `,
      params,
    );

    const referenceDateIso = new Date().toISOString().slice(0, 10);
    const normalized = loansResult.rows.map((loan) => {
      const daysOverdue = Number(loan.calc_days_overdue || 0);
      const overdueInstallmentsAmount = Number(loan.calc_overdue_amount || 0);
      const overdueWeightedAmount = Number(loan.calc_overdue_weighted_amount || 0);
      const dailyPenaltyRate = Number(loan.daily_penalty_rate);
      const moraWaivedTotal = Number(loan.mora_waived_total || 0);
      const paymentFrequency = normalizePaymentFrequencyValue(loan.payment_frequency);
      const moraEnabled = isMoraEnabledForFrequency(paymentFrequency, policy);
      return {
        id: loan.id,
        clientId: Number(loan.client_id),
        clientType: loan.client_type || "singular",
        applicantType: loan.applicant_type || loan.client_type || "singular",
        groupMemberCount: Number(loan.group_member_count || 0),
        managerUserId: loan.manager_user_id ? Number(loan.manager_user_id) : null,
        managerName: loan.manager_name || "Sem Gestor",
        carteiraId: loan.carteira_id ? Number(loan.carteira_id) : null,
        contractNo: loan.contract_no,
        client: loan.client,
        product: loan.product,
        amount: Number(loan.principal),
        balance: Number(loan.balance),
        totalPaidPrincipal: Number(loan.total_paid_principal || 0),
        totalForgivenPrincipal: Number(loan.total_forgiven_principal || 0),
        totalForgivenMora: Number(loan.total_forgiven_mora || 0),
        rate: Number(loan.interest_rate),
        administrativeFeeMode: normalizeAdministrativeFeeMode(loan.administrative_fee_mode),
        administrativeFeeRate: Number(loan.administrative_fee_rate || ADMINISTRATIVE_FEE_RATE_PERCENT),
        administrativeFeeAmount: Number(loan.administrative_fee_amount || 0),
        disbursementNetAmount: Number(
          loan.disbursement_net_amount
          || calculateDisbursementNetAmount(loan.principal, loan.administrative_fee_amount || 0),
        ),
        dailyPenaltyRate,
        moraWaivedTotal,
        amortizationMethod: loan.amortization_method,
        paymentFrequency,
        disbursementStatus: loan.disbursement_status || "disbursed",
        disbursedAt: loan.disbursed_at,
        disbursed: loan.disbursed_on,
        maturity: loan.maturity_on,
        nextPayment: loan.next_payment_on,
        daysOverdue,
        status: deriveLoanStatus(daysOverdue),
        guarantor: loan.guarantor_id
          ? {
              id: Number(loan.guarantor_id),
              name: loan.guarantor_name || "",
              phone: loan.guarantor_phone || "",
              guaranteedAmount: Number(loan.guarantor_guaranteed_amount || 0),
              activeGuarantees: Number(loan.guarantor_active_guarantees || 0),
            }
          : null,
        moraAccrued: calculateInstallmentsMora(overdueInstallmentsAmount, dailyPenaltyRate, moraWaivedTotal, {
          moraEnabled,
          policySettings: policy,
          daysOverdue,
          weightedOverdueAmount: overdueWeightedAmount,
          disbursedDate: loan.disbursed_on,
          referenceDate: referenceDateIso,
        }),
        overdueInstallmentsAmount: round2(overdueInstallmentsAmount),
        delinquencyBucket: getDelinquencyBucket(daysOverdue),
        collectionStage: getCollectionStage(daysOverdue),
      };
    });

    const filtered = normalized.filter((loan) => {
      if (filterStatus === "all") return true;
      if (filterStatus === "active") return loan.status === "active" && loan.daysOverdue === 0;
      if (filterStatus === "warning") return loan.status === "warning" || (loan.daysOverdue > 0 && loan.daysOverdue <= 30);
      if (filterStatus === "overdue") return loan.status === "overdue" || loan.daysOverdue > 30;
      return true;
    });

    const totals = normalized.reduce(
      (acc, loan) => {
        acc.portfolio += loan.amount;
        acc.balance += loan.balance;
        acc.moraTotal += loan.moraAccrued;
        if (loan.daysOverdue > 0) {
          acc.overdueValue += Number(loan.overdueInstallmentsAmount || 0);
        }
        const bucket = loan.delinquencyBucket;
        if (!acc.bucketBreakdown[bucket]) {
          acc.bucketBreakdown[bucket] = { count: 0, balance: 0, mora: 0 };
        }
        acc.bucketBreakdown[bucket].count += 1;
        acc.bucketBreakdown[bucket].balance += loan.balance;
        acc.bucketBreakdown[bucket].mora += loan.moraAccrued;
        return acc;
      },
      { portfolio: 0, balance: 0, overdueValue: 0, moraTotal: 0, bucketBreakdown: {} },
    );

    return res.json({
      stats: {
        total: normalized.length,
        active: normalized.filter((l) => l.status === "active" && l.daysOverdue === 0).length,
        warning: normalized.filter((l) => l.daysOverdue > 0 && l.daysOverdue <= 30).length,
        overdue: normalized.filter((l) => l.daysOverdue > 30).length,
      },
      totals,
      loans: filtered,
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/disbursements", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para listar desembolsos." });
    const searchValue = `%${String(req.query.search || "").trim().toLowerCase()}%`;
    const statusFilter = String(req.query.status || "all").trim().toLowerCase();

    const rows = await query(
      `
      SELECT
        l.id,
        l.contract_no,
        l.client_id,
        c.name AS client_name,
        l.manager_user_id,
        COALESCE(mu.full_name, 'Sem Gestor') AS manager_name,
        l.product,
        l.principal,
        l.balance,
        l.interest_rate,
        l.administrative_fee_mode,
        l.administrative_fee_rate,
        l.administrative_fee_amount,
        l.disbursement_net_amount,
        l.payment_frequency,
        l.disbursement_status,
        l.disbursed_on,
        l.disbursed_at,
        l.created_at
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      LEFT JOIN users mu ON mu.id = l.manager_user_id
      WHERE l.company_id = $1
        AND (LOWER(c.name) LIKE $2 OR LOWER(l.contract_no) LIKE $2)
      ORDER BY l.created_at DESC
      LIMIT 500
      `,
      [scope.companyId, searchValue],
    );

    const list = rows.rows
      .map((row) => ({
        id: Number(row.id),
        contractNo: row.contract_no,
        clientId: Number(row.client_id),
        client: row.client_name,
        managerUserId: row.manager_user_id ? Number(row.manager_user_id) : null,
        managerName: row.manager_name || "Sem Gestor",
        product: row.product,
        amount: Number(row.principal || 0),
        balance: Number(row.balance || 0),
        rate: Number(row.interest_rate || 0),
        administrativeFeeMode: normalizeAdministrativeFeeMode(row.administrative_fee_mode),
        administrativeFeeRate: Number(row.administrative_fee_rate || ADMINISTRATIVE_FEE_RATE_PERCENT),
        administrativeFeeAmount: Number(row.administrative_fee_amount || 0),
        disbursementNetAmount: Number(
          row.disbursement_net_amount
          || calculateDisbursementNetAmount(row.principal, row.administrative_fee_amount || 0),
        ),
        paymentFrequency: row.payment_frequency,
        disbursementStatus: row.disbursement_status || "disbursed",
        disbursed: row.disbursed_on,
        disbursedAt: row.disbursed_at,
        createdAt: row.created_at,
      }))
      .filter((item) => statusFilter === "all" || item.disbursementStatus === statusFilter);

    const stats = {
      pendingCount: list.filter((item) => item.disbursementStatus === "pending").length,
      disbursedCount: list.filter((item) => item.disbursementStatus === "disbursed").length,
      totalDisbursed: round2(
        list
          .filter((item) => item.disbursementStatus === "disbursed")
          .reduce((acc, item) => acc + item.amount, 0),
      ),
      totalDisbursedNet: round2(
        list
          .filter((item) => item.disbursementStatus === "disbursed")
          .reduce((acc, item) => acc + Number(item.disbursementNetAmount || 0), 0),
      ),
    };

    return res.json({ stats, items: list });
  } catch (error) {
    return next(error);
  }
});

loanRouter.post("/simulate", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para simular credito." });

    const amount = Number(req.body?.amount);
    const rate = normalizeRatePercent(req.body?.rate);
    const amortizationMethod = String(req.body?.amortizationMethod || "price").trim().toLowerCase();
    const paymentFrequency = String(req.body?.paymentFrequency || "mensal").trim().toLowerCase();
    const paymentDays = normalizePaymentDays(req.body?.paymentDays);
    const disbursed = String(req.body?.disbursed || "").trim();
    const maturity = String(req.body?.maturity || "").trim();
    const nextPayment = String(req.body?.nextPayment || "").trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Valor do emprestimo invalido." });
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ message: "Taxa de juro invalida." });
    }
    if (!AMORTIZATION_METHODS.includes(amortizationMethod)) {
      return res.status(400).json({ message: "Metodo de amortizacao invalido." });
    }
    if (!PAYMENT_FREQUENCIES.includes(paymentFrequency)) {
      return res.status(400).json({ message: "Frequencia de pagamento invalida." });
    }
    if (paymentFrequency === "diario" && paymentDays.length === 0) {
      return res.status(400).json({ message: "Selecione ao menos um dia util para pagamentos diarios." });
    }
    if (!disbursed || !maturity || !nextPayment) {
      return res.status(400).json({ message: "Datas obrigatorias em falta." });
    }

    const scheduleResult = buildInstallments({
      amount,
      rate,
      amortizationMethod,
      paymentFrequency,
      paymentDays,
      disbursed,
      maturity,
      nextPayment,
    });
    if (!scheduleResult.valid) {
      return res.status(400).json({ message: scheduleResult.message });
    }

    const installments = scheduleResult.rows || [];
    const totalPayment = round2(installments.reduce((sum, row) => sum + Number(row.paymentAmount || 0), 0));
    const totalPrincipal = round2(installments.reduce((sum, row) => sum + Number(row.principalAmount || 0), 0));
    const totalInterest = round2(installments.reduce((sum, row) => sum + Number(row.interestAmount || 0), 0));

    return res.json({
      summary: {
        installments: installments.length,
        firstPayment: Number(installments[0]?.paymentAmount || 0),
        lastPayment: Number(installments[installments.length - 1]?.paymentAmount || 0),
        totalPayment,
        totalPrincipal,
        totalInterest,
      },
      schedule: installments.map((row) => ({
        installmentNo: Number(row.installmentNo),
        dueDate: row.dueDate,
        paymentAmount: Number(row.paymentAmount || 0),
        principalAmount: Number(row.principalAmount || 0),
        interestAmount: Number(row.interestAmount || 0),
        balanceAfter: Number(row.balanceAfter || 0),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.post("/:id/disburse", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para desembolsar credito." });
    const loanId = Number(req.params.id);
    if (!Number.isInteger(loanId)) return res.status(400).json({ message: "ID invalido." });

    const actorUserId = Number(req.user?.sub) || null;
    const actorName = req.user?.name || null;

    const result = await withTransaction(async (dbClient) => {
      const loanResult = await dbClient.query(
        `
        SELECT
          id,
          client_id,
          contract_no,
          principal,
          administrative_fee_mode,
          administrative_fee_rate,
          administrative_fee_amount,
          disbursement_net_amount,
          disbursed_on,
          disbursement_status
        FROM loans
        WHERE id = $1 AND company_id = $2
        FOR UPDATE
        `,
        [loanId, scope.companyId],
      );
      const loan = loanResult.rows[0];
      if (!loan) return { error: { status: 404, message: "Emprestimo nao encontrado." } };
      if (loan.disbursement_status === "disbursed") {
        return { error: { status: 409, message: "Este emprestimo ja foi desembolsado." } };
      }
      const administrativeFeeMode = normalizeAdministrativeFeeMode(loan.administrative_fee_mode);
      const administrativeFeeRate = Number(loan.administrative_fee_rate || ADMINISTRATIVE_FEE_RATE_PERCENT);
      const administrativeFeeAmount = round2(
        Number(loan.administrative_fee_amount || calculateAdministrativeFeeAmount(loan.principal, administrativeFeeMode)),
      );
      const disbursementNetAmount = round2(
        Number(loan.disbursement_net_amount || calculateDisbursementNetAmount(loan.principal, administrativeFeeAmount)),
      );

      const todayIso = new Date().toISOString().slice(0, 10);
      await dbClient.query(
        `
        UPDATE loans
        SET disbursement_status = 'disbursed',
            disbursed_at = NOW(),
            disbursed_on = COALESCE(disbursed_on, $3),
            administrative_fee_mode = $4,
            administrative_fee_rate = $5,
            administrative_fee_amount = $6,
            disbursement_net_amount = $7
        WHERE id = $1 AND company_id = $2
        `,
        [loanId, scope.companyId, todayIso, administrativeFeeMode, administrativeFeeRate, administrativeFeeAmount, disbursementNetAmount],
      );

      await postDoubleEntry(dbClient, {
        companyId: scope.companyId,
        entryDate: loan.disbursed_on || todayIso,
        eventType: "desembolso",
        description: `Desembolso do contrato ${loan.contract_no}`,
        referenceType: "loan",
        referenceId: loanId,
        loanId,
        actorUserId,
        actorName,
        lines: [
          { accountCode: "1210", debit: Number(loan.principal || 0), credit: 0, memo: "Constituicao da carteira de credito" },
          { accountCode: "1110", debit: 0, credit: disbursementNetAmount, memo: "Saida de caixa/banco no desembolso liquido" },
          ...(administrativeFeeAmount > 0 ? [{ accountCode: "4120", debit: 0, credit: administrativeFeeAmount, memo: "Preparo/custos administrativos retidos no desembolso" }] : []),
        ],
      });

      return {
        loanId,
        contractNo: loan.contract_no,
        amount: Number(loan.principal || 0),
        disbursedOn: loan.disbursed_on || todayIso,
      };
    });

    if (result?.error) return res.status(result.error.status).json({ message: result.error.message });

    // Comunicação automática ao cliente e ao gestor responsável (Fase 4)
    void (async () => {
      try {
        const clientRow = await query(
          `SELECT c.id, c.name, c.email, c.manager_user_id
           FROM clients c
           JOIN loans l ON l.client_id = c.id
           WHERE l.id = $1 AND l.company_id = $2`,
          [loanId, scope.companyId],
        ).then((r) => r.rows[0]).catch(() => null);

        if (clientRow) {
          const amount = Number(result.amount || 0);
          const disbursedOn = result.disbursedOn || new Date().toISOString().slice(0, 10);
          await notifyDisbursementEmail({
            companyId: scope.companyId,
            clientId: Number(clientRow.id),
            clientName: clientRow.name || "Cliente",
            clientEmail: clientRow.email || null,
            contractNo: result.contractNo,
            amount: amount.toLocaleString("pt-MZ", { minimumFractionDigits: 2 }),
            currency: "MZN",
            disbursedOn,
          });

          await createSystemNotification({
            companyId: scope.companyId,
            userId: clientRow.manager_user_id ? Number(clientRow.manager_user_id) : null,
            category: "desembolso",
            severity: "info",
            title: "Desembolso realizado",
            message: `Contrato ${result.contractNo} desembolsado para ${clientRow.name || "o cliente"}.`,
            referenceType: "loan",
            referenceId: loanId,
          });
        }
      } catch {
        /* comunicação é best-effort; nunca bloqueia o desembolso */
      }
    })();

    publishAppEvent(scope.companyId, "LOAN_DISBURSED", {
      loanId,
      contractNo: result.contractNo,
      amount: result.amount,
      disbursedOn: result.disbursedOn,
    });
    publishAppEvent(scope.companyId, "CAIXA_MUTATION", {
      action: "disbursement",
      amount: result.amount,
    });

    return res.json({ message: "Desembolso realizado com sucesso.", ...result });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/:id/documents", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para listar documentos." });
    const loanId = Number(req.params.id);
    if (!Number.isInteger(loanId)) return res.status(400).json({ message: "ID invalido." });

    const docs = await query(
      `
      SELECT doc_type, doc_no, generated_at, generated_by_name
      FROM loan_documents
      WHERE company_id = $1 AND loan_id = $2
      ORDER BY generated_at ASC
      `,
      [scope.companyId, loanId],
    );

    return res.json({
      documents: docs.rows.map((row) => ({
        type: row.doc_type,
        label: formatDocTypeLabel(row.doc_type),
        docNo: row.doc_no,
        generatedAt: row.generated_at,
        generatedByName: row.generated_by_name || "Sistema",
      })),
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/:id/documents/:docType", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para obter documento." });
    const loanId = Number(req.params.id);
    if (!Number.isInteger(loanId)) return res.status(400).json({ message: "ID invalido." });
    const docType = String(req.params.docType || "").trim().toLowerCase();
    if (!LOAN_DOC_TYPES.includes(docType)) {
      return res.status(400).json({ message: "Tipo de documento invalido." });
    }

    const contextResult = await query(
      `
      SELECT
        l.id AS loan_id,
        l.client_id,
        l.contract_no,
        l.product,
        l.principal,
        l.balance,
        l.interest_rate,
        l.administrative_fee_mode,
        l.administrative_fee_rate,
        l.administrative_fee_amount,
        l.disbursement_net_amount,
        l.amortization_method,
        l.payment_frequency,
        l.daily_penalty_rate,
        l.disbursed_on,
        l.next_payment_on,
        l.maturity_on,
        c.name AS client_name,
        c.client_type AS client_type,
        c.nuit AS client_nuit,
        c.phone AS client_phone,
        c.phone_alt AS client_phone_alt,
        c.email AS client_email,
        c.document_type AS client_document_type,
        c.document_number AS client_document_number,
        c.birth_date AS client_birth_date,
        c.marital_status AS client_marital_status,
        c.nationality AS client_nationality,
        c.province AS client_province,
        c.city AS client_city,
        c.district AS client_district,
        c.neighborhood AS client_neighborhood,
        c.address_line AS client_address_line,
        c.house_number AS client_house_number,
        c.occupation AS client_occupation,
        c.employer_name AS client_employer_name,
        c.monthly_income AS client_monthly_income,
        c.monthly_expenses AS client_monthly_expenses,
        c.business_name AS client_business_name,
        c.business_sector AS client_business_sector,
        c.group_name AS client_group_name,
        c.group_description AS client_group_description,
        c.group_leader_name AS client_group_leader_name,
        mu.full_name AS manager_name,
        co.name AS company_name,
        co.legal_name AS company_legal_name,
        co.nuit AS company_nuit,
        co.phone AS company_phone,
        co.email AS company_email,
        co.address AS company_address,
        co.owner_name AS company_owner_name,
        co.owner_nuit AS company_owner_nuit,
        co.owner_phone AS company_owner_phone,
        co.owner_email AS company_owner_email,
        co.owner_document_type AS company_owner_document_type,
        co.owner_document_number AS company_owner_document_number,
        co.owner_address AS company_owner_address,
        co.logo_url AS company_logo_url
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      LEFT JOIN users mu ON mu.id = l.manager_user_id
      JOIN companies co ON co.id = l.company_id
      WHERE l.id = $1 AND l.company_id = $2
      LIMIT 1
      `,
      [loanId, scope.companyId],
    );
    const context = contextResult.rows[0];
    if (!context) return res.status(404).json({ message: "Emprestimo nao encontrado." });

    const docResult = await query(
      `
      SELECT doc_no, generated_at, payload_snapshot
           , generated_by_name
      FROM loan_documents
      WHERE company_id = $1 AND loan_id = $2 AND doc_type = $3
      LIMIT 1
      `,
      [scope.companyId, loanId, docType],
    );
    const doc = docResult.rows[0];
    if (!doc) return res.status(404).json({ message: "Documento nao encontrado para este contrato." });

    const collateralsResult = await query(
      `
      SELECT collateral_type, description, estimated_value, document_ref
      FROM collaterals
      WHERE company_id = $1 AND client_id = $2
      ORDER BY created_at DESC, id DESC
      `,
      [scope.companyId, Number(context.client_id)],
    );

    const guarantorsResult = await query(
      `
      SELECT name, nuit, phone, guaranteed_amount, active_guarantees
      FROM guarantors
      WHERE company_id = $1 AND client_id = $2
      ORDER BY created_at DESC, id DESC
      `,
      [scope.companyId, Number(context.client_id)],
    );

    const installmentsResult = await query(
      `
      SELECT installment_no, due_date AS due_on, payment_amount, principal_amount, interest_amount, balance_after
      FROM loan_installments
      WHERE loan_id = $1
      ORDER BY installment_no ASC, due_on ASC
      `,
      [loanId],
    );

    const loanGroupMembersResult = await query(
      `
      SELECT member_client_id, member_name, allocated_amount, paid_amount, status
      FROM loan_group_member_allocations
      WHERE company_id = $1 AND loan_id = $2
      ORDER BY id ASC
      `,
      [scope.companyId, loanId],
    );

    let groupMembersRows = loanGroupMembersResult.rows;
    if ((!groupMembersRows || groupMembersRows.length === 0) && String(context.client_type || "").toLowerCase() === "grupo") {
      const fallbackGroupMembersResult = await query(
        `
        SELECT member_client_id, member_name, allocation_amount, NULL::numeric AS paid_amount, 'open'::text AS status
        FROM client_group_members
        WHERE company_id = $1 AND group_client_id = $2
        ORDER BY id ASC
        `,
        [scope.companyId, Number(context.client_id)],
      );
      groupMembersRows = fallbackGroupMembersResult.rows;
    }

    const docPayload = doc?.payload_snapshot && typeof doc.payload_snapshot === "object" ? doc.payload_snapshot : {};
    const confissaoPayload = docPayload?.confissao && typeof docPayload.confissao === "object" ? docPayload.confissao : {};
    const reimbursementAccounts =
      confissaoPayload?.reimbursementAccounts
      || confissaoPayload?.contasReembolso
      || docPayload?.reimbursementAccounts
      || docPayload?.contasReembolso
      || [];
    const disbursementAccounts =
      confissaoPayload?.disbursementAccounts
      || confissaoPayload?.contasDesembolso
      || docPayload?.disbursementAccounts
      || docPayload?.contasDesembolso
      || [];

    const html = renderLoanDocumentHtml({
      company: {
        name: context.company_name,
        legal_name: context.company_legal_name,
        nuit: context.company_nuit,
        phone: context.company_phone,
        email: context.company_email,
        address: context.company_address,
        owner_name: context.company_owner_name,
        owner_nuit: context.company_owner_nuit,
        owner_phone: context.company_owner_phone,
        owner_email: context.company_owner_email,
        owner_document_type: context.company_owner_document_type,
        owner_document_number: context.company_owner_document_number,
        owner_address: context.company_owner_address,
        logo_url: context.company_logo_url,
      },
      client: {
        name: context.client_name,
        client_type: context.client_type,
        nuit: context.client_nuit,
        phone: context.client_phone,
        phone_alt: context.client_phone_alt,
        email: context.client_email,
        document_type: context.client_document_type,
        document_number: context.client_document_number,
        birth_date: context.client_birth_date,
        marital_status: context.client_marital_status,
        nationality: context.client_nationality,
        province: context.client_province,
        city: context.client_city,
        district: context.client_district,
        neighborhood: context.client_neighborhood,
        address_line: context.client_address_line,
        house_number: context.client_house_number,
        occupation: context.client_occupation,
        employer_name: context.client_employer_name,
        monthly_income: context.client_monthly_income,
        monthly_expenses: context.client_monthly_expenses,
        business_name: context.client_business_name,
        business_sector: context.client_business_sector,
        group_name: context.client_group_name,
        group_description: context.client_group_description,
        group_leader_name: context.client_group_leader_name,
      },
      loan: {
        contract_no: context.contract_no,
        product: context.product,
        principal: context.principal,
        balance: context.balance,
        interest_rate: context.interest_rate,
        administrative_fee_mode: context.administrative_fee_mode,
        administrative_fee_rate: context.administrative_fee_rate,
        administrative_fee_amount: context.administrative_fee_amount,
        disbursement_net_amount: context.disbursement_net_amount,
        amortization_method: context.amortization_method,
        payment_frequency: context.payment_frequency,
        daily_penalty_rate: context.daily_penalty_rate,
        disbursed_on: context.disbursed_on,
        next_payment_on: context.next_payment_on,
        maturity_on: context.maturity_on,
        manager_name: context.manager_name,
      },
      collaterals: collateralsResult.rows,
      guarantors: guarantorsResult.rows,
      groupMembers: groupMembersRows,
      installments: installmentsResult.rows,
      reimbursementAccounts,
      disbursementAccounts,
      docType,
      generatedAt: doc.generated_at,
      docNo: doc.doc_no,
      generatedByName: doc.generated_by_name || req.user?.name || "Sistema",
      generatedByRole: req.user?.role || "",
    });

    return res.json({
      type: docType,
      label: formatDocTypeLabel(docType),
      docNo: doc.doc_no,
      generatedAt: doc.generated_at,
      contractNo: context.contract_no,
      html,
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/collections/performance-monthly", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar desempenho." });
    const managerFilter = String(req.query.manager || "all").trim();
    const monthCtx = monthContextFromQuery(req.query.month);
    if (isFutureMonthContext(monthCtx)) {
      return res.status(400).json({
        message: `Mes futuro nao disponivel no desempenho. Selecione ate ${currentYearMonthKey()}.`,
      });
    }
    const forceLive = String(req.query.forceLive || "").trim() === "1";

    const closureResult = await query(
      `
      SELECT id, period_month, period_start, period_end, reference_date, snapshot, closed_by_user_id, closed_by_name, closed_at
      FROM collection_performance_month_closures
      WHERE company_id = $1 AND period_month = $2::date
      LIMIT 1
      `,
      [scope.companyId, monthCtx.periodStart],
    );
    const closure = closureResult.rows[0] || null;

    let snapshot;
    let source = "live";
    if (closure && !forceLive) {
      snapshot = filterMonthlyPerformanceSnapshot(closure.snapshot || {}, managerFilter);
      source = "closed";
    } else {
      snapshot = await computeMonthlyPerformanceSnapshot({
        companyId: scope.companyId,
        monthStartIso: monthCtx.periodStart,
        monthEndIso: monthCtx.periodEnd,
        referenceDateIso: monthCtx.referenceDateIso,
      });
      if (String(managerFilter || "").trim().toLowerCase() !== "all") {
        snapshot = filterMonthlyPerformanceSnapshot(snapshot, managerFilter);
      }
    }

    return res.json({
      generatedAt: new Date().toISOString(),
      source,
      month: monthCtx.monthKey,
      monthStart: monthCtx.periodStart,
      monthEnd: monthCtx.periodEnd,
      referenceDate: monthCtx.referenceDateIso,
      isCurrentMonth: monthCtx.isCurrentMonth,
      manager: managerFilter || "all",
      status: closure && !forceLive ? "closed" : "open",
      closure: closure
        ? {
            id: Number(closure.id),
            closedAt: closure.closed_at,
            closedByUserId: closure.closed_by_user_id ? Number(closure.closed_by_user_id) : null,
            closedByName: closure.closed_by_name || "Sistema",
            referenceDate: closure.reference_date,
          }
        : null,
      rows: snapshot.rows || [],
      totals: snapshot.totals || buildMonthlyPerformanceTotals([]),
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.post("/collections/performance-monthly/close", requireAuth, async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para fechar desempenho." });
    if (String(req.user?.role || "").trim().toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Apenas admin pode fechar o mes de desempenho." });
    }
    const monthCtx = monthContextFromQuery(req.body?.month || req.query?.month);
    if (isFutureMonthContext(monthCtx)) {
      return res.status(400).json({
        message: `Nao e permitido fechar mes futuro no desempenho. Selecione ate ${currentYearMonthKey()}.`,
      });
    }
    const snapshot = await computeMonthlyPerformanceSnapshot({
      companyId: scope.companyId,
      monthStartIso: monthCtx.periodStart,
      monthEndIso: monthCtx.periodEnd,
      referenceDateIso: monthCtx.referenceDateIso,
    });
    const actorName = String(req.user?.name || req.user?.fullName || "").trim() || "Sistema";
    const inserted = await query(
      `
      INSERT INTO collection_performance_month_closures (
        company_id, period_month, period_start, period_end, reference_date, snapshot, closed_by_user_id, closed_by_name
      )
      VALUES ($1,$2::date,$3::date,$4::date,$5::date,$6::jsonb,$7,$8)
      ON CONFLICT (company_id, period_month) DO NOTHING
      RETURNING id, closed_at
      `,
      [
        scope.companyId,
        monthCtx.periodStart,
        monthCtx.periodStart,
        monthCtx.periodEnd,
        monthCtx.referenceDateIso,
        JSON.stringify(snapshot),
        Number(req.user?.id) > 0 ? Number(req.user.id) : null,
        actorName,
      ],
    );
    if (!inserted.rows[0]) {
      return res.status(409).json({ message: "Este mes ja foi fechado." });
    }
    return res.status(201).json({
      message: "Mes de desempenho fechado com sucesso.",
      month: monthCtx.monthKey,
      closedAt: inserted.rows[0].closed_at,
      nextMonth: (() => {
        const rawNext = monthContextFromQuery(formatIsoDate(addMonthsPreserveDay(monthCtx.monthStart, 1)).slice(0, 7)).monthKey;
        return rawNext > currentYearMonthKey() ? currentYearMonthKey() : rawNext;
      })(),
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.post("/collections/performance-monthly/reopen", requireAuth, async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para reabrir desempenho." });
    if (String(req.user?.role || "").trim().toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Apenas admin pode reabrir o mes de desempenho." });
    }
    const monthCtx = monthContextFromQuery(req.body?.month || req.query?.month);
    if (isFutureMonthContext(monthCtx)) {
      return res.status(400).json({
        message: `Mes futuro nao disponivel no desempenho. Selecione ate ${currentYearMonthKey()}.`,
      });
    }
    const removed = await query(
      `
      DELETE FROM collection_performance_month_closures
      WHERE company_id = $1 AND period_month = $2::date
      RETURNING id
      `,
      [scope.companyId, monthCtx.periodStart],
    );
    if (!removed.rows[0]) {
      return res.status(404).json({ message: "Nao existe fecho para este mes." });
    }
    return res.json({ message: "Mes reaberto com sucesso.", month: monthCtx.monthKey });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/collections/operations-summary", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar painel operacional." });
    const policy = await getApprovalPolicy(scope.companyId);
    const requestedPeriodDays = Number(req.query.periodDays);
    const periodDays = [7, 14, 30, 60, 90].includes(requestedPeriodDays) ? requestedPeriodDays : 30;
    const productivityDays = [7, 14, 30].includes(requestedPeriodDays) ? requestedPeriodDays : 14;
    const managerFilter = String(req.query.manager || "all").trim();
    const managerEnabled = managerFilter && managerFilter.toLowerCase() !== "all";

    const managerPromiseWhereStats = managerEnabled ? "AND COALESCE(created_by_name, 'Sistema') = $3" : "";
    const managerPromiseWhereCte = managerEnabled ? "AND COALESCE(created_by_name, 'Sistema') = $3" : "";
    const managerInstallmentWhereCte = managerEnabled ? "AND COALESCE(changed_by_name, 'Sistema') = $3" : "";
    const managerRenegWhereCte = managerEnabled ? "AND COALESCE(created_by_name, 'Sistema') = $3" : "";
    const managerPromiseWhereProductivity = managerEnabled ? "AND COALESCE(created_by_name, 'Sistema') = $3" : "";
    const managerInstallmentWhereProductivity = managerEnabled ? "AND COALESCE(changed_by_name, 'Sistema') = $3" : "";
    const managerRenegWhere = managerEnabled ? "AND COALESCE(created_by_name, 'Sistema') = $2" : "";
    const managerKpiParams = managerEnabled ? [scope.companyId, managerFilter] : [scope.companyId];

    const loansResult = await query(
      `
      SELECT
        l.balance,
        l.payment_frequency,
        l.disbursed_on,
        l.daily_penalty_rate,
        l.mora_waived_total,
        COALESCE(dl.days_overdue, 0) AS calc_days_overdue,
        COALESCE(dl.overdue_amount, 0) AS calc_overdue_amount,
        COALESCE(dl.overdue_weighted_amount, 0) AS calc_overdue_weighted_amount
      FROM loans l
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(MAX(CASE
            WHEN li.status <> 'paid'
              AND li.due_date < CURRENT_DATE
              AND ((li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
            THEN (CURRENT_DATE - li.due_date)
            ELSE 0
          END), 0)::INT AS days_overdue,
          COALESCE(SUM(CASE
            WHEN li.status <> 'paid'
              AND li.due_date < CURRENT_DATE
              AND ((li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
            THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
            ELSE 0
          END), 0)::NUMERIC AS overdue_amount,
          COALESCE(SUM(CASE
            WHEN li.status <> 'paid'
              AND li.due_date < CURRENT_DATE
              AND ((li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0)) > 0
            THEN GREATEST(0, (li.principal_amount + li.interest_amount) - COALESCE(li.principal_paid_amount, 0) - COALESCE(li.interest_paid_amount, 0))
              * GREATEST(0, (CURRENT_DATE - li.due_date) - ${FIXED_MORA_GRACE_DAYS})
            ELSE 0
          END), 0)::NUMERIC AS overdue_weighted_amount
        FROM loan_installments li
        WHERE li.loan_id = l.id
      ) dl ON TRUE
      WHERE l.company_id = $1
      `,
      [scope.companyId],
    );

    const bucketMap = {
      "0": { count: 0, balance: 0, mora: 0 },
      "1-30": { count: 0, balance: 0, mora: 0 },
      "31-60": { count: 0, balance: 0, mora: 0 },
      "61-90": { count: 0, balance: 0, mora: 0 },
      "90+": { count: 0, balance: 0, mora: 0 },
    };

    const referenceDateIso = new Date().toISOString().slice(0, 10);
    let overduePortfolio = 0;
    let moraTotal = 0;
    for (const row of loansResult.rows) {
      const balance = Number(row.balance || 0);
      const daysOverdue = Number(row.calc_days_overdue || 0);
      const dailyPenaltyRate = Number(row.daily_penalty_rate || 0);
      const moraWaivedTotal = Number(row.mora_waived_total || 0);
      const overdueAmount = Number(row.calc_overdue_amount || 0);
      const weightedOverdueAmount = Number(row.calc_overdue_weighted_amount || 0);
      const moraEnabled = isMoraEnabledForFrequency(row.payment_frequency, policy);
      const mora = calculateInstallmentsMora(overdueAmount, dailyPenaltyRate, moraWaivedTotal, {
        moraEnabled,
        policySettings: policy,
        daysOverdue,
        weightedOverdueAmount,
        disbursedDate: row.disbursed_on,
        referenceDate: referenceDateIso,
      });
      const bucket = getDelinquencyBucket(daysOverdue);

      bucketMap[bucket].count += 1;
      bucketMap[bucket].balance += balance;
      bucketMap[bucket].mora += mora;
      moraTotal += mora;
      if (daysOverdue > 0) {
        overduePortfolio += overdueAmount;
      }
    }

    const promiseStatsResult = await query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::INT AS active_promises,
        COUNT(*) FILTER (WHERE status = 'broken' AND updated_at >= NOW() - ($1::INT || ' days')::INTERVAL)::INT AS broken_promises_period,
        COUNT(*) FILTER (WHERE status = 'fulfilled' AND updated_at >= NOW() - ($1::INT || ' days')::INTERVAL)::INT AS fulfilled_promises_period
      FROM loan_payment_promises
      WHERE company_id = $2
      ${managerPromiseWhereStats}
      `,
      managerEnabled ? [periodDays, scope.companyId, managerFilter] : [periodDays, scope.companyId],
    );
    const renegotiationStatsResult = await query(
      `
      SELECT COUNT(*)::INT AS pending_renegotiations
      FROM loan_renegotiations
      WHERE company_id = $1 AND status = 'pending'
      ${managerRenegWhere}
      `,
      managerKpiParams,
    );
    const managerResult = await query(
      `
      WITH promise_stats AS (
        SELECT
          COALESCE(created_by_name, 'Sistema') AS actor_name,
          COUNT(*)::INT AS promises_created,
          COUNT(*) FILTER (WHERE status = 'broken' AND updated_at >= NOW() - ($2::INT || ' days')::INTERVAL)::INT AS promises_broken_period,
          COUNT(*) FILTER (WHERE status = 'fulfilled' AND updated_at >= NOW() - ($2::INT || ' days')::INTERVAL)::INT AS promises_fulfilled_period,
          COUNT(*) FILTER (WHERE created_at >= NOW() - ($2::INT || ' days')::INTERVAL)::INT AS promise_actions_period
        FROM loan_payment_promises
        WHERE company_id = $1
        ${managerPromiseWhereCte}
        GROUP BY COALESCE(created_by_name, 'Sistema')
      ),
      installment_stats AS (
        SELECT
          COALESCE(changed_by_name, 'Sistema') AS actor_name,
          COUNT(*) FILTER (WHERE changed_at >= NOW() - ($2::INT || ' days')::INTERVAL)::INT AS installment_actions_period
        FROM loan_installment_audit
        WHERE company_id = $1
        ${managerInstallmentWhereCte}
        GROUP BY COALESCE(changed_by_name, 'Sistema')
      ),
      reneg_stats AS (
        SELECT
          COALESCE(created_by_name, 'Sistema') AS actor_name,
          COUNT(*) FILTER (WHERE created_at >= NOW() - ($2::INT || ' days')::INTERVAL)::INT AS renegotiations_actions_period,
          COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending_renegotiations
        FROM loan_renegotiations
        WHERE company_id = $1
        ${managerRenegWhereCte}
        GROUP BY COALESCE(created_by_name, 'Sistema')
      ),
      actors AS (
        SELECT actor_name FROM promise_stats
        UNION
        SELECT actor_name FROM installment_stats
        UNION
        SELECT actor_name FROM reneg_stats
      )
      SELECT
        a.actor_name,
        COALESCE(p.promises_created, 0)::INT AS promises_created,
        COALESCE(p.promises_broken_period, 0)::INT AS promises_broken_period,
        COALESCE(p.promises_fulfilled_period, 0)::INT AS promises_fulfilled_period,
        COALESCE(r.pending_renegotiations, 0)::INT AS pending_renegotiations,
        (
          COALESCE(p.promise_actions_period, 0)
          + COALESCE(i.installment_actions_period, 0)
          + COALESCE(r.renegotiations_actions_period, 0)
        )::INT AS total_actions_period
      FROM actors a
      LEFT JOIN promise_stats p ON p.actor_name = a.actor_name
      LEFT JOIN installment_stats i ON i.actor_name = a.actor_name
      LEFT JOIN reneg_stats r ON r.actor_name = a.actor_name
      ORDER BY total_actions_period DESC, a.actor_name ASC
      LIMIT 50
      `,
      managerEnabled ? [scope.companyId, periodDays, managerFilter] : [scope.companyId, periodDays],
    );
    const dailyProductivityResult = await query(
      `
      WITH days AS (
        SELECT generate_series(CURRENT_DATE - (($2::INT - 1) || ' days')::INTERVAL, CURRENT_DATE, INTERVAL '1 day')::date AS day
      ),
      promises_created AS (
        SELECT created_at::date AS day, COUNT(*)::INT AS total
        FROM loan_payment_promises
        WHERE company_id = $1
        ${managerPromiseWhereProductivity}
        GROUP BY created_at::date
      ),
      promises_fulfilled AS (
        SELECT updated_at::date AS day, COUNT(*)::INT AS total
        FROM loan_payment_promises
        WHERE company_id = $1 AND status = 'fulfilled'
        ${managerPromiseWhereProductivity}
        GROUP BY updated_at::date
      ),
      promises_broken AS (
        SELECT updated_at::date AS day, COUNT(*)::INT AS total
        FROM loan_payment_promises
        WHERE company_id = $1 AND status = 'broken'
        ${managerPromiseWhereProductivity}
        GROUP BY updated_at::date
      ),
      installments_paid AS (
        SELECT changed_at::date AS day, COUNT(*)::INT AS total
        FROM loan_installment_audit
        WHERE company_id = $1 AND action = 'mark_paid'
        ${managerInstallmentWhereProductivity}
        GROUP BY changed_at::date
      )
      SELECT
        d.day,
        COALESCE(pc.total, 0)::INT AS promises_created,
        COALESCE(pf.total, 0)::INT AS promises_fulfilled,
        COALESCE(pb.total, 0)::INT AS promises_broken,
        COALESCE(ip.total, 0)::INT AS installments_paid
      FROM days d
      LEFT JOIN promises_created pc ON pc.day = d.day
      LEFT JOIN promises_fulfilled pf ON pf.day = d.day
      LEFT JOIN promises_broken pb ON pb.day = d.day
      LEFT JOIN installments_paid ip ON ip.day = d.day
      ORDER BY d.day ASC
      `,
      managerEnabled ? [scope.companyId, productivityDays, managerFilter] : [scope.companyId, productivityDays],
    );

    const promiseStats = promiseStatsResult.rows[0] || {};
    const activePromises = Number(promiseStats.active_promises || 0);
    const brokenPromisesPeriod = Number(promiseStats.broken_promises_period || 0);
    const fulfilledPromisesPeriod = Number(promiseStats.fulfilled_promises_period || 0);
    const brokenDenominator = brokenPromisesPeriod + fulfilledPromisesPeriod;
    const brokenRatePeriod = brokenDenominator > 0 ? round2((brokenPromisesPeriod / brokenDenominator) * 100) : 0;

    const byManager = managerResult.rows.map((row) => ({
      managerName: row.actor_name || "Sistema",
      promisesCreated: Number(row.promises_created || 0),
      promisesBrokenPeriod: Number(row.promises_broken_period || 0),
      promisesFulfilledPeriod: Number(row.promises_fulfilled_period || 0),
      pendingRenegotiations: Number(row.pending_renegotiations || 0),
      totalActionsPeriod: Number(row.total_actions_period || 0),
    }));
    const bucketBreakdown = Object.entries(bucketMap).map(([bucket, values]) => ({
      bucket,
      count: Number(values.count || 0),
      balance: round2(Number(values.balance || 0)),
      mora: round2(Number(values.mora || 0)),
    }));
    const dailyProductivity = dailyProductivityResult.rows.map((row) => ({
      day: row.day,
      promisesCreated: Number(row.promises_created || 0),
      promisesFulfilled: Number(row.promises_fulfilled || 0),
      promisesBroken: Number(row.promises_broken || 0),
      installmentsPaid: Number(row.installments_paid || 0),
    }));

    return res.json({
      generatedAt: new Date().toISOString(),
      filters: {
        periodDays,
        productivityDays,
        manager: managerEnabled ? managerFilter : "all",
      },
      kpis: {
        activePromises,
        brokenPromisesPeriod,
        fulfilledPromisesPeriod,
        brokenRatePeriod,
        pendingRenegotiations: Number(renegotiationStatsResult.rows[0]?.pending_renegotiations || 0),
        overduePortfolio: round2(overduePortfolio),
        moraTotal: round2(moraTotal),
      },
      bucketBreakdown,
      byManager,
      dailyProductivity,
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/:id/installments", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar parcelas." });
    const policy = await getApprovalPolicy(scope.companyId);
    const loanId = Number(req.params.id);
    if (!Number.isInteger(loanId)) {
      return res.status(400).json({ message: "ID invalido." });
    }

    const loanResult = await query(
      `
      SELECT
        l.id,
        l.contract_no,
        l.client_id,
        c.name AS client_name,
        c.client_type
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      WHERE l.id = $1
        AND l.company_id = $2
      `,
      [loanId, scope.companyId],
    );
    if (!loanResult.rows[0]) {
      return res.status(404).json({ message: "Emprestimo nao encontrado." });
    }

    const installmentsResult = await query(
      `
      SELECT
        li.id,
        li.installment_no,
        li.due_date,
        li.payment_amount,
        li.principal_amount,
        li.interest_amount,
        li.principal_paid_amount,
        li.interest_paid_amount,
        li.mora_paid_amount,
        li.balance_after,
        li.status,
        li.paid_at,
        l.daily_penalty_rate,
        l.payment_frequency,
        l.disbursed_on
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      WHERE li.loan_id = $1 AND l.company_id = $2
      ORDER BY li.installment_no ASC
      `,
      [loanId, scope.companyId],
    );

    const installments = installmentsResult.rows.map((row) => {
      const state = computeInstallmentOutstandingState(row, null, policy);
      const vigenteAmount = state.baseRemainingAmount;
      return {
        id: Number(row.id),
        installmentNo: Number(row.installment_no),
        dueDate: row.due_date,
        vigenteAmount,
        paymentAmount: Number(row.payment_amount),
        principalAmount: Number(row.principal_amount),
        interestAmount: Number(row.interest_amount),
        balanceAfter: Number(row.balance_after),
        status: state.computedStatus,
        paidAt: row.paid_at,
        principalPaidAmount: state.principalPaidAmount,
        interestPaidAmount: state.interestPaidAmount,
        moraPaidAmount: state.moraPaidAmount,
        baseRemainingAmount: state.baseRemainingAmount,
        moraOutstandingAmount: state.moraRemainingAmount,
        totalOutstandingAmount: state.totalOutstandingAmount,
      };
    });

    const summary = installments.reduce(
      (acc, installment) => {
        acc.total += 1;
        if (installment.status === "paid") {
          acc.paid += 1;
          acc.paidAmount += installment.paymentAmount;
        } else if (installment.status === "late") {
          acc.late += 1;
          acc.paidAmount += Math.max(0, installment.paymentAmount - (installment.baseRemainingAmount || 0));
          acc.pendingAmount += installment.baseRemainingAmount || installment.paymentAmount;
        } else {
          acc.pending += 1;
          acc.paidAmount += Math.max(0, installment.paymentAmount - (installment.baseRemainingAmount || 0));
          acc.pendingAmount += installment.baseRemainingAmount || installment.paymentAmount;
        }
        return acc;
      },
      { total: 0, paid: 0, pending: 0, late: 0, paidAmount: 0, pendingAmount: 0 },
    );

    const paidAndForgivenTotalsResult = await query(
      `
      SELECT
        COALESCE((
          SELECT SUM(r.principal_applied)
          FROM loan_repayments r
          WHERE r.company_id = $1
            AND r.loan_id = $2
        ), 0)::NUMERIC AS total_paid_principal,
        COALESCE((
          SELECT SUM(CASE WHEN e.event_type = 'abatimento' THEN e.amount ELSE 0 END)
          FROM loan_financial_events e
          WHERE e.company_id = $1
            AND e.loan_id = $2
            AND e.workflow_status IN ('executed', 'approved')
        ), 0)::NUMERIC AS total_forgiven_principal,
        COALESCE((
          SELECT SUM(CASE WHEN e.event_type = 'perdao_mora' THEN e.amount ELSE 0 END)
          FROM loan_financial_events e
          WHERE e.company_id = $1
            AND e.loan_id = $2
            AND e.workflow_status IN ('executed', 'approved')
        ), 0)::NUMERIC AS total_forgiven_mora
      `,
      [scope.companyId, loanId],
    );
    const paidAndForgivenTotals = paidAndForgivenTotalsResult.rows[0] || {};
    const enrichedSummary = {
      ...summary,
      paidPrincipalAmount: Number(paidAndForgivenTotals.total_paid_principal || 0),
      forgivenPrincipalAmount: Number(paidAndForgivenTotals.total_forgiven_principal || 0),
      forgivenMoraAmount: Number(paidAndForgivenTotals.total_forgiven_mora || 0),
    };

    const auditPeriod = ["all", "today", "7d", "30d", "90d"].includes(String(req.query.auditPeriod))
      ? String(req.query.auditPeriod)
      : "all";
    const auditUser = String(req.query.auditUser || "all").trim();
    const auditAction = ["all", "create", "update", "delete", "mark_paid", "manual_status_change"].includes(String(req.query.auditAction))
      ? String(req.query.auditAction)
      : "all";
    const auditSearch = String(req.query.auditSearch || "").trim();
    const contractAuditPage = parsePositiveInt(req.query.contractAuditPage, 1, { min: 1, max: 100000 });
    const installmentAuditPage = parsePositiveInt(req.query.installmentAuditPage, 1, { min: 1, max: 100000 });
    const contractAuditPageSize = parsePositiveInt(req.query.contractAuditPageSize, 10, { min: 1, max: 500 });
    const installmentAuditPageSize = parsePositiveInt(req.query.installmentAuditPageSize, 10, { min: 1, max: 500 });

    const installmentFilter = buildInstallmentAuditFilterSql({
      period: auditPeriod,
      userFilter: auditUser,
      actionFilter: auditAction,
      searchTerm: auditSearch,
    });
    const installmentCountParams = [loanId, scope.companyId, ...installmentFilter.params];
    const installmentCountResult = await query(
      `
      SELECT COUNT(*)::INT AS total
      FROM loan_installment_audit a
      LEFT JOIN users u ON u.id = a.changed_by_user_id
      LEFT JOIN loan_installments li ON li.id = a.installment_id
      WHERE a.loan_id = $1 AND a.company_id = $2
      ${installmentFilter.sql}
      `,
      installmentCountParams,
    );
    const installmentAuditTotal = Number(installmentCountResult.rows[0]?.total || 0);
    const installmentAuditTotalPages = Math.max(1, Math.ceil(installmentAuditTotal / installmentAuditPageSize));
    const safeInstallmentPage = Math.min(installmentAuditPage, installmentAuditTotalPages);
    const installmentOffset = (safeInstallmentPage - 1) * installmentAuditPageSize;

    const installmentDataParams = [...installmentCountParams, installmentAuditPageSize, installmentOffset];
    const installmentLimitPlaceholder = `$${installmentDataParams.length - 1}`;
    const installmentOffsetPlaceholder = `$${installmentDataParams.length}`;
    const auditResult = await query(
      `
      SELECT
        a.id,
        a.installment_id,
        li.installment_no,
        a.previous_status,
        a.new_status,
        a.action,
        a.changed_by_user_id,
        COALESCE(a.changed_by_name, u.full_name, 'Sistema') AS changed_by_name,
        a.changed_at
      FROM loan_installment_audit a
      LEFT JOIN users u ON u.id = a.changed_by_user_id
      LEFT JOIN loan_installments li ON li.id = a.installment_id
      WHERE a.loan_id = $1 AND a.company_id = $2
      ${installmentFilter.sql}
      ORDER BY a.changed_at DESC
      LIMIT ${installmentLimitPlaceholder}
      OFFSET ${installmentOffsetPlaceholder}
      `,
      installmentDataParams,
    );
    const audit = auditResult.rows.map((row) => ({
      id: Number(row.id),
      installmentId: Number(row.installment_id),
      installmentNo: Number(row.installment_no),
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      action: row.action,
      changedByUserId: row.changed_by_user_id ? Number(row.changed_by_user_id) : null,
      changedByName: row.changed_by_name,
      changedAt: row.changed_at,
    }));

    const contractFilter = buildContractAuditFilterSql({
      period: auditPeriod,
      userFilter: auditUser,
      actionFilter: auditAction,
      searchTerm: auditSearch,
    });
    const contractCountParams = [scope.companyId, loanId, loanResult.rows[0].contract_no, ...contractFilter.params];
    const contractCountResult = await query(
      `
      SELECT COUNT(*)::INT AS total
      FROM loan_contract_audit a
      LEFT JOIN users u ON u.id = a.changed_by_user_id
      WHERE a.company_id = $1
        AND (a.loan_id = $2 OR a.contract_no = $3)
      ${contractFilter.sql}
      `,
      contractCountParams,
    );
    const contractAuditTotal = Number(contractCountResult.rows[0]?.total || 0);
    const contractAuditTotalPages = Math.max(1, Math.ceil(contractAuditTotal / contractAuditPageSize));
    const safeContractPage = Math.min(contractAuditPage, contractAuditTotalPages);
    const contractOffset = (safeContractPage - 1) * contractAuditPageSize;

    const contractDataParams = [...contractCountParams, contractAuditPageSize, contractOffset];
    const contractLimitPlaceholder = `$${contractDataParams.length - 1}`;
    const contractOffsetPlaceholder = `$${contractDataParams.length}`;
    const contractAuditResult = await query(
      `
      SELECT
        a.id,
        a.contract_no,
        a.action,
        a.changed_by_user_id,
        COALESCE(a.changed_by_name, u.full_name, 'Sistema') AS changed_by_name,
        a.payload_snapshot,
        a.changed_at
      FROM loan_contract_audit a
      LEFT JOIN users u ON u.id = a.changed_by_user_id
      WHERE a.company_id = $1
        AND (a.loan_id = $2 OR a.contract_no = $3)
      ${contractFilter.sql}
      ORDER BY a.changed_at DESC
      LIMIT ${contractLimitPlaceholder}
      OFFSET ${contractOffsetPlaceholder}
      `,
      contractDataParams,
    );
    const contractAudit = contractAuditResult.rows.map((row) => ({
      id: Number(row.id),
      contractNo: row.contract_no,
      action: row.action,
      changedByUserId: row.changed_by_user_id ? Number(row.changed_by_user_id) : null,
      changedByName: row.changed_by_name,
      payloadSnapshot: row.payload_snapshot || {},
      changedAt: row.changed_at,
    }));

    const isGroupCredit = String(loanResult.rows[0]?.client_type || "").toLowerCase() === "grupo";
    let creditState = {
      enabled: false,
      applicantType: String(loanResult.rows[0]?.client_type || "singular"),
      request: null,
      pedidoRows: [],
      pagamentosRows: [],
      paymentEvents: [],
      vigenteRows: [],
      resumo: {
        totalMembros: 0,
        membrosPagos: 0,
        membrosParciais: 0,
        membrosSemPagamento: 0,
        totalPedido: 0,
        totalPago: 0,
        totalPendenteMembros: 0,
        totalPagoGeral: 0,
        totalPagoPorPessoa: 0,
        totalPagoNaoClassificado: 0,
        hasPagamentoGeral: false,
        hasPagamentoPorPessoa: false,
        hasPagamentoNaoClassificado: false,
        parcelasEmAtraso: 0,
        parcelasPendentes: 0,
      },
    };

    if (isGroupCredit) {
      const requestResult = await query(
        `
        SELECT
          id,
          requested_amount,
          status,
          risk_level,
          payload,
          created_at,
          updated_at,
          created_by_name,
          analyst_decision_by_name,
          manager_decision_by_name,
          final_decision_by_name
        FROM loan_approval_requests
        WHERE company_id = $1
          AND generated_loan_id = $2
        ORDER BY id DESC
        LIMIT 1
        `,
        [scope.companyId, loanId],
      );
      const requestRow = requestResult.rows[0] || null;
      const requestPayload = requestRow?.payload || {};

      const allocationsResult = await query(
        `
        SELECT
          id,
          member_client_id,
          member_name,
          allocated_amount,
          paid_amount,
          status
        FROM loan_group_member_allocations
        WHERE company_id = $1
          AND loan_id = $2
        ORDER BY id ASC
        `,
        [scope.companyId, loanId],
      );

      const paymentEventsResult = await query(
        `
        SELECT
          id,
          payment_date,
          amount_received,
          amount_applied,
          unapplied_amount,
          allocation_mode,
          note,
          created_by_name,
          created_at
        FROM loan_repayments
        WHERE company_id = $1
          AND loan_id = $2
        ORDER BY payment_date DESC, id DESC
        LIMIT 200
        `,
        [scope.companyId, loanId],
      );

      const pedidoRows = allocationsResult.rows.map((row) => ({
        allocationId: Number(row.id),
        memberClientId: row.member_client_id ? Number(row.member_client_id) : null,
        memberName: row.member_name || "",
        requestedAmount: round2(Number(row.allocated_amount || 0)),
      }));

      const pagamentosRows = allocationsResult.rows.map((row) => {
        const allocatedAmount = round2(Number(row.allocated_amount || 0));
        const paidAmount = round2(Number(row.paid_amount || 0));
        return {
          allocationId: Number(row.id),
          memberClientId: row.member_client_id ? Number(row.member_client_id) : null,
          memberName: row.member_name || "",
          allocatedAmount,
          paidAmount,
          remainingAmount: round2(Math.max(0, allocatedAmount - paidAmount)),
          status: row.status || "open",
        };
      });

      const paymentEvents = paymentEventsResult.rows.map((row) => {
        const decoded = decodeGroupPaymentModeNote(row.note || "");
        return {
          id: Number(row.id),
          paymentDate: row.payment_date,
          amountReceived: round2(Number(row.amount_received || 0)),
          amountApplied: round2(Number(row.amount_applied || 0)),
          unappliedAmount: round2(Number(row.unapplied_amount || 0)),
          allocationMode: row.allocation_mode || "loan",
          groupPaymentMode: decoded.groupPaymentMode || "unknown",
          note: decoded.note || "",
          createdByName: row.created_by_name || "Sistema",
          createdAt: row.created_at,
        };
      });

      const vigenteRows = installments
        .filter((item) => item.status !== "paid")
        .map((item) => ({
          installmentId: Number(item.id),
          installmentNo: Number(item.installmentNo),
          dueDate: item.dueDate,
          vigenteAmount: round2(Number(item.vigenteAmount ?? item.baseRemainingAmount ?? 0)),
          paymentAmount: round2(Number(item.paymentAmount || 0)),
          status: item.status,
          paidAt: item.paidAt || null,
        }));

      const totalPedido = round2(pedidoRows.reduce((sum, row) => sum + Number(row.requestedAmount || 0), 0));
      const totalPago = round2(pagamentosRows.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0));
      const totalPendenteMembros = round2(
        pagamentosRows.reduce((sum, row) => sum + Number(row.remainingAmount || 0), 0),
      );
      const totalPagoGeral = round2(
        paymentEvents
          .filter((row) => row.groupPaymentMode === "general")
          .reduce((sum, row) => sum + Number(row.amountApplied || 0), 0),
      );
      const totalPagoPorPessoa = round2(
        paymentEvents
          .filter((row) => row.groupPaymentMode === "individual")
          .reduce((sum, row) => sum + Number(row.amountApplied || 0), 0),
      );
      const totalPagoNaoClassificado = round2(
        paymentEvents
          .filter((row) => row.groupPaymentMode !== "general" && row.groupPaymentMode !== "individual")
          .reduce((sum, row) => sum + Number(row.amountApplied || 0), 0),
      );
      const membrosPagos = pagamentosRows.filter((row) => row.status === "paid").length;
      const membrosParciais = pagamentosRows.filter((row) => row.status === "partial").length;
      const membrosSemPagamento = pagamentosRows.filter((row) => row.status === "open").length;
      const parcelasEmAtraso = vigenteRows.filter((row) => row.status === "late").length;
      const parcelasPendentes = vigenteRows.filter((row) => row.status === "pending").length;

      creditState = {
        enabled: true,
        applicantType: "grupo",
        request: requestRow
          ? {
            id: Number(requestRow.id),
            requestedAmount: round2(Number(requestRow.requested_amount || 0)),
            status: requestRow.status || "",
            riskLevel: requestRow.risk_level || "",
            product: String(requestPayload?.product || ""),
            createdAt: requestRow.created_at,
            updatedAt: requestRow.updated_at,
            createdByName: requestRow.created_by_name || "Sistema",
            analystDecisionByName: requestRow.analyst_decision_by_name || "",
            managerDecisionByName: requestRow.manager_decision_by_name || "",
            finalDecisionByName: requestRow.final_decision_by_name || "",
          }
          : null,
        pedidoRows,
        pagamentosRows,
        paymentEvents,
        vigenteRows,
        resumo: {
          totalMembros: pagamentosRows.length,
          membrosPagos,
          membrosParciais,
          membrosSemPagamento,
          totalPedido,
          totalPago,
          totalPendenteMembros,
          totalPagoGeral,
          totalPagoPorPessoa,
          totalPagoNaoClassificado,
          hasPagamentoGeral: totalPagoGeral > 0,
          hasPagamentoPorPessoa: totalPagoPorPessoa > 0 || totalPago > 0,
          hasPagamentoNaoClassificado: totalPagoNaoClassificado > 0,
          parcelasEmAtraso,
          parcelasPendentes,
        },
      };
    }

    return res.json({
      loanId,
      contractNo: loanResult.rows[0].contract_no,
      summary: enrichedSummary,
      installments,
      audit,
      contractAudit,
      creditState,
      contractAuditPagination: {
        page: safeContractPage,
        pageSize: contractAuditPageSize,
        total: contractAuditTotal,
        totalPages: contractAuditTotalPages,
      },
      installmentAuditPagination: {
        page: safeInstallmentPage,
        pageSize: installmentAuditPageSize,
        total: installmentAuditTotal,
        totalPages: installmentAuditTotalPages,
      },
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/:id/collections", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar cobranca." });
    const policy = await getApprovalPolicy(scope.companyId);
    const loanId = Number(req.params.id);
    if (!Number.isInteger(loanId)) {
      return res.status(400).json({ message: "ID invalido." });
    }

    const loan = await getLoanByIdForCompany(loanId, scope.companyId);
    if (!loan) {
      return res.status(404).json({ message: "Emprestimo nao encontrado." });
    }

    const promisesResult = await query(
      `
      SELECT id, promised_for, promised_amount, status, note, created_by_user_id, created_by_name, created_at, updated_at
      FROM loan_payment_promises
      WHERE company_id = $1 AND loan_id = $2
      ORDER BY promised_for DESC, created_at DESC
      `,
      [scope.companyId, loanId],
    );
    const renegotiationsResult = await query(
      `
      SELECT id, reason, old_terms, proposed_terms, status, note, created_by_user_id, created_by_name, created_at, updated_at
      FROM loan_renegotiations
      WHERE company_id = $1 AND loan_id = $2
      ORDER BY created_at DESC
      `,
      [scope.companyId, loanId],
    );
    const financialEventsResult = await query(
      `
      SELECT
        id, event_type, amount, note, payload, before_snapshot, after_snapshot, workflow_status,
        reviewed_by_user_id, reviewed_by_name, reviewed_at, review_note,
        created_by_user_id, created_by_name, created_at
      FROM loan_financial_events
      WHERE company_id = $1 AND loan_id = $2
      ORDER BY created_at DESC
      LIMIT 300
      `,
      [scope.companyId, loanId],
    );
    const paidAndForgivenTotalsResult = await query(
      `
      SELECT
        COALESCE((
          SELECT SUM(r.principal_applied)
          FROM loan_repayments r
          WHERE r.company_id = $1
            AND r.loan_id = $2
        ), 0)::NUMERIC AS total_paid_principal,
        COALESCE((
          SELECT SUM(CASE WHEN e.event_type = 'abatimento' THEN e.amount ELSE 0 END)
          FROM loan_financial_events e
          WHERE e.company_id = $1
            AND e.loan_id = $2
            AND e.workflow_status IN ('executed', 'approved')
        ), 0)::NUMERIC AS total_forgiven_principal,
        COALESCE((
          SELECT SUM(CASE WHEN e.event_type = 'perdao_mora' THEN e.amount ELSE 0 END)
          FROM loan_financial_events e
          WHERE e.company_id = $1
            AND e.loan_id = $2
            AND e.workflow_status IN ('executed', 'approved')
        ), 0)::NUMERIC AS total_forgiven_mora
      `,
      [scope.companyId, loanId],
    );
    const paidAndForgivenTotals = paidAndForgivenTotalsResult.rows[0] || {};

    const delinquency = await fetchLoanDelinquencyMetrics(null, loanId);
    const daysOverdue = Number(delinquency.daysOverdue || 0);
    const balance = Number(loan.balance);
    const dailyPenaltyRate = Number(loan.daily_penalty_rate);
    const moraWaivedTotal = Number(loan.mora_waived_total || 0);
    const moraEnabled = isMoraEnabledForFrequency(loan.payment_frequency, policy);
    const referenceDateIso = new Date().toISOString().slice(0, 10);
    const moraAccrued = calculateInstallmentsMora(delinquency.overdueAmount, dailyPenaltyRate, moraWaivedTotal, {
      moraEnabled,
      policySettings: policy,
      daysOverdue,
      weightedOverdueAmount: Number(delinquency.overdueWeightedAmount || 0),
      disbursedDate: loan.disbursed_on,
      referenceDate: referenceDateIso,
    });
    const dailyMora = calculateInstallmentsMora(delinquency.overdueAmount, dailyPenaltyRate, 0, {
      moraEnabled,
      policySettings: { moraDailyEnabled: true, moraWeeklyEnabled: false, moraMonthlyEnabled: false },
      daysOverdue,
      weightedOverdueAmount: Number(delinquency.overdueWeightedAmount || 0),
      disbursedDate: loan.disbursed_on,
      referenceDate: referenceDateIso,
    });
    const delinquencyBucket = getDelinquencyBucket(daysOverdue);
    const collectionStage = getCollectionStage(daysOverdue);

    const promises = promisesResult.rows.map((row) => ({
      id: Number(row.id),
      promisedFor: row.promised_for,
      promisedAmount: Number(row.promised_amount),
      status: row.status,
      note: row.note || "",
      createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
      createdByName: row.created_by_name || "Sistema",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    const renegotiations = renegotiationsResult.rows.map((row) => ({
      id: Number(row.id),
      reason: row.reason,
      oldTerms: row.old_terms || {},
      proposedTerms: row.proposed_terms || {},
      status: row.status,
      note: row.note || "",
      createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
      createdByName: row.created_by_name || "Sistema",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    const financialEvents = financialEventsResult.rows.map((row) => ({
      id: Number(row.id),
      eventType: row.event_type,
      amount: row.amount !== null ? Number(row.amount) : null,
      workflowStatus: row.workflow_status || "executed",
      reviewedByUserId: row.reviewed_by_user_id ? Number(row.reviewed_by_user_id) : null,
      reviewedByName: row.reviewed_by_name || null,
      reviewedAt: row.reviewed_at,
      reviewNote: row.review_note || "",
      note: row.note || "",
      payload: row.payload || {},
      beforeSnapshot: row.before_snapshot || {},
      afterSnapshot: row.after_snapshot || {},
      createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
      createdByName: row.created_by_name || "Sistema",
      createdAt: row.created_at,
    }));

    return res.json({
      loan: {
        id: Number(loan.id),
        contractNo: loan.contract_no,
        balance,
        administrativeFeeMode: normalizeAdministrativeFeeMode(loan.administrative_fee_mode),
        administrativeFeeRate: Number(loan.administrative_fee_rate || ADMINISTRATIVE_FEE_RATE_PERCENT),
        administrativeFeeAmount: Number(loan.administrative_fee_amount || 0),
        disbursementNetAmount: Number(
          loan.disbursement_net_amount
          || calculateDisbursementNetAmount(loan.principal, loan.administrative_fee_amount || 0),
        ),
        daysOverdue,
        dailyPenaltyRate,
        moraWaivedTotal,
        moraAccrued,
        dailyMora,
        moraEnabledForFrequency: moraEnabled,
        totalPaidPrincipal: Number(paidAndForgivenTotals.total_paid_principal || 0),
        totalForgivenPrincipal: Number(paidAndForgivenTotals.total_forgiven_principal || 0),
        totalForgivenMora: Number(paidAndForgivenTotals.total_forgiven_mora || 0),
        delinquencyBucket,
        collectionStage,
      },
      promises,
      renegotiations,
      financialEvents,
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.patch("/:id/financial-events/:eventId/review", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para revisar evento financeiro." });
    const loanId = Number(req.params.id);
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(loanId) || !Number.isInteger(eventId)) {
      return res.status(400).json({ message: "Identificadores invalidos." });
    }

    const userRole = String(req.user?.role || "").trim().toLowerCase();
    const isPrivileged = userRole === "admin" || userRole === "manager";
    if (!isPrivileged) {
      return res.status(403).json({ message: "Apenas manager ou admin podem revisar reestruturacao." });
    }

    const decision = String(req.body?.decision || "").trim().toLowerCase();
    const reviewNote = String(req.body?.reviewNote || "").trim();
    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ message: "Decisao invalida. Use approve ou reject." });
    }
    if (!reviewNote) {
      return res.status(400).json({ message: "Justificativa da revisao e obrigatoria." });
    }

    const result = await withTransaction(async (dbClient) => {
      const eventResult = await dbClient.query(
        `
        SELECT id, event_type, payload, before_snapshot, workflow_status, created_by_user_id, created_by_name
        FROM loan_financial_events
        WHERE id = $1 AND loan_id = $2 AND company_id = $3
        FOR UPDATE
        `,
        [eventId, loanId, scope.companyId],
      );
      const event = eventResult.rows[0];
      if (!event) return { error: { status: 404, message: "Evento financeiro nao encontrado." } };
      if (event.event_type !== "reestruturacao_contrato") {
        return { error: { status: 400, message: "Apenas reestruturacao exige revisao em duas etapas." } };
      }
      if (event.workflow_status !== "pending") {
        return { error: { status: 400, message: "Evento ja revisado." } };
      }
      if (Number(event.created_by_user_id || 0) === Number(req.user?.sub || 0)) {
        return { error: { status: 403, message: "O solicitante nao pode aprovar a propria reestruturacao." } };
      }

      const loanResult = await dbClient.query(
        `
        SELECT id, contract_no, balance, interest_rate, daily_penalty_rate, amortization_method, payment_frequency
        FROM loans
        WHERE id = $1 AND company_id = $2
        FOR UPDATE
        `,
        [loanId, scope.companyId],
      );
      const loan = loanResult.rows[0];
      if (!loan) return { error: { status: 404, message: "Emprestimo nao encontrado." } };

      if (decision === "reject") {
        await dbClient.query(
          `
          UPDATE loan_financial_events
          SET workflow_status = 'rejected',
              reviewed_by_user_id = $1,
              reviewed_by_name = $2,
              reviewed_at = NOW(),
              review_note = $3
          WHERE id = $4
          `,
          [Number(req.user?.sub) || null, req.user?.name || null, reviewNote, eventId],
        );
        await insertLoanContractAudit(dbClient, {
          companyId: scope.companyId,
          loanId,
          contractNo: loan.contract_no,
          action: "update",
          actorUserId: Number(req.user?.sub) || null,
          actorName: req.user?.name || null,
          payloadSnapshot: {
            reason: "reestruturacao_contrato_rejeitada",
            eventId,
            reviewNote,
            requestedBy: event.created_by_name || null,
            payload: event.payload || {},
          },
        });
        return { rejected: true };
      }

      const payload = event.payload || {};
      const proposedRate = payload?.rate !== undefined ? Number(payload.rate) : Number(loan.interest_rate);
      const proposedDailyPenaltyRate = payload?.dailyPenaltyRate !== undefined ? Number(payload.dailyPenaltyRate) : Number(loan.daily_penalty_rate);
      const proposedMethod = String(payload?.amortizationMethod || loan.amortization_method).toLowerCase();
      const proposedFrequency = String(payload?.paymentFrequency || loan.payment_frequency).toLowerCase();
      const proposedNextPayment = String(payload?.nextPaymentOn || "").trim();
      const proposedMaturity = String(payload?.maturityOn || "").trim();
      if (!parseIsoDate(proposedNextPayment) || !parseIsoDate(proposedMaturity)) {
        return { error: { status: 400, message: "Reestruturacao pendente esta com datas invalidas." } };
      }
      if (!AMORTIZATION_METHODS.includes(proposedMethod) || !PAYMENT_FREQUENCIES.includes(proposedFrequency)) {
        return { error: { status: 400, message: "Parametros de reestruturacao invalidos." } };
      }

      const todayIso = new Date().toISOString().slice(0, 10);
      const restructureData = {
        amount: Number(loan.balance),
        rate: proposedRate,
        amortizationMethod: proposedMethod,
        paymentFrequency: proposedFrequency,
        disbursed: todayIso,
        nextPayment: proposedNextPayment,
        maturity: proposedMaturity,
      };
      const schedule = buildInstallments(restructureData);
      if (!schedule.valid) {
        return { error: { status: 400, message: schedule.message } };
      }

      await dbClient.query(
        `
        UPDATE loans
        SET principal = $1,
            interest_rate = $2,
            daily_penalty_rate = $3,
            amortization_method = $4,
            payment_frequency = $5,
            disbursed_on = $6,
            next_payment_on = $7,
            maturity_on = $8,
            days_overdue = 0,
            status = 'active'
        WHERE id = $9 AND company_id = $10
        `,
        [
          Number(loan.balance),
          proposedRate,
          proposedDailyPenaltyRate,
          proposedMethod,
          proposedFrequency,
          todayIso,
          proposedNextPayment,
          proposedMaturity,
          loanId,
          scope.companyId,
        ],
      );
      await replaceLoanInstallments(dbClient, loanId, schedule.rows);
      await syncLoanDelinquencyState(dbClient, loanId, scope.companyId);

      const afterSnapshot = {
        principal: Number(loan.balance),
        balance: Number(loan.balance),
        interestRate: proposedRate,
        dailyPenaltyRate: proposedDailyPenaltyRate,
        amortizationMethod: proposedMethod,
        paymentFrequency: proposedFrequency,
        disbursedOn: todayIso,
        maturityOn: proposedMaturity,
        nextPaymentOn: proposedNextPayment,
        daysOverdue: 0,
        status: "active",
      };

      await dbClient.query(
        `
        UPDATE loan_financial_events
        SET workflow_status = 'executed',
            reviewed_by_user_id = $1,
            reviewed_by_name = $2,
            reviewed_at = NOW(),
            review_note = $3,
            after_snapshot = $4::jsonb
        WHERE id = $5
        `,
        [Number(req.user?.sub) || null, req.user?.name || null, reviewNote, JSON.stringify(afterSnapshot), eventId],
      );

      await insertLoanContractAudit(dbClient, {
        companyId: scope.companyId,
        loanId,
        contractNo: loan.contract_no,
        action: "update",
        actorUserId: Number(req.user?.sub) || null,
        actorName: req.user?.name || null,
        payloadSnapshot: {
          reason: "reestruturacao_contrato_aprovada",
          eventId,
          reviewNote,
          beforeSnapshot: event.before_snapshot || {},
          afterSnapshot,
          payload,
        },
      });

      return { approved: true };
    });

    if (result?.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    if (result?.rejected) {
      return res.json({ message: "Reestruturacao rejeitada com sucesso." });
    }
    return res.json({ message: "Reestruturacao aprovada e executada com sucesso." });
  } catch (error) {
    return next(error);
  }
});

loanRouter.post("/:id/financial-events", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para registrar evento financeiro." });
    const loanId = Number(req.params.id);
    if (!Number.isInteger(loanId)) {
      return res.status(400).json({ message: "ID invalido." });
    }

    const eventType = String(req.body?.eventType || "").trim().toLowerCase();
    const amount = req.body?.amount !== undefined ? Number(req.body.amount) : null;
    const note = String(req.body?.note || "").trim();
    const payloadInput = typeof req.body?.payload === "object" && req.body?.payload ? req.body.payload : {};
    const eventDateRaw = String(req.body?.eventDate || payloadInput?.eventDate || "").trim();
    const parsedEventDate = eventDateRaw ? parseIsoDate(eventDateRaw) : null;
    if (eventDateRaw && !parsedEventDate) {
      return res.status(400).json({ message: "Data do evento invalida. Use formato YYYY-MM-DD." });
    }
    const eventDateIso = parsedEventDate ? formatIsoDate(parsedEventDate) : new Date().toISOString().slice(0, 10);
    const payload = {
      ...(payloadInput || {}),
      eventDate: eventDateIso,
    };
    if (!FINANCIAL_EVENT_TYPES.includes(eventType)) {
      return res.status(400).json({ message: "Tipo de evento financeiro invalido." });
    }
    if (eventType === "mora") {
      return res.status(400).json({ message: "Evento de mora e contabilizado automaticamente pelo modulo contabil." });
    }
    const userRole = String(req.user?.role || "").trim().toLowerCase();
    const isPrivileged = userRole === "admin" || userRole === "manager";
    const actor = {
      userId: Number(req.user?.sub) || null,
      name: req.user?.name || null,
    };
    const estornoModeRaw = String(payload?.estornoMode || "").trim().toLowerCase();
    const estornoMode = estornoModeRaw === "estorno_and_pay" ? "estorno_and_pay" : "estorno_only";
    const destinationClientIdRaw = payload?.destinationClientId;
    const destinationLoanIdRaw = payload?.destinationLoanId;
    const destinationClientId = destinationClientIdRaw === null || destinationClientIdRaw === undefined || String(destinationClientIdRaw).trim() === ""
      ? null
      : Number(destinationClientIdRaw);
    const destinationLoanId = destinationLoanIdRaw === null || destinationLoanIdRaw === undefined || String(destinationLoanIdRaw).trim() === ""
      ? null
      : Number(destinationLoanIdRaw);
    const requiresTransferPayment = eventType === "estorno" && estornoMode === "estorno_and_pay";
    if (["liquidacao_antecipada", "reestruturacao_contrato"].includes(eventType) && !isPrivileged) {
      return res.status(403).json({ message: "Apenas manager ou admin podem executar este evento financeiro." });
    }
    if (["liquidacao_antecipada", "reestruturacao_contrato"].includes(eventType) && !note) {
      return res.status(400).json({ message: "Justificativa obrigatoria para liquidacao antecipada e reestruturacao." });
    }
    if (requiresTransferPayment && (!Number.isInteger(destinationClientId) || destinationClientId <= 0)) {
      return res.status(400).json({ message: "Estorno com pagamento imediato exige cliente de destino valido." });
    }
    if (requiresTransferPayment && destinationLoanId !== null && (!Number.isInteger(destinationLoanId) || destinationLoanId <= 0)) {
      return res.status(400).json({ message: "Contrato de destino invalido para pagamento imediato." });
    }

    const result = await withTransaction(async (dbClient) => {
      const loanResult = await dbClient.query(
        `
        SELECT id, contract_no, company_id, client_id, product, principal, balance, interest_rate, daily_penalty_rate, mora_waived_total,
               amortization_method, payment_frequency, disbursed_on, maturity_on, next_payment_on, days_overdue, status
        FROM loans
        WHERE id = $1 AND company_id = $2
        FOR UPDATE
        `,
        [loanId, scope.companyId],
      );
      const loan = loanResult.rows[0];
      if (!loan) {
        return { error: { status: 404, message: "Emprestimo nao encontrado." } };
      }

      const beforeSnapshot = {
        principal: Number(loan.principal),
        balance: Number(loan.balance),
        interestRate: Number(loan.interest_rate),
        dailyPenaltyRate: Number(loan.daily_penalty_rate),
        moraWaivedTotal: Number(loan.mora_waived_total || 0),
        amortizationMethod: loan.amortization_method,
        paymentFrequency: loan.payment_frequency,
        disbursedOn: loan.disbursed_on,
        maturityOn: loan.maturity_on,
        nextPaymentOn: loan.next_payment_on,
        daysOverdue: Number(loan.days_overdue),
        status: loan.status,
      };

      let nextPrincipal = Number(loan.principal);
      let nextBalance = Number(loan.balance);
      let nextRate = Number(loan.interest_rate);
      let nextDailyPenaltyRate = Number(loan.daily_penalty_rate);
      let nextMoraWaivedTotal = Number(loan.mora_waived_total || 0);
      let nextAmortizationMethod = loan.amortization_method;
      let nextPaymentFrequency = loan.payment_frequency;
      let nextDisbursedOn = loan.disbursed_on;
      let nextMaturityOn = loan.maturity_on;
      let nextPaymentOn = loan.next_payment_on;
      let nextDaysOverdue = Number(loan.days_overdue);
      let nextStatus = loan.status;

      if (eventType === "reestruturacao_contrato") {
        const proposedRate = payload?.rate !== undefined ? Number(payload.rate) : nextRate;
        const proposedDailyPenaltyRate = payload?.dailyPenaltyRate !== undefined ? Number(payload.dailyPenaltyRate) : nextDailyPenaltyRate;
        const proposedMethod = String(payload?.amortizationMethod || nextAmortizationMethod).toLowerCase();
        const proposedFrequency = String(payload?.paymentFrequency || nextPaymentFrequency).toLowerCase();
        const proposedNextPayment = String(payload?.nextPaymentOn || "").trim();
        const proposedMaturity = String(payload?.maturityOn || "").trim();
        if (!parseIsoDate(proposedNextPayment) || !parseIsoDate(proposedMaturity)) {
          return { error: { status: 400, message: "Reestruturacao exige nextPaymentOn e maturityOn validos." } };
        }
        if (!AMORTIZATION_METHODS.includes(proposedMethod)) {
          return { error: { status: 400, message: "Metodo de amortizacao invalido para reestruturacao." } };
        }
        if (!PAYMENT_FREQUENCIES.includes(proposedFrequency)) {
          return { error: { status: 400, message: "Frequencia invalida para reestruturacao." } };
        }
        if (!Number.isFinite(proposedRate) || proposedRate < 0 || proposedRate > 100) {
          return { error: { status: 400, message: "Taxa de juro invalida para reestruturacao." } };
        }
        if (!Number.isFinite(proposedDailyPenaltyRate) || proposedDailyPenaltyRate < 0 || proposedDailyPenaltyRate > 100) {
          return { error: { status: 400, message: "Taxa diaria de mora invalida para reestruturacao." } };
        }

        const eventInserted = await dbClient.query(
          `
          INSERT INTO loan_financial_events (
            company_id, loan_id, event_type, amount, note, payload, before_snapshot, after_snapshot, workflow_status, created_by_user_id, created_by_name
          )
          VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,'pending',$9,$10)
          RETURNING id
          `,
          [
            scope.companyId,
            loanId,
            eventType,
            amount,
            note || null,
            JSON.stringify(payload || {}),
            JSON.stringify(beforeSnapshot),
            JSON.stringify(beforeSnapshot),
            actor.userId || null,
            actor.name || null,
          ],
        );
        await insertLoanContractAudit(dbClient, {
          companyId: scope.companyId,
          loanId,
          contractNo: loan.contract_no,
          action: "update",
          actorUserId: actor.userId || null,
          actorName: actor.name || null,
          payloadSnapshot: {
            reason: "reestruturacao_contrato_solicitada",
            eventId: Number(eventInserted.rows[0].id),
            note: note || null,
            payload: payload || {},
            beforeSnapshot,
          },
        });
        return { id: Number(eventInserted.rows[0].id), pending: true };
      }

      if (["estorno", "abatimento", "capitalizacao", "perdao_mora"].includes(eventType)) {
        if (!Number.isFinite(amount) || amount <= 0) {
          return { error: { status: 400, message: "Valor do evento deve ser maior que zero." } };
        }
      }

      let appliedAmount = round2(Number(amount || 0));
      let transferResult = null;

      if (eventType === "estorno") {
        const policy = await getApprovalPolicy(scope.companyId);
        const estornoAllocation = await applyPrincipalReversalToLoanInstallments(dbClient, {
          scope,
          loanId,
          amount: appliedAmount,
          eventDateIso,
          policy,
          actor,
          auditAction: "estorno_event",
        });
        appliedAmount = round2(Number(estornoAllocation.applied || 0));
        if (appliedAmount <= 0.009) {
          return { error: { status: 409, message: "Nao existem pagamentos de capital reversiveis no contrato selecionado." } };
        }
        nextBalance = round2(Math.max(0, nextBalance + appliedAmount));
      }

      if (eventType === "abatimento") {
        if (appliedAmount < nextBalance - 0.01) {
          return { error: { status: 400, message: "Abatimento deve cobrir todo o saldo para liquidar o credito." } };
        }
        const abatimentoSettlement = await settleLoanInstallmentsAsPaidByAbatimento(dbClient, {
          scope,
          loanId,
          eventDateIso,
          actor,
        });
        appliedAmount = round2(Number(abatimentoSettlement.forgivenPrincipal || nextBalance));
        nextBalance = 0;
        nextDaysOverdue = 0;
        nextStatus = "active";
        nextPaymentOn = eventDateIso;
      }

      if (eventType === "capitalizacao") {
        const policy = await getApprovalPolicy(scope.companyId);
        const capitalization = await applyCapitalizacaoToLoanInstallments(dbClient, {
          scope,
          loanId,
          amount: appliedAmount,
          eventDateIso,
          policy,
          actor,
        });
        const appliedCapitalization = round2(Number(capitalization.applied || appliedAmount));
        appliedAmount = appliedCapitalization;
        nextBalance = round2(nextBalance + appliedCapitalization);
      }

      if (eventType === "perdao_mora") {
        const policy = await getApprovalPolicy(scope.companyId);
        const moraForgiveness = await applyMoraForgivenessToLoanInstallments(dbClient, {
          scope,
          loanId,
          amount: appliedAmount,
          eventDateIso,
          policy,
          actor,
        });
        const appliedForgiveness = round2(Number(moraForgiveness.applied || 0));
        if (appliedForgiveness <= 0.009) {
          return { error: { status: 409, message: "Nao existe mora elegivel para perdao no contrato selecionado." } };
        }
        appliedAmount = appliedForgiveness;
        nextMoraWaivedTotal = round2(nextMoraWaivedTotal + appliedForgiveness);
      }

      if (eventType === "liquidacao_antecipada") {
        nextBalance = 0;
        nextDaysOverdue = 0;
        nextStatus = "active";
        const todayIso = new Date().toISOString().slice(0, 10);
        nextPaymentOn = todayIso;
        await dbClient.query(
          `
          UPDATE loan_installments
          SET status = 'paid', paid_at = COALESCE(paid_at, NOW())
          WHERE loan_id = $1 AND status <> 'paid'
          `,
          [loanId],
        );
      }

      if (eventType !== "reestruturacao_contrato") {
        const synced = await fetchLoanDelinquencyMetrics(dbClient, loanId);
        nextDaysOverdue = Number(synced.daysOverdue || 0);
        nextStatus = deriveLoanStatus(nextDaysOverdue);
      }


      await dbClient.query(
        `
        UPDATE loans
        SET principal = $1,
            balance = $2,
            interest_rate = $3,
            daily_penalty_rate = $4,
            mora_waived_total = $5,
            amortization_method = $6,
            payment_frequency = $7,
            disbursed_on = $8,
            maturity_on = $9,
            next_payment_on = $10,
            days_overdue = $11,
            status = $12
        WHERE id = $13 AND company_id = $14
        `,
        [
          nextPrincipal,
          nextBalance,
          nextRate,
          nextDailyPenaltyRate,
          nextMoraWaivedTotal,
          nextAmortizationMethod,
          nextPaymentFrequency,
          nextDisbursedOn,
          nextMaturityOn,
          nextPaymentOn,
          nextDaysOverdue,
          nextStatus,
          loanId,
          scope.companyId,
        ],
      );

      const afterSnapshot = {
        principal: nextPrincipal,
        balance: nextBalance,
        interestRate: nextRate,
        dailyPenaltyRate: nextDailyPenaltyRate,
        moraWaivedTotal: nextMoraWaivedTotal,
        amortizationMethod: nextAmortizationMethod,
        paymentFrequency: nextPaymentFrequency,
        disbursedOn: nextDisbursedOn,
        maturityOn: nextMaturityOn,
        nextPaymentOn: nextPaymentOn,
        daysOverdue: nextDaysOverdue,
        status: nextStatus,
      };

      const eventInserted = await dbClient.query(
        `
        INSERT INTO loan_financial_events (
          company_id, loan_id, event_type, amount, note, payload, before_snapshot, after_snapshot, created_by_user_id, created_by_name
        )
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)
        RETURNING id
        `,
        [
          scope.companyId,
          loanId,
          eventType,
          appliedAmount,
          note || null,
            JSON.stringify(payload || {}),
            JSON.stringify(beforeSnapshot),
            JSON.stringify(afterSnapshot),
            actor.userId || null,
            actor.name || null,
          ],
        );
      await insertLoanContractAudit(dbClient, {
        companyId: scope.companyId,
        loanId,
        contractNo: loan.contract_no,
        action: "update",
        actorUserId: actor.userId || null,
        actorName: actor.name || null,
        payloadSnapshot: {
          reason: "evento_financeiro_aplicado",
          eventId: Number(eventInserted.rows[0].id),
          eventType,
          amount: appliedAmount,
          note: note || null,
          payload: payload || {},
          beforeSnapshot,
          afterSnapshot,
        },
      });
      if (eventType === "estorno") {
        await postDoubleEntry(dbClient, {
          companyId: scope.companyId,
          entryDate: eventDateIso,
          eventType: "estorno",
          description: `Estorno financeiro do contrato ${loan.contract_no}`,
          referenceType: "loan_financial_event",
          referenceId: Number(eventInserted.rows[0].id),
          loanId,
          actorUserId: actor.userId || null,
          actorName: actor.name || null,
          lines: [
            { accountCode: "1210", debit: appliedAmount, credit: 0, memo: "Reversao de pagamento no contrato de origem" },
            { accountCode: "1110", debit: 0, credit: appliedAmount, memo: "Saida de caixa por estorno" },
          ],
        });
      }

      if (requiresTransferPayment) {
        const transferPayment = await applyRepaymentAllocation(dbClient, {
          scope,
          clientId: Number(destinationClientId),
          loanId: destinationLoanId,
          targetInstallmentId: null,
          amount: appliedAmount,
          paymentDate: eventDateIso,
          allocationMode: destinationLoanId ? "loan" : "client_auto",
          note: `Pagamento via estorno do contrato ${loan.contract_no}.`,
          actor,
        });
        if (transferPayment?.error) {
          const transferError = new Error(transferPayment.error.message || "Falha ao aplicar pagamento do estorno.");
          transferError.status = Number(transferPayment.error.status) || 400;
          throw transferError;
        }
        transferResult = {
          repaymentId: Number(transferPayment.repaymentId || 0),
          receiptNo: transferPayment.receiptNo || null,
          amountApplied: Number(transferPayment.amountApplied || 0),
        };
      }

      return { id: Number(eventInserted.rows[0].id), transferResult };
    });

    if (result?.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    if (result?.pending) {
      return res.status(202).json({ message: "Reestruturacao registrada e enviada para aprovacao.", id: result.id, workflowStatus: "pending" });
    }
    if (result?.transferResult) {
      return res.status(201).json({
        message: "Estorno aplicado e pagamento ao cliente de destino concluido com sucesso.",
        id: result.id,
        workflowStatus: "executed",
        transfer: result.transferResult,
      });
    }
    return res.status(201).json({ message: "Evento financeiro aplicado com sucesso.", id: result.id, workflowStatus: "executed" });
  } catch (error) {
    const status = Number(error?.status || 0);
    if (Number.isInteger(status) && status >= 400 && status < 600) {
      return res.status(status).json({ message: error?.message || "Falha ao aplicar evento financeiro." });
    }
    return next(error);
  }
});

loanRouter.post("/:id/promises", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para registrar promessa." });
    const loanId = Number(req.params.id);
    if (!Number.isInteger(loanId)) {
      return res.status(400).json({ message: "ID invalido." });
    }
    const loan = await getLoanByIdForCompany(loanId, scope.companyId);
    if (!loan) return res.status(404).json({ message: "Emprestimo nao encontrado." });

    const promisedFor = String(req.body?.promisedFor || "").trim();
    const promisedAmount = Number(req.body?.promisedAmount);
    const note = String(req.body?.note || "").trim();
    if (!parseIsoDate(promisedFor)) {
      return res.status(400).json({ message: "Data prometida invalida." });
    }
    if (!Number.isFinite(promisedAmount) || promisedAmount <= 0) {
      return res.status(400).json({ message: "Valor prometido invalido." });
    }

    const inserted = await query(
      `
      INSERT INTO loan_payment_promises (
        company_id, loan_id, promised_for, promised_amount, status, note, created_by_user_id, created_by_name
      )
      VALUES ($1,$2,$3,$4,'active',$5,$6,$7)
      RETURNING id
      `,
      [
        scope.companyId,
        loanId,
        promisedFor,
        promisedAmount,
        note || null,
        Number(req.user?.sub) || null,
        req.user?.name || null,
      ],
    );

    return res.status(201).json({ message: "Promessa de pagamento registrada.", id: Number(inserted.rows[0].id) });
  } catch (error) {
    return next(error);
  }
});

loanRouter.patch("/:id/promises/:promiseId", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para atualizar promessa." });
    const loanId = Number(req.params.id);
    const promiseId = Number(req.params.promiseId);
    if (!Number.isInteger(loanId) || !Number.isInteger(promiseId)) {
      return res.status(400).json({ message: "Identificadores invalidos." });
    }
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!PROMISE_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Status de promessa invalido." });
    }

    const updated = await query(
      `
      UPDATE loan_payment_promises
      SET status = $1, updated_at = NOW()
      WHERE id = $2 AND loan_id = $3 AND company_id = $4
      RETURNING id
      `,
      [status, promiseId, loanId, scope.companyId],
    );
    if (!updated.rows[0]) {
      return res.status(404).json({ message: "Promessa nao encontrada." });
    }

    return res.json({ message: "Promessa atualizada com sucesso." });
  } catch (error) {
    return next(error);
  }
});

loanRouter.post("/:id/renegotiations", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para registrar renegociacao." });
    const loanId = Number(req.params.id);
    if (!Number.isInteger(loanId)) {
      return res.status(400).json({ message: "ID invalido." });
    }
    const loan = await getLoanByIdForCompany(loanId, scope.companyId);
    if (!loan) return res.status(404).json({ message: "Emprestimo nao encontrado." });

    const reason = String(req.body?.reason || "").trim();
    const note = String(req.body?.note || "").trim();
    const proposedTerms = typeof req.body?.proposedTerms === "object" && req.body?.proposedTerms ? req.body.proposedTerms : {};
    if (!reason) {
      return res.status(400).json({ message: "Motivo da renegociacao e obrigatorio." });
    }

    const oldTerms = {
      principal: Number(loan.principal),
      balance: Number(loan.balance),
      interestRate: Number(loan.interest_rate),
      dailyPenaltyRate: Number(loan.daily_penalty_rate),
      maturityOn: loan.maturity_on,
      nextPaymentOn: loan.next_payment_on,
      status: loan.status,
    };

    const inserted = await query(
      `
      INSERT INTO loan_renegotiations (
        company_id, loan_id, reason, old_terms, proposed_terms, status, note, created_by_user_id, created_by_name
      )
      VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,'pending',$6,$7,$8)
      RETURNING id
      `,
      [
        scope.companyId,
        loanId,
        reason,
        JSON.stringify(oldTerms),
        JSON.stringify(proposedTerms),
        note || null,
        Number(req.user?.sub) || null,
        req.user?.name || null,
      ],
    );

    return res.status(201).json({ message: "Renegociacao registrada.", id: Number(inserted.rows[0].id) });
  } catch (error) {
    return next(error);
  }
});

loanRouter.patch("/:id/renegotiations/:renegotiationId", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para atualizar renegociacao." });
    const loanId = Number(req.params.id);
    const renegotiationId = Number(req.params.renegotiationId);
    if (!Number.isInteger(loanId) || !Number.isInteger(renegotiationId)) {
      return res.status(400).json({ message: "Identificadores invalidos." });
    }
    const status = String(req.body?.status || "").trim().toLowerCase();
    if (!RENEGOTIATION_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Status de renegociacao invalido." });
    }

    const updated = await query(
      `
      UPDATE loan_renegotiations
      SET status = $1, updated_at = NOW()
      WHERE id = $2 AND loan_id = $3 AND company_id = $4
      RETURNING id
      `,
      [status, renegotiationId, loanId, scope.companyId],
    );
    if (!updated.rows[0]) {
      return res.status(404).json({ message: "Renegociacao nao encontrada." });
    }

    return res.json({ message: "Renegociacao atualizada com sucesso." });
  } catch (error) {
    return next(error);
  }
});

loanRouter.post("/payments/apply", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para registrar pagamento." });

    const clientId = Number(req.body?.clientId);
    const loanIdRaw = req.body?.loanId;
    const loanId = loanIdRaw === null || loanIdRaw === undefined || String(loanIdRaw).trim() === "" ? null : Number(loanIdRaw);
    const targetInstallmentIdRaw = req.body?.targetInstallmentId;
    const targetInstallmentId = targetInstallmentIdRaw === null || targetInstallmentIdRaw === undefined || String(targetInstallmentIdRaw).trim() === ""
      ? null
      : Number(targetInstallmentIdRaw);
    const amount = Number(req.body?.amount);
    const groupPayments = Array.isArray(req.body?.groupPayments)
      ? req.body.groupPayments
        .map((item) => ({
          allocationId: Number(item?.allocationId),
          amount: round2(Number(item?.amount || 0)),
        }))
        .filter((item) => Number.isInteger(item.allocationId) && item.allocationId > 0 && item.amount > 0)
      : [];
    const paymentDate = String(req.body?.paymentDate || "").trim() || new Date().toISOString().slice(0, 10);
    const note = String(req.body?.note || "").trim();
    const allocationMode = loanId ? "loan" : "client_auto";

    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.status(400).json({ message: "Cliente invalido para pagamento." });
    }
    if (loanId !== null && (!Number.isInteger(loanId) || loanId <= 0)) {
      return res.status(400).json({ message: "Contrato/emprestimo invalido para pagamento." });
    }
    if (targetInstallmentId !== null && (!Number.isInteger(targetInstallmentId) || targetInstallmentId <= 0)) {
      return res.status(400).json({ message: "Prestacao/parcela invalida para pagamento." });
    }
    if (targetInstallmentId !== null && loanId === null) {
      return res.status(400).json({ message: "Prestacao especifica exige selecao de contrato." });
    }
    if (groupPayments.length > 0 && loanId === null) {
      return res.status(400).json({ message: "Pagamentos por membros do grupo exigem selecao de contrato." });
    }
    const amountToApply = groupPayments.length > 0
      ? round2(groupPayments.reduce((sum, item) => sum + item.amount, 0))
      : amount;

    const actor = {
      userId: Number(req.user?.sub) || null,
      name: req.user?.name || null,
    };

    const result = await withTransaction(async (dbClient) => {
      let encodedNote = note;
      if (loanId !== null) {
        const loanTypeResult = await dbClient.query(
          `
          SELECT c.client_type
          FROM loans l
          JOIN clients c ON c.id = l.client_id
          WHERE l.id = $1
            AND l.company_id = $2
          LIMIT 1
          `,
          [loanId, scope.companyId],
        );
        const loanClientType = String(loanTypeResult.rows[0]?.client_type || "").toLowerCase();
        if (loanClientType === "grupo") {
          encodedNote = encodeGroupPaymentModeNote(note, groupPayments.length > 0 ? "individual" : "general");
        }
      }

      let lockedGroupRowsById = null;
      if (groupPayments.length > 0) {
        const allocationIds = groupPayments.map((item) => item.allocationId);
        const rows = await dbClient.query(
          `
          SELECT id, allocated_amount, paid_amount
          FROM loan_group_member_allocations
          WHERE company_id = $1
            AND loan_id = $2
            AND id = ANY($3::int[])
          FOR UPDATE
          `,
          [scope.companyId, loanId, allocationIds],
        );
        if (rows.rows.length !== allocationIds.length) {
          return { error: { status: 400, message: "Um ou mais membros selecionados nao pertencem ao grupo deste contrato." } };
        }
        lockedGroupRowsById = new Map(rows.rows.map((row) => [Number(row.id), row]));
        for (const item of groupPayments) {
          const row = lockedGroupRowsById.get(item.allocationId);
          const allocatedAmount = Number(row.allocated_amount || 0);
          const paidAmount = Number(row.paid_amount || 0);
          const remaining = allocatedAmount > 0 ? round2(Math.max(0, allocatedAmount - paidAmount)) : Number.POSITIVE_INFINITY;
          if (item.amount <= 0) {
            return { error: { status: 400, message: "Valor invalido em pagamento por membro." } };
          }
          if (Number.isFinite(remaining) && item.amount > remaining + 0.01) {
            return { error: { status: 409, message: "Valor informado excede o saldo pendente de um dos membros selecionados." } };
          }
        }
      }

      const paymentResult = await applyRepaymentAllocation(dbClient, {
        scope,
        clientId,
        loanId,
        targetInstallmentId,
        amount: amountToApply,
        paymentDate,
        allocationMode,
        note: encodedNote,
        actor,
      });
      if (paymentResult?.error) return paymentResult;

      if (groupPayments.length > 0) {
        const byId = lockedGroupRowsById || new Map();
        for (const item of groupPayments) {
          const row = byId.get(item.allocationId);
          const allocatedAmount = Number(row.allocated_amount || 0);
          const paidAmount = Number(row.paid_amount || 0);
          const remaining = allocatedAmount > 0 ? round2(Math.max(0, allocatedAmount - paidAmount)) : Number.POSITIVE_INFINITY;
          if (item.amount <= 0) {
            return { error: { status: 400, message: "Valor invalido em pagamento por membro." } };
          }
          if (Number.isFinite(remaining) && item.amount > remaining + 0.01) {
            return { error: { status: 409, message: "Valor informado excede o saldo pendente de um dos membros selecionados." } };
          }
          const nextPaid = round2(paidAmount + item.amount);
          const nextStatus = allocatedAmount <= 0
            ? "partial"
            : nextPaid >= allocatedAmount - 0.01
              ? "paid"
              : nextPaid > 0
                ? "partial"
                : "open";
          await dbClient.query(
            `
            UPDATE loan_group_member_allocations
            SET paid_amount = $1,
                status = $2
            WHERE id = $3
              AND company_id = $4
              AND loan_id = $5
            `,
            [nextPaid, nextStatus, item.allocationId, scope.companyId, loanId],
          );
        }
      }
      return paymentResult;
    });

    if (result?.error) return res.status(result.error.status).json({ message: result.error.message });

    void notifyPaymentReceivedSms({
      companyId: scope.companyId,
      clientId,
      repaymentId: result.repaymentId,
    }).catch(() => undefined);
    void notifyCaixaMovement({
      companyId: scope.companyId,
      actionType: "payment_received",
      actorName: actor.name || "Caixa",
      amount: result.amountApplied,
      note: result.receiptNo ? `Recibo ${result.receiptNo}` : null,
    }).catch(() => undefined);

    // Recibo de reembolso por e-mail ao cliente (Fase 4)
    void (async () => {
      try {
        const clientRow = await query(
          `SELECT c.name, c.email, c.manager_user_id, l.contract_no, l.balance
           FROM clients c
           JOIN loans l ON l.client_id = c.id
           WHERE l.id = $1 AND l.company_id = $2`,
          [loanId, scope.companyId],
        ).then((r) => r.rows[0]).catch(() => null);
        if (!clientRow) return;
        await notifyRepaymentEmail({
          companyId: scope.companyId,
          clientId: Number(clientId),
          clientName: clientRow.name || "Cliente",
          clientEmail: clientRow.email || null,
          receiptNo: result.receiptNo || "-",
          amount: Number(result.amountApplied || 0).toLocaleString("pt-MZ", { minimumFractionDigits: 2 }),
          paymentDate: String(paymentDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
          balance: Number(clientRow.balance || 0).toLocaleString("pt-MZ", { minimumFractionDigits: 2 }),
          contractNo: clientRow.contract_no || "-",
        });
        await createSystemNotification({
          companyId: scope.companyId,
          userId: clientRow.manager_user_id ? Number(clientRow.manager_user_id) : null,
          category: "reembolso",
          severity: "success",
          title: "Reembolso recebido",
          message: `Recebido ${Number(result.amountApplied || 0).toLocaleString("pt-MZ")} MT do contrato ${clientRow.contract_no || "-"} (recibo ${result.receiptNo || "-"}).`,
          referenceType: "loan_repayment",
          referenceId: Number(result.repaymentId) || null,
        });
      } catch {
        /* best-effort */
      }
    })();

    return res.status(201).json({
      message: "Pagamento aplicado com sucesso.",
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/payments/reimbursements", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para listar reembolsos." });
    const periodDaysRequested = Number(req.query.periodDays);
    const periodDays = [7, 14, 30, 60, 90].includes(periodDaysRequested) ? periodDaysRequested : 30;
    const dateRange = parseDateRangeQuery(req.query || {});
    if (dateRange.error) return res.status(400).json({ message: dateRange.error });
    const manager = String(req.query.manager || "all").trim();
    const clientTypeRaw = String(req.query.clientType || "all").trim().toLowerCase();
    const clientType = ["all", "singular", "grupo", "empresa"].includes(clientTypeRaw) ? clientTypeRaw : "all";
    const managerParam = manager.toLowerCase() === "all" ? "all" : manager;
    const params = [
      scope.companyId,
      dateRange.hasRange ? dateRange.from : null,
      dateRange.hasRange ? dateRange.to : null,
      dateRange.hasRange ? null : periodDays,
      managerParam,
      clientType,
    ];

    const rows = await query(
      `
      SELECT
        r.id,
        r.receipt_no,
        r.client_id,
        c.name AS client_name,
        r.loan_id,
        l.contract_no,
        COALESCE(mu.full_name, 'Sem Gestor') AS manager_name,
        l.principal AS loan_principal,
        l.interest_rate AS loan_interest_rate,
        l.disbursed_on AS loan_disbursed_on,
        l.maturity_on AS loan_maturity_on,
        r.payment_date,
        r.amount_received,
        r.amount_applied,
        r.principal_applied,
        r.interest_applied,
        r.mora_applied,
        r.unapplied_amount,
        r.allocation_mode,
        r.created_by_name,
        r.created_at
      FROM loan_repayments r
      JOIN clients c ON c.id = r.client_id
      LEFT JOIN loans l ON l.id = r.loan_id
      LEFT JOIN users mu ON mu.id = l.manager_user_id
      WHERE r.company_id = $1
        AND ($2::date IS NULL OR r.payment_date >= $2::date)
        AND ($3::date IS NULL OR r.payment_date <= $3::date)
        AND ($4::int IS NULL OR r.payment_date >= CURRENT_DATE - ($4::int || ' days')::interval)
        AND ($5 = 'all' OR LOWER(COALESCE(mu.full_name, 'Sem Gestor')) = LOWER($5))
        AND ($6 = 'all' OR c.client_type = $6)
      ORDER BY r.payment_date DESC, r.id DESC
      LIMIT 500
      `,
      params,
    );

    const list = rows.rows.map((row) => ({
      ...calculateDisplayBreakdown({
        amountReceived: Number(row.amount_received || 0),
        moraApplied: Number(row.mora_applied || 0),
        principalApplied: Number(row.principal_applied || 0),
        interestApplied: Number(row.interest_applied || 0),
        allocationMode: row.allocation_mode,
        loanPrincipal: row.loan_principal,
        loanInterestRate: row.loan_interest_rate,
        loanDisbursedOn: row.loan_disbursed_on,
        loanMaturityOn: row.loan_maturity_on,
      }),
      id: Number(row.id),
      receiptNo: row.receipt_no || null,
      clientId: Number(row.client_id),
      clientName: row.client_name,
      loanId: row.loan_id ? Number(row.loan_id) : null,
      contractNo: row.contract_no || null,
      managerName: row.manager_name || "Sem Gestor",
      paymentDate: row.payment_date,
      amountReceived: Number(row.amount_received || 0),
      amountApplied: Number(row.amount_applied || 0),
      principalApplied: Number(row.principal_applied || 0),
      interestApplied: Number(row.interest_applied || 0),
      moraApplied: Number(row.mora_applied || 0),
      unappliedAmount: Number(row.unapplied_amount || 0),
      allocationMode: row.allocation_mode,
      createdByName: row.created_by_name || "Sistema",
      createdAt: row.created_at,
    }));

    const detailedResult = await query(
      `
      SELECT
        a.id AS allocation_id,
        r.id AS repayment_id,
        r.receipt_no,
        r.payment_date,
        COALESCE(r.note, '') AS repayment_note,
        c.id AS client_id,
        c.name AS client_name,
        c.phone AS client_phone,
        c.occupation AS client_occupation,
        c.neighborhood AS client_neighborhood,
        c.client_type AS client_type,
        l.id AS loan_id,
        l.contract_no,
        l.product AS loan_product,
        l.principal AS loan_principal,
        l.disbursed_on AS loan_disbursed_on,
        COALESCE(mu.full_name, 'Sem Gestor') AS manager_name,
        a.installment_id,
        a.installment_no,
        a.due_date,
        a.days_overdue,
        a.mora_amount,
        a.principal_amount,
        a.interest_amount,
        a.total_applied,
        COALESCE(inst.total_installments, 0)::INT AS total_installments
      FROM loan_repayments r
      JOIN loan_repayment_allocations a ON a.repayment_id = r.id
      JOIN loans l ON l.id = a.loan_id
      JOIN clients c ON c.id = l.client_id
      LEFT JOIN users mu ON mu.id = l.manager_user_id
      LEFT JOIN LATERAL (
        SELECT MAX(li2.installment_no)::INT AS total_installments
        FROM loan_installments li2
        WHERE li2.loan_id = l.id
      ) inst ON TRUE
      WHERE r.company_id = $1
        AND ($2::date IS NULL OR r.payment_date >= $2::date)
        AND ($3::date IS NULL OR r.payment_date <= $3::date)
        AND ($4::int IS NULL OR r.payment_date >= CURRENT_DATE - ($4::int || ' days')::interval)
        AND ($5 = 'all' OR LOWER(COALESCE(mu.full_name, 'Sem Gestor')) = LOWER($5))
        AND ($6 = 'all' OR c.client_type = $6)
      ORDER BY r.payment_date DESC, r.id DESC, a.id ASC
      LIMIT 5000
      `,
      params,
    );

    const detailedRows = detailedResult.rows.map((row) => ({
      allocationId: Number(row.allocation_id),
      repaymentId: Number(row.repayment_id),
      receiptNo: row.receipt_no || "",
      paymentDate: row.payment_date,
      clientId: Number(row.client_id),
      clientName: row.client_name || "",
      clientPhone: row.client_phone || "",
      clientOccupation: row.client_occupation || "",
      clientNeighborhood: row.client_neighborhood || "",
      clientType: row.client_type || "singular",
      loanId: Number(row.loan_id),
      contractNo: row.contract_no || "",
      product: row.loan_product || "",
      managerName: row.manager_name || "Sem Gestor",
      disbursedOn: row.loan_disbursed_on,
      disbursedAmount: Number(row.loan_principal || 0),
      installmentId: Number(row.installment_id),
      installmentNo: Number(row.installment_no || 0),
      totalInstallments: Number(row.total_installments || 0),
      dueDate: row.due_date,
      daysLate: Number(row.days_overdue || 0),
      moraAmount: Number(row.mora_amount || 0),
      costAmount: 0,
      interestAmount: Number(row.interest_amount || 0),
      principalAmount: Number(row.principal_amount || 0),
      totalAmount: Number(row.total_applied || 0),
      destinationAccountLabel: "N/A",
      paymentChannelLabel: "N/A",
      repaymentNote: row.repayment_note || "",
    }));

    const totals = list.reduce(
      (acc, item) => {
        acc.received += item.amountReceived;
        acc.applied += item.amountApplied;
        acc.principal += item.principalApplied;
        acc.interest += item.interestApplied;
        acc.mora += item.moraApplied;
        return acc;
      },
      { received: 0, applied: 0, principal: 0, interest: 0, mora: 0 },
    );

    const byManager = Array.from(
      list.reduce((map, item) => {
        const key = item.managerName || "Sem Gestor";
        if (!map.has(key)) map.set(key, { manager: key, count: 0, amountApplied: 0, moraApplied: 0 });
        const entry = map.get(key);
        entry.count += 1;
        entry.amountApplied += item.amountApplied;
        entry.moraApplied += item.moraApplied;
        return map;
      }, new Map()).values(),
    );

    const detailedSummary = detailedRows.reduce(
      (acc, row) => {
        acc.totalRows += 1;
        acc.daysLate += Number(row.daysLate || 0);
        acc.mora += Number(row.moraAmount || 0);
        acc.costs += Number(row.costAmount || 0);
        acc.interest += Number(row.interestAmount || 0);
        acc.principal += Number(row.principalAmount || 0);
        acc.total += Number(row.totalAmount || 0);
        return acc;
      },
      { totalRows: 0, daysLate: 0, mora: 0, costs: 0, interest: 0, principal: 0, total: 0 },
    );

    return res.json({
      periodDays,
      manager,
      clientType,
      from: dateRange.hasRange ? dateRange.from : null,
      to: dateRange.hasRange ? dateRange.to : null,
      totals,
      byManager,
      detailedSummary,
      detailedRows,
      reimbursements: list,
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/payments/reimbursements/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar recibo de pagamento." });
    const repaymentId = Number(req.params.id);
    if (!Number.isInteger(repaymentId)) return res.status(400).json({ message: "ID de reembolso invalido." });

    const repaymentResult = await query(
      `
      SELECT
        r.id,
        r.receipt_no,
        r.company_id,
        r.client_id,
        c.name AS client_name,
        c.phone AS client_phone,
        c.phone_alt AS client_phone_alt,
        c.nuit AS client_nuit,
        c.document_type AS client_document_type,
        c.document_number AS client_document_number,
        c.email AS client_email,
        c.occupation AS client_occupation,
        c.address_line AS client_address_line,
        c.house_number AS client_house_number,
        c.neighborhood AS client_neighborhood,
        c.district AS client_district,
        c.city AS client_city,
        c.province AS client_province,
        r.loan_id,
        l.contract_no,
        l.principal AS loan_principal,
        l.interest_rate AS loan_interest_rate,
        l.disbursed_on AS loan_disbursed_on,
        l.maturity_on AS loan_maturity_on,
        r.payment_date,
        r.amount_received,
        r.amount_applied,
        r.principal_applied,
        r.interest_applied,
        r.mora_applied,
        r.unapplied_amount,
        r.allocation_mode,
        r.note,
        r.created_by_name,
        r.created_at
      FROM loan_repayments r
      JOIN clients c ON c.id = r.client_id
      LEFT JOIN loans l ON l.id = r.loan_id
      WHERE r.id = $1 AND r.company_id = $2
      LIMIT 1
      `,
      [repaymentId, scope.companyId],
    );
    const repayment = repaymentResult.rows[0];
    if (!repayment) return res.status(404).json({ message: "Reembolso nao encontrado." });

    const allocationsResult = await query(
      `
      SELECT
        a.loan_id,
        l.contract_no,
        a.installment_id,
        a.installment_no,
        a.due_date,
        a.days_overdue,
        a.principal_amount,
        a.interest_amount,
        a.installment_amount,
        a.mora_amount,
        a.total_applied
      FROM loan_repayment_allocations a
      JOIN loans l ON l.id = a.loan_id
      WHERE a.repayment_id = $1
      ORDER BY a.id ASC
      `,
      [repaymentId],
    );

    const companyResult = await query(
      `
      SELECT name, legal_name, nuit, phone, email, address
      FROM companies
      WHERE id = $1
      LIMIT 1
      `,
      [scope.companyId],
    );
    const company = companyResult.rows[0] || {};
    const debtResult = await query(
      `
      SELECT COALESCE(SUM(balance), 0)::numeric AS remaining_debt
      FROM loans
      WHERE company_id = $1
        AND client_id = $2
        AND disbursement_status = 'disbursed'
        AND balance > 0
      `,
      [scope.companyId, Number(repayment.client_id)],
    );
    const remainingDebt = Number(debtResult.rows[0]?.remaining_debt || 0);
    let selectedLoanRemainingDebt = null;
    if (repayment.loan_id) {
      const loanDebtResult = await query(
        `
        SELECT COALESCE(balance, 0)::numeric AS remaining_balance
        FROM loans
        WHERE id = $1
          AND company_id = $2
        LIMIT 1
        `,
        [Number(repayment.loan_id), scope.companyId],
      );
      selectedLoanRemainingDebt = loanDebtResult.rows[0] ? Number(loanDebtResult.rows[0].remaining_balance || 0) : null;
    }
    const isTotalDebtSettlement = remainingDebt <= 0
      || (selectedLoanRemainingDebt !== null && selectedLoanRemainingDebt <= 0);
    const toAmount = (value) => Math.round(Number(value || 0) * 100) / 100;
    const contextRemainingDebt = repayment.loan_id && selectedLoanRemainingDebt !== null
      ? Number(selectedLoanRemainingDebt || 0)
      : Number(remainingDebt || 0);
    const totalPaidAmount = Number(repayment.amount_applied || 0);
    const totalDebtBeforePayment = toAmount(Math.max(0, contextRemainingDebt + totalPaidAmount));
    const settlementStatus = contextRemainingDebt <= 0.009 ? "paid" : "partial";

    return res.json({
      repayment: {
        ...calculateDisplayBreakdown({
          amountReceived: Number(repayment.amount_received || 0),
          moraApplied: Number(repayment.mora_applied || 0),
          principalApplied: Number(repayment.principal_applied || 0),
          interestApplied: Number(repayment.interest_applied || 0),
          allocationMode: repayment.allocation_mode,
          loanPrincipal: repayment.loan_principal,
          loanInterestRate: repayment.loan_interest_rate,
          loanDisbursedOn: repayment.loan_disbursed_on,
          loanMaturityOn: repayment.loan_maturity_on,
        }),
        id: Number(repayment.id),
        receiptNo: repayment.receipt_no || null,
        clientId: Number(repayment.client_id),
        clientName: repayment.client_name,
        clientPhone: repayment.client_phone || "",
        loanId: repayment.loan_id ? Number(repayment.loan_id) : null,
        contractNo: repayment.contract_no || null,
        paymentDate: repayment.payment_date,
        amountReceived: Number(repayment.amount_received || 0),
        amountApplied: Number(repayment.amount_applied || 0),
        principalApplied: Number(repayment.principal_applied || 0),
        interestApplied: Number(repayment.interest_applied || 0),
        moraApplied: Number(repayment.mora_applied || 0),
        unappliedAmount: Number(repayment.unapplied_amount || 0),
        allocationMode: repayment.allocation_mode,
        note: repayment.note || "",
        createdByName: repayment.created_by_name || "Sistema",
        createdAt: repayment.created_at,
      },
      company: {
        name: company.name || "",
        legalName: company.legal_name || "",
        nuit: company.nuit || "",
        phone: company.phone || "",
        email: company.email || "",
        address: company.address || "",
      },
      client: {
        id: Number(repayment.client_id),
        name: repayment.client_name || "",
        phone: repayment.client_phone || "",
        phoneAlt: repayment.client_phone_alt || "",
        nuit: repayment.client_nuit || "",
        documentType: repayment.client_document_type || "",
        documentNumber: repayment.client_document_number || "",
        email: repayment.client_email || "",
        occupation: repayment.client_occupation || "",
        addressLine: repayment.client_address_line || "",
        houseNumber: repayment.client_house_number || "",
        neighborhood: repayment.client_neighborhood || "",
        district: repayment.client_district || "",
        city: repayment.client_city || "",
        province: repayment.client_province || "",
      },
      allocations: allocationsResult.rows.map((row) => ({
        loanId: Number(row.loan_id),
        contractNo: row.contract_no || "",
        installmentId: Number(row.installment_id),
        installmentNo: Number(row.installment_no),
        dueDate: row.due_date,
        daysOverdue: Number(row.days_overdue || 0),
        principalAmount: Number(row.principal_amount || 0),
        interestAmount: Number(row.interest_amount || 0),
        installmentAmount: Number(row.installment_amount || 0),
        moraAmount: Number(row.mora_amount || 0),
        totalApplied: Number(row.total_applied || 0),
      })),
      settlement: {
        isTotalDebtSettlement,
        remainingDebt,
        selectedLoanRemainingDebt,
        context: repayment.loan_id ? "loan" : "client",
        totalDebtBeforePayment,
        totalPaidAmount,
        receivedAmount: Number(repayment.amount_received || 0),
        status: settlementStatus,
      },
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/payments/client-contracts", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para listar contratos do cliente." });
    const clientId = Number(req.query.clientId);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return res.status(400).json({ message: "Cliente invalido." });
    }
    const rows = await query(
      `
      SELECT
        l.id,
        l.contract_no,
        l.product,
        l.principal,
        l.balance,
        l.disbursement_status,
        l.status,
        l.disbursed_on,
        l.next_payment_on,
        c.client_type,
        COALESCE(ar_meta.applicant_type, c.client_type, 'singular') AS applicant_type,
        COALESCE(li_base.base_outstanding, 0)::NUMERIC AS base_outstanding,
        COALESCE(li_paid.principal_paid_total, 0)::NUMERIC AS principal_paid_total
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(ar1.payload->>'applicantType', c.client_type, 'singular') AS applicant_type
        FROM loan_approval_requests ar1
        WHERE ar1.company_id = l.company_id
          AND ar1.generated_loan_id = l.id
        ORDER BY ar1.id DESC
        LIMIT 1
      ) ar_meta ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(GREATEST(
            0,
            (li.principal_amount + li.interest_amount)
            - COALESCE(li.principal_paid_amount, 0)
            - COALESCE(li.interest_paid_amount, 0)
          )), 0)::NUMERIC AS base_outstanding
        FROM loan_installments li
        WHERE li.loan_id = l.id
      ) li_base ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(GREATEST(0, COALESCE(li.principal_paid_amount, 0))), 0)::NUMERIC AS principal_paid_total
        FROM loan_installments li
        WHERE li.loan_id = l.id
      ) li_paid ON TRUE
      WHERE l.company_id = $1
        AND l.client_id = $2
      ORDER BY
        CASE WHEN l.disbursement_status = 'pending' THEN 0 ELSE 1 END,
        l.disbursed_on DESC,
        l.id DESC
      `,
      [scope.companyId, clientId],
    );
    return res.json({
      contracts: rows.rows.map((row) => {
        const balance = Number(row.balance || 0);
        const baseOutstanding = Number(row.base_outstanding || 0);
        const principalPaidTotal = Number(row.principal_paid_total || 0);
        const disbursementStatus = row.disbursement_status || "disbursed";
        const isLiquidated = baseOutstanding <= 0.009;
        const isPayable = disbursementStatus === "disbursed" && baseOutstanding > 0.009;
        const isReversible = disbursementStatus === "disbursed" && principalPaidTotal > 0.009;
        return {
          id: Number(row.id),
          contractNo: row.contract_no,
          product: row.product,
          principal: Number(row.principal || 0),
          balance,
          outstandingAmount: baseOutstanding,
          reversibleAmount: principalPaidTotal,
          disbursementStatus,
          status: row.status,
          disbursedOn: row.disbursed_on,
          nextPaymentOn: row.next_payment_on,
          clientType: row.client_type || "singular",
          applicantType: row.applicant_type || row.client_type || "singular",
          isLiquidated,
          isPayable,
          isReversible,
        };
      }),
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/payments/disbursed-clients", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para listar clientes desembolsados." });
    const rows = await query(
      `
      SELECT DISTINCT
        c.id,
        c.name,
        COALESCE(c.client_type, 'singular') AS client_type,
        COUNT(l.id) AS contracts_count,
        MAX(l.disbursed_on) AS last_disbursed_on
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      WHERE l.company_id = $1
        AND l.disbursement_status = 'disbursed'
      GROUP BY c.id, c.name, c.client_type
      ORDER BY c.name ASC
      `,
      [scope.companyId],
    );
    return res.json({
      clients: rows.rows.map((row) => ({
        id: Number(row.id),
        name: row.name || "",
        type: ["singular", "grupo", "empresa"].includes(String(row.client_type)) ? row.client_type : "singular",
        contractsCount: Number(row.contracts_count || 0),
        lastDisbursedOn: row.last_disbursed_on || null,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/payments/group-allocations", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para listar membros do grupo." });
    const loanId = Number(req.query.loanId);
    if (!Number.isInteger(loanId) || loanId <= 0) {
      return res.status(400).json({ message: "Contrato invalido." });
    }
    const rows = await query(
      `
      SELECT id, member_client_id, member_name, allocated_amount, paid_amount, status
      FROM loan_group_member_allocations
      WHERE company_id = $1
        AND loan_id = $2
      ORDER BY id ASC
      `,
      [scope.companyId, loanId],
    );
    return res.json({
      members: rows.rows.map((row) => ({
        id: Number(row.id),
        memberClientId: row.member_client_id ? Number(row.member_client_id) : null,
        memberName: row.member_name || "",
        allocatedAmount: Number(row.allocated_amount || 0),
        paidAmount: Number(row.paid_amount || 0),
        remainingAmount: round2(Math.max(0, Number(row.allocated_amount || 0) - Number(row.paid_amount || 0))),
        status: row.status || "open",
      })),
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/payments/forecast", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar previstos." });
    const policy = await getApprovalPolicy(scope.companyId);
    const periodDaysRequested = Number(req.query.periodDays);
    const periodDays = [7, 14, 30, 60, 90].includes(periodDaysRequested) ? periodDaysRequested : 30;
    const dateRange = parseDateRangeQuery(req.query || {});
    if (dateRange.error) return res.status(400).json({ message: dateRange.error });
    const clientTypeRaw = String(req.query.clientType || "all").trim().toLowerCase();
    const clientType = ["all", "singular", "grupo", "empresa"].includes(clientTypeRaw) ? clientTypeRaw : "all";

    const rows = await query(
      `
      SELECT
        li.id,
        li.loan_id,
        li.installment_no,
        li.due_date,
        li.payment_amount,
        li.principal_amount,
        li.interest_amount,
        li.principal_paid_amount,
        li.interest_paid_amount,
        li.mora_paid_amount,
        li.status,
        l.contract_no,
        l.daily_penalty_rate,
        l.payment_frequency,
        l.disbursed_on,
        l.product,
        COALESCE(co.name, 'Empresa') AS company_name,
        COALESCE(mu.full_name, 'Sem Gestor') AS manager_name,
        c.id AS client_id,
        c.name AS client_name,
        COALESCE(NULLIF(c.occupation, ''), '-') AS client_occupation,
        COALESCE(NULLIF(c.phone, ''), NULLIF(c.phone_alt, ''), '-') AS client_phone,
        COALESCE(li_total.total_installments, 0)::INT AS total_installments
      FROM loan_installments li
      JOIN loans l ON l.id = li.loan_id
      JOIN companies co ON co.id = l.company_id
      JOIN clients c ON c.id = l.client_id
      LEFT JOIN users mu ON mu.id = l.manager_user_id
      LEFT JOIN (
        SELECT loan_id, COUNT(*)::INT AS total_installments
        FROM loan_installments
        GROUP BY loan_id
      ) li_total ON li_total.loan_id = l.id
      WHERE l.company_id = $1
        AND li.status <> 'paid'
        AND ($2::date IS NULL OR li.due_date >= $2::date)
        AND ($3::date IS NULL OR li.due_date <= $3::date)
        AND ($4::int IS NULL OR li.due_date <= CURRENT_DATE + ($4::int || ' days')::interval)
        AND ($5 = 'all' OR c.client_type = $5)
      ORDER BY li.due_date ASC, li.installment_no ASC
      LIMIT 5000
      `,
      [
        scope.companyId,
        dateRange.hasRange ? dateRange.from : null,
        dateRange.hasRange ? dateRange.to : null,
        dateRange.hasRange ? null : periodDays,
        clientType,
      ],
    );

    const items = rows.rows.map((row) => {
      const state = computeInstallmentOutstandingState(row, null, policy);
      const vigenteAmount = state.baseRemainingAmount;
      return {
        installmentId: Number(row.id),
        loanId: Number(row.loan_id),
        contractNo: row.contract_no,
        clientId: Number(row.client_id),
        clientName: row.client_name,
        clientOccupation: row.client_occupation || "-",
        clientPhone: row.client_phone || "-",
        managerName: row.manager_name || "Sem Gestor",
        lineName: row.product || "-",
        companyName: row.company_name || "Empresa",
        totalInstallments: Number(row.total_installments || 0),
        installmentNo: Number(row.installment_no),
        dueDate: row.due_date,
        portfolioLabel: row.manager_name || "Sem Gestor",
        vigenteAmount,
        // Backward compatibility for existing frontend consumers.
        paymentAmount: vigenteAmount,
        status: state.computedStatus === "paid" ? "pending" : state.computedStatus,
        daysLate: state.daysOverdue,
      };
    }).filter((item) => item.vigenteAmount > 0.009);

    const summary = items.reduce(
      (acc, item) => {
        acc.totalCount += 1;
        acc.totalValue += item.vigenteAmount;
        if (item.status === "late") {
          acc.lateCount += 1;
          acc.lateValue += item.vigenteAmount;
        }
        return acc;
      },
      { totalCount: 0, totalValue: 0, lateCount: 0, lateValue: 0 },
    );
    return res.json({
      periodDays,
      clientType,
      from: dateRange.hasRange ? dateRange.from : null,
      to: dateRange.hasRange ? dateRange.to : null,
      summary,
      items,
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/payments/portfolio", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar carteira." });
    const manager = String(req.query.manager || "all").trim();
    const normalizedManager = manager || "all";
    const dateRange = parseDateRangeQuery(req.query || {});
    if (dateRange.error) return res.status(400).json({ message: dateRange.error });
    const clientTypeRaw = String(req.query.clientType || "all").trim().toLowerCase();
    const clientType = ["all", "singular", "grupo", "empresa"].includes(clientTypeRaw) ? clientTypeRaw : "all";
    const rows = await query(
      `
      WITH portfolio_base AS (
        SELECT
          l.id,
          l.contract_no,
          l.product,
          l.principal,
          l.balance,
          l.disbursement_status,
          l.status,
          l.days_overdue,
          l.disbursed_on,
          c.id AS client_id,
          c.name AS client_name,
          c.client_type AS client_type,
          COALESCE(mu.full_name, 'Sem Gestor') AS manager_name
        FROM loans l
        JOIN clients c ON c.id = l.client_id
        LEFT JOIN users mu ON mu.id = l.manager_user_id
        WHERE l.company_id = $1
          AND l.disbursement_status = 'disbursed'
      )
      SELECT
        id,
        contract_no,
        product,
        principal,
        balance,
        disbursement_status,
        status,
        days_overdue,
        disbursed_on,
        client_id,
        client_name,
        client_type,
        manager_name
      FROM portfolio_base
      WHERE ($2 = 'all' OR LOWER(manager_name) = LOWER($2))
        AND ($3::date IS NULL OR disbursed_on >= $3::date)
        AND ($4::date IS NULL OR disbursed_on <= $4::date)
        AND ($5 = 'all' OR client_type = $5)
      ORDER BY disbursed_on DESC, id DESC
      LIMIT 1200
      `,
      [
        scope.companyId,
        normalizedManager.toLowerCase() === "all" ? "all" : normalizedManager,
        dateRange.hasRange ? dateRange.from : null,
        dateRange.hasRange ? dateRange.to : null,
        clientType,
      ],
    );
    const loans = rows.rows.map((row) => ({
      id: Number(row.id),
      contractNo: row.contract_no,
      product: row.product,
      principal: Number(row.principal || 0),
      balance: Number(row.balance || 0),
      disbursementStatus: row.disbursement_status || "disbursed",
      status: row.status,
      daysOverdue: Number(row.days_overdue || 0),
      disbursedOn: row.disbursed_on,
      clientId: Number(row.client_id),
      clientName: row.client_name,
      clientType: row.client_type || "singular",
      managerName: row.manager_name || "Sem Gestor",
    }));
    const totals = loans.reduce(
      (acc, item) => {
        acc.portfolio += item.principal;
        acc.balance += item.balance;
        if (item.daysOverdue > 0) {
          acc.overdueContracts += 1;
          acc.overdueBalance += item.balance;
        }
        return acc;
      },
      { portfolio: 0, balance: 0, overdueContracts: 0, overdueBalance: 0 },
    );
    const byManagerMap = new Map();
    for (const item of loans) {
      const key = item.managerName || "Sem Gestor";
      if (!byManagerMap.has(key)) {
        byManagerMap.set(key, {
          manager: key,
          clients: new Set(),
          contracts: 0,
          portfolio: 0,
          balance: 0,
          overdueContracts: 0,
          overdueBalance: 0,
        });
      }
      const entry = byManagerMap.get(key);
      entry.clients.add(item.clientId);
      entry.contracts += 1;
      entry.portfolio += item.principal;
      entry.balance += item.balance;
      if (item.daysOverdue > 0) {
        entry.overdueContracts += 1;
        entry.overdueBalance += item.balance;
      }
    }
    const byManager = Array.from(byManagerMap.values())
      .map((entry) => ({
        manager: entry.manager,
        clients: entry.clients.size,
        contracts: entry.contracts,
        portfolio: round2(entry.portfolio),
        balance: round2(entry.balance),
        overdueContracts: entry.overdueContracts,
        overdueBalance: round2(entry.overdueBalance),
      }))
      .sort((a, b) => a.manager.localeCompare(b.manager, "pt"));

    return res.json({
      manager: normalizedManager.toLowerCase() === "all" ? "all" : normalizedManager,
      clientType,
      from: dateRange.hasRange ? dateRange.from : null,
      to: dateRange.hasRange ? dateRange.to : null,
      totals: {
        portfolio: round2(totals.portfolio),
        balance: round2(totals.balance),
        overdueContracts: totals.overdueContracts,
        overdueBalance: round2(totals.overdueBalance),
      },
      byManager,
      loans,
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/payments/mora", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar mora." });
    const policy = await getApprovalPolicy(scope.companyId);
    const manager = String(req.query.manager || "all").trim();
    const fromRaw = String(req.query?.from || "").trim();
    const toRaw = String(req.query?.to || "").trim();
    const parsedFrom = fromRaw ? parseIsoDate(fromRaw) : null;
    const parsedTo = toRaw ? parseIsoDate(toRaw) : null;
    if ((fromRaw && !parsedFrom) || (toRaw && !parsedTo)) {
      return res.status(400).json({ message: "Intervalo de datas invalido. Use formato YYYY-MM-DD." });
    }
    if (parsedFrom && parsedTo && parsedFrom.getTime() > parsedTo.getTime()) {
      return res.status(400).json({ message: "Data inicial nao pode ser maior que data final." });
    }
    const clientTypeRaw = String(req.query.clientType || "all").trim().toLowerCase();
    const clientType = ["all", "singular", "grupo", "empresa"].includes(clientTypeRaw) ? clientTypeRaw : "all";
    const managerParam = manager.toLowerCase() === "all" ? "all" : manager;
    const todayDate = parseIsoDate(new Date().toISOString().slice(0, 10)) || new Date();
    const todayIso = formatIsoDate(todayDate);
    let dateFilterMode = "up_to_today";
    let listingFrom = null;
    let listingTo = null;
    let referenceDateIso = todayIso;
    let overdueCutoffDateIso = todayIso;

    if (parsedFrom && parsedTo) {
      listingFrom = formatIsoDate(parsedFrom);
      listingTo = formatIsoDate(parsedTo);
      if (listingFrom === listingTo) {
        dateFilterMode = "on_day";
        overdueCutoffDateIso = todayIso;
      } else {
        dateFilterMode = "range";
        overdueCutoffDateIso = todayIso;
      }
      referenceDateIso = listingTo;
    } else if (parsedTo) {
      dateFilterMode = "up_to_day";
      referenceDateIso = formatIsoDate(parsedTo);
      overdueCutoffDateIso = todayIso;
      listingTo = null;
      listingFrom = null;
    } else if (parsedFrom) {
      dateFilterMode = "on_day";
      listingFrom = formatIsoDate(parsedFrom);
      listingTo = formatIsoDate(parsedFrom);
      // Mantem snapshot atual por padrao no modo "somente o dia",
      // filtrando os creditos pela data de vencimento daquele dia.
      referenceDateIso = todayIso;
      overdueCutoffDateIso = todayIso;
    }
    const parsedReferenceDate = parseIsoDate(referenceDateIso);
    if (parsedReferenceDate && parsedReferenceDate.getTime() > todayDate.getTime()) {
      referenceDateIso = todayIso;
    }
    const parsedOverdueCutoffDate = parseIsoDate(overdueCutoffDateIso);
    if (parsedOverdueCutoffDate && parsedOverdueCutoffDate.getTime() > todayDate.getTime()) {
      overdueCutoffDateIso = todayIso;
    }

    const params = [
      scope.companyId,
      managerParam,
      listingFrom,
      listingTo,
      clientType,
      overdueCutoffDateIso,
    ];

    const rows = await query(
      `
      SELECT
        l.id AS loan_id,
        l.contract_no,
        l.product AS loan_product,
        l.principal AS loan_principal,
        l.disbursed_on AS loan_disbursed_on,
        c.id AS client_id,
        c.name AS client_name,
        c.phone AS client_phone,
        c.occupation AS client_occupation,
        c.neighborhood AS client_neighborhood,
        COALESCE(mu.full_name, 'Sem Gestor') AS manager_name,
        l.daily_penalty_rate,
        l.payment_frequency,
        li.id AS installment_id,
        li.installment_no,
        li.due_date,
        li.payment_amount,
        li.principal_amount,
        li.interest_amount,
        li.principal_paid_amount,
        li.interest_paid_amount,
        li.mora_paid_amount
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      JOIN loan_installments li ON li.loan_id = l.id
      LEFT JOIN users mu ON mu.id = l.manager_user_id
      WHERE l.company_id = $1
        AND ($2 = 'all' OR LOWER(COALESCE(mu.full_name, 'Sem Gestor')) = LOWER($2))
        AND ($3::date IS NULL OR li.due_date >= $3::date)
        AND ($4::date IS NULL OR li.due_date <= $4::date)
        AND ($5 = 'all' OR c.client_type = $5)
        AND li.status <> 'paid'
        AND li.due_date < $6::date
      ORDER BY li.due_date ASC, li.installment_no ASC
      LIMIT 5000
      `,
      params,
    );

    const items = rows.rows.map((row) => {
      const state = computeInstallmentOutstandingState(row, overdueCutoffDateIso, policy);
      const vigenteAmount = state.baseRemainingAmount;
      const principalOverdueAmount = round2(Math.max(0, Number(state.principalAmount || 0) - Number(state.principalPaidAmount || 0)));
      const interestOverdueAmount = round2(Math.max(0, Number(state.interestAmount || 0) - Number(state.interestPaidAmount || 0)));
      const totalOverdueAmount = round2(vigenteAmount + state.moraRemainingAmount);
      return {
        loanId: Number(row.loan_id),
        contractNo: row.contract_no,
        product: row.loan_product || "-",
        disbursedOn: row.loan_disbursed_on,
        disbursedAmount: Number(row.loan_principal || 0),
        clientId: Number(row.client_id),
        clientName: row.client_name,
        clientPhone: row.client_phone || "",
        clientOccupation: row.client_occupation || "",
        clientNeighborhood: row.client_neighborhood || "",
        managerName: row.manager_name || "Sem Gestor",
        installmentId: Number(row.installment_id),
        installmentNo: Number(row.installment_no),
        dueDate: row.due_date,
        daysLate: state.daysOverdue,
        paymentFrequency: state.paymentFrequency,
        moraStatus: state.moraEnabledForInstallment ? "aplicada" : "isenta",
        vigenteAmount,
        baseOverdueAmount: vigenteAmount,
        principalOverdueAmount,
        interestOverdueAmount,
        totalOverdueAmount,
        // Backward compatibility for existing frontend consumers.
        installmentAmount: vigenteAmount,
        mora: state.moraRemainingAmount,
      };
    }).filter((item) => item.vigenteAmount > 0.009 || item.mora > 0.009);

    const creditRows = Array.from(
      items.reduce((map, item) => {
        const key = String(item.loanId);
        if (!map.has(key)) {
          map.set(key, {
            loanId: item.loanId,
            contractNo: item.contractNo,
            product: item.product || "-",
            clientId: item.clientId,
            clientName: item.clientName || "",
            clientPhone: item.clientPhone || "",
            clientOccupation: item.clientOccupation || "",
            clientNeighborhood: item.clientNeighborhood || "",
            managerName: item.managerName || "Sem Gestor",
            disbursedOn: item.disbursedOn || null,
            disbursedAmount: round2(Number(item.disbursedAmount || 0)),
            overdueInstallments: 0,
            daysLateTotal: 0,
            daysLateVigente: 0,
            moraAmount: 0,
            capitalRiskAmount: 0,
            principalOverdueAmount: 0,
            interestOverdueAmount: 0,
            totalOverdueAmount: 0,
          });
        }
        const entry = map.get(key);
        entry.overdueInstallments += 1;
        entry.daysLateTotal += Number(item.daysLate || 0);
        entry.daysLateVigente = Math.max(Number(entry.daysLateVigente || 0), Number(item.daysLate || 0));
        entry.moraAmount = round2(Number(entry.moraAmount || 0) + Number(item.mora || 0));
        entry.capitalRiskAmount = round2(Number(entry.capitalRiskAmount || 0) + Number(item.baseOverdueAmount || item.vigenteAmount || 0));
        entry.principalOverdueAmount = round2(Number(entry.principalOverdueAmount || 0) + Number(item.principalOverdueAmount || 0));
        entry.interestOverdueAmount = round2(Number(entry.interestOverdueAmount || 0) + Number(item.interestOverdueAmount || 0));
        entry.totalOverdueAmount = round2(Number(entry.totalOverdueAmount || 0) + Number(item.totalOverdueAmount || 0));
        return map;
      }, new Map()).values(),
    ).sort((a, b) => {
      const managerCmp = String(a.managerName || "").localeCompare(String(b.managerName || ""), "pt");
      if (managerCmp !== 0) return managerCmp;
      if (Number(b.daysLateVigente || 0) !== Number(a.daysLateVigente || 0)) {
        return Number(b.daysLateVigente || 0) - Number(a.daysLateVigente || 0);
      }
      return String(a.clientName || "").localeCompare(String(b.clientName || ""), "pt");
    });

    const portfolioGroups = Array.from(
      creditRows.reduce((map, row) => {
        const key = row.managerName || "Sem Gestor";
        if (!map.has(key)) {
          map.set(key, {
            managerName: key,
            rows: [],
            clientIds: new Set(),
            clientCount: 0,
            creditCount: 0,
            disbursedAmount: 0,
            capitalRiskAmount: 0,
            overdueInstallments: 0,
            daysLateTotal: 0,
            daysLateVigenteTotal: 0,
            moraAmount: 0,
            principalOverdueAmount: 0,
            interestOverdueAmount: 0,
            totalOverdueAmount: 0,
          });
        }
        const entry = map.get(key);
        entry.rows.push(row);
        entry.creditCount += 1;
        entry.clientIds.add(Number(row.clientId || 0));
        entry.disbursedAmount = round2(Number(entry.disbursedAmount || 0) + Number(row.disbursedAmount || 0));
        entry.capitalRiskAmount = round2(Number(entry.capitalRiskAmount || 0) + Number(row.capitalRiskAmount || 0));
        entry.overdueInstallments += Number(row.overdueInstallments || 0);
        entry.daysLateTotal += Number(row.daysLateTotal || 0);
        entry.daysLateVigenteTotal += Number(row.daysLateVigente || 0);
        entry.moraAmount = round2(Number(entry.moraAmount || 0) + Number(row.moraAmount || 0));
        entry.principalOverdueAmount = round2(Number(entry.principalOverdueAmount || 0) + Number(row.principalOverdueAmount || 0));
        entry.interestOverdueAmount = round2(Number(entry.interestOverdueAmount || 0) + Number(row.interestOverdueAmount || 0));
        entry.totalOverdueAmount = round2(Number(entry.totalOverdueAmount || 0) + Number(row.totalOverdueAmount || 0));
        return map;
      }, new Map()).values(),
    ).map((group) => ({
      managerName: group.managerName,
      clientCount: Array.from(group.clientIds).filter((id) => Number.isInteger(id) && id > 0).length,
      creditCount: Number(group.creditCount || 0),
      disbursedAmount: round2(Number(group.disbursedAmount || 0)),
      capitalRiskAmount: round2(Number(group.capitalRiskAmount || 0)),
      overdueInstallments: Number(group.overdueInstallments || 0),
      daysLateTotal: Number(group.daysLateTotal || 0),
      daysLateVigenteTotal: Number(group.daysLateVigenteTotal || 0),
      moraAmount: round2(Number(group.moraAmount || 0)),
      principalOverdueAmount: round2(Number(group.principalOverdueAmount || 0)),
      interestOverdueAmount: round2(Number(group.interestOverdueAmount || 0)),
      totalOverdueAmount: round2(Number(group.totalOverdueAmount || 0)),
      rows: group.rows,
    }));

    const totals = items.reduce(
      (acc, item) => {
        acc.overdueInstallments += 1;
        acc.overdueAmount += item.vigenteAmount;
        acc.mora += item.mora;
        return acc;
      },
      { overdueInstallments: 0, overdueAmount: 0, mora: 0 },
    );

    const byManager = portfolioGroups.map((group) => ({
      manager: group.managerName,
      overdueInstallments: Number(group.overdueInstallments || 0),
      overdueAmount: round2(Number(group.capitalRiskAmount || 0)),
      mora: round2(Number(group.moraAmount || 0)),
      creditCount: Number(group.creditCount || 0),
      clientCount: Number(group.clientCount || 0),
      totalOverdueAmount: round2(Number(group.totalOverdueAmount || 0)),
    }));

    const globalSummary = {
      clientCount: Array.from(new Set(creditRows.map((row) => Number(row.clientId || 0)).filter((id) => Number.isInteger(id) && id > 0))).length,
      creditCount: creditRows.length,
      disbursedAmount: round2(creditRows.reduce((sum, row) => sum + Number(row.disbursedAmount || 0), 0)),
      capitalRiskAmount: round2(creditRows.reduce((sum, row) => sum + Number(row.capitalRiskAmount || 0), 0)),
      overdueInstallments: creditRows.reduce((sum, row) => sum + Number(row.overdueInstallments || 0), 0),
      daysLateTotal: creditRows.reduce((sum, row) => sum + Number(row.daysLateTotal || 0), 0),
      daysLateVigenteTotal: creditRows.reduce((sum, row) => sum + Number(row.daysLateVigente || 0), 0),
      moraAmount: round2(creditRows.reduce((sum, row) => sum + Number(row.moraAmount || 0), 0)),
      principalOverdueAmount: round2(creditRows.reduce((sum, row) => sum + Number(row.principalOverdueAmount || 0), 0)),
      interestOverdueAmount: round2(creditRows.reduce((sum, row) => sum + Number(row.interestOverdueAmount || 0), 0)),
      totalOverdueAmount: round2(creditRows.reduce((sum, row) => sum + Number(row.totalOverdueAmount || 0), 0)),
    };

    return res.json({
      manager,
      clientType,
      from: listingFrom,
      to: listingTo || (dateFilterMode === "up_to_day" ? referenceDateIso : null),
      referenceDate: referenceDateIso,
      calculationDate: overdueCutoffDateIso,
      dateFilterMode,
      totals,
      byManager,
      items,
      creditRows,
      portfolioGroups,
      summary: globalSummary,
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.get("/payments/reversals", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar movimentos de outros." });
    const dateRange = parseDateRangeQuery(req.query || {});
    if (dateRange.error) return res.status(400).json({ message: dateRange.error });
    const manager = String(req.query.manager || "all").trim();
    const clientTypeRaw = String(req.query.clientType || "all").trim().toLowerCase();
    const clientType = ["all", "singular", "grupo", "empresa"].includes(clientTypeRaw) ? clientTypeRaw : "all";
    const eventTypeRaw = String(req.query.eventType || "all").trim().toLowerCase();
    const eventType = ["all", "estorno", "abatimento", "capitalizacao", "perdao_mora"].includes(eventTypeRaw)
      ? eventTypeRaw
      : "all";
    const eventTypeLabel = (value) => {
      if (value === "estorno") return "Estorno";
      if (value === "abatimento") return "Abate";
      if (value === "capitalizacao") return "Capitalizacao";
      if (value === "perdao_mora") return "Perdao de Mora";
      return value || "-";
    };
    const managerParam = manager.toLowerCase() === "all" ? "all" : manager;
    const rows = await query(
      `
      SELECT
        e.id,
        e.loan_id,
        e.event_type,
        COALESCE(
          CASE
            WHEN COALESCE(e.payload->>'eventDate', '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
            THEN (e.payload->>'eventDate')::date
            ELSE NULL
          END,
          e.created_at::date
        ) AS event_date,
        l.contract_no,
        c.name AS client_name,
        destination_client.name AS transfer_target_client_name,
        destination_loan.contract_no AS transfer_target_contract_no,
        COALESCE(mu.full_name, 'Sem Gestor') AS manager_name,
        e.amount,
        e.note,
        e.workflow_status,
        e.created_by_name,
        e.created_at
      FROM loan_financial_events e
      JOIN loans l ON l.id = e.loan_id
      JOIN clients c ON c.id = l.client_id
      LEFT JOIN clients destination_client ON destination_client.id = (
        CASE
          WHEN COALESCE(e.payload->>'destinationClientId', '') ~ '^\\d+$'
          THEN (e.payload->>'destinationClientId')::INT
          ELSE NULL
        END
      )
      LEFT JOIN loans destination_loan ON destination_loan.id = (
        CASE
          WHEN COALESCE(e.payload->>'destinationLoanId', '') ~ '^\\d+$'
          THEN (e.payload->>'destinationLoanId')::INT
          ELSE NULL
        END
      ) AND destination_loan.company_id = e.company_id
      LEFT JOIN users mu ON mu.id = l.manager_user_id
      WHERE e.company_id = $1
        AND e.event_type IN ('estorno', 'abatimento', 'capitalizacao', 'perdao_mora')
        AND ($2 = 'all' OR LOWER(COALESCE(mu.full_name, 'Sem Gestor')) = LOWER($2))
        AND (
          $3::date IS NULL OR
          COALESCE(
            CASE
              WHEN COALESCE(e.payload->>'eventDate', '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
              THEN (e.payload->>'eventDate')::date
              ELSE NULL
            END,
            e.created_at::date
          ) >= $3::date
        )
        AND (
          $4::date IS NULL OR
          COALESCE(
            CASE
              WHEN COALESCE(e.payload->>'eventDate', '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
              THEN (e.payload->>'eventDate')::date
              ELSE NULL
            END,
            e.created_at::date
          ) <= $4::date
        )
        AND ($5 = 'all' OR c.client_type = $5)
        AND ($6 = 'all' OR e.event_type = $6)
      ORDER BY event_date DESC, e.created_at DESC, e.id DESC
      LIMIT 1200
      `,
      [scope.companyId, managerParam, dateRange.hasRange ? dateRange.from : null, dateRange.hasRange ? dateRange.to : null, clientType, eventType],
    );
    return res.json({
      manager,
      clientType,
      eventType,
      from: dateRange.hasRange ? dateRange.from : null,
      to: dateRange.hasRange ? dateRange.to : null,
      items: rows.rows.map((row) => ({
        id: Number(row.id),
        loanId: Number(row.loan_id),
        eventType: row.event_type || "",
        eventTypeLabel: eventTypeLabel(row.event_type || ""),
        contractNo: row.contract_no || "",
        clientName: row.client_name || "",
        managerName: row.manager_name || "Sem Gestor",
        amount: Number(row.amount || 0),
        note: row.note || "",
        workflowStatus: row.workflow_status || "",
        createdByName: row.created_by_name || "Sistema",
        eventDate: row.event_date || null,
        transferTargetClientName: row.transfer_target_client_name || null,
        transferTargetContractNo: row.transfer_target_contract_no || null,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

loanRouter.post("/:id/installments/:installmentId/pay", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para atualizar parcelas." });
    const loanId = Number(req.params.id);
    const installmentId = Number(req.params.installmentId);
    if (!Number.isInteger(loanId) || !Number.isInteger(installmentId)) {
      return res.status(400).json({ message: "Identificadores invalidos." });
    }

    const paymentDateRaw = String(req.body?.paymentDate || "").trim();
    let paidAt = null;
    if (paymentDateRaw) {
      const parsed = parseIsoDate(paymentDateRaw);
      if (!parsed) {
        return res.status(400).json({ message: "Data de pagamento invalida." });
      }
      paidAt = `${formatIsoDate(parsed)}T00:00:00.000Z`;
    }

    const updated = await updateInstallmentStatusWithAudit({
      scope,
      loanId,
      installmentId,
      nextStatus: "paid",
      paidAt,
      actorUserId: Number(req.user?.sub) || null,
      actorName: req.user?.name || null,
      action: "mark_paid",
      onUpdated: async ({ dbClient, result }) => {
        if (result.previousStatus === "paid" || result.nextStatus !== "paid") return;
        if (!Number.isFinite(result.paymentAmount) || result.paymentAmount <= 0) return;
        await postDoubleEntry(dbClient, {
          companyId: scope.companyId,
          entryDate: new Date().toISOString().slice(0, 10),
          eventType: "pagamento",
          description: `Pagamento de parcela do contrato ${result.contractNo}`,
          referenceType: "loan_installment",
          referenceId: installmentId,
          loanId,
          actorUserId: Number(req.user?.sub) || null,
          actorName: req.user?.name || null,
          lines: [
            { accountCode: "1110", debit: result.paymentAmount, credit: 0, memo: "Entrada de caixa por pagamento" },
            { accountCode: "1210", debit: 0, credit: result.paymentAmount, memo: "Reducao da carteira de credito" },
          ],
        });
      },
    });

    if (!updated) {
      return res.status(404).json({ message: "Parcela nao encontrada para este emprestimo." });
    }
    await syncLoanDelinquencyState(null, loanId, scope.companyId);

    return res.json({ message: "Parcela marcada como paga." });
  } catch (error) {
    return next(error);
  }
});

loanRouter.patch("/:id/installments/:installmentId/status", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para atualizar parcelas." });
    const loanId = Number(req.params.id);
    const installmentId = Number(req.params.installmentId);
    if (!Number.isInteger(loanId) || !Number.isInteger(installmentId)) {
      return res.status(400).json({ message: "Identificadores invalidos." });
    }

    const nextStatus = String(req.body?.status || "").trim().toLowerCase();
    if (!["pending", "paid", "late"].includes(nextStatus)) {
      return res.status(400).json({ message: "Status de parcela invalido." });
    }

    const paymentDateRaw = String(req.body?.paymentDate || "").trim();
    let paidAt = null;
    if (paymentDateRaw) {
      const parsed = parseIsoDate(paymentDateRaw);
      if (!parsed) {
        return res.status(400).json({ message: "Data de pagamento invalida." });
      }
      paidAt = `${formatIsoDate(parsed)}T00:00:00.000Z`;
    }

    const updated = await updateInstallmentStatusWithAudit({
      scope,
      loanId,
      installmentId,
      nextStatus,
      paidAt,
      actorUserId: Number(req.user?.sub) || null,
      actorName: req.user?.name || null,
      action: "manual_status_change",
      onUpdated: async ({ dbClient, result }) => {
        if (result.previousStatus === "paid" || result.nextStatus !== "paid") return;
        if (!Number.isFinite(result.paymentAmount) || result.paymentAmount <= 0) return;
        await postDoubleEntry(dbClient, {
          companyId: scope.companyId,
          entryDate: new Date().toISOString().slice(0, 10),
          eventType: "pagamento",
          description: `Pagamento (manual) de parcela do contrato ${result.contractNo}`,
          referenceType: "loan_installment",
          referenceId: installmentId,
          loanId,
          actorUserId: Number(req.user?.sub) || null,
          actorName: req.user?.name || null,
          lines: [
            { accountCode: "1110", debit: result.paymentAmount, credit: 0, memo: "Entrada de caixa por pagamento" },
            { accountCode: "1210", debit: 0, credit: result.paymentAmount, memo: "Reducao da carteira de credito" },
          ],
        });
      },
    });

    if (!updated) {
      return res.status(404).json({ message: "Parcela nao encontrada para este emprestimo." });
    }
    await syncLoanDelinquencyState(null, loanId, scope.companyId);

    return res.json({ message: "Status da parcela atualizado com sucesso." });
  } catch (error) {
    return next(error);
  }
});

loanRouter.post("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para criar emprestimo." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    if (role !== "admin") {
      return res.status(403).json({ message: "Criacao direta bloqueada. Use a esteira formal de aprovacao." });
    }
    const policy = await getApprovalPolicy(scope.companyId);
    const validation = validateLoanPayload(req.body, {
      defaultDailyPenaltyRate: policy.defaultDailyPenaltyRate,
      maxLoanTermMonths: policy.maxLoanTermMonths,
    });
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const d = validation.data;
    const clientResult = await query("SELECT id FROM clients WHERE id = $1 AND company_id = $2", [d.clientId, scope.companyId]);
    if (!clientResult.rows[0]) {
      return res.status(400).json({ message: "Cliente informado nao pertence a empresa selecionada." });
    }
    const manager = await resolveManagerForCompany(scope.companyId, d.managerUserId);
    if (!manager) {
      return res.status(400).json({ message: "Gestor invalido para a carteira deste emprestimo." });
    }
    const inserted = await withTransaction(async (dbClient) => {
      const result = await createLoanFromPayload(dbClient, {
        scope,
        payload: d,
        actor: {
          userId: Number(req.user?.sub) || null,
          name: req.user?.name || null,
        },
      });
      if (result?.error) return result;
      return { rows: [{ id: result.loanId, contract_no: result.contractNo }] };
    });
    if (inserted?.error) {
      return res.status(inserted.error.status).json({ message: inserted.error.message });
    }

    return res.status(201).json({
      message: "Emprestimo criado com sucesso.",
      id: inserted.rows[0].id,
      contractNo: inserted.rows[0].contract_no,
    });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Numero de contrato ja existe." });
    }
    if (error?.code === "23503") {
      return res.status(400).json({ message: "Cliente informado nao existe." });
    }
    return next(error);
  }
});

loanRouter.put("/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para atualizar emprestimo." });
    const role = String(req.user?.role || "").trim().toLowerCase();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "ID invalido." });
    }

    const policy = await getApprovalPolicy(scope.companyId);
    const validation = validateLoanPayload(req.body, {
      defaultDailyPenaltyRate: policy.defaultDailyPenaltyRate,
      maxLoanTermMonths: policy.maxLoanTermMonths,
      forcePriceMethod: role !== "admin",
    });
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const d = validation.data;
    const clientResult = await query("SELECT id FROM clients WHERE id = $1 AND company_id = $2", [d.clientId, scope.companyId]);
    if (!clientResult.rows[0]) {
      return res.status(400).json({ message: "Cliente informado nao pertence a empresa selecionada." });
    }
    const manager = await resolveManagerForCompany(scope.companyId, d.managerUserId);
    if (!manager) {
      return res.status(400).json({ message: "Gestor invalido para a carteira deste emprestimo." });
    }
    const current = await query(
      `
      SELECT
        contract_no,
        principal,
        balance,
        interest_rate,
        administrative_fee_mode,
        administrative_fee_rate,
        administrative_fee_amount,
        disbursement_net_amount,
        daily_penalty_rate,
        amortization_method,
        payment_frequency,
        disbursed_on,
        maturity_on,
        next_payment_on,
        manager_user_id
      FROM loans
      WHERE id = $1 AND company_id = $2
      `,
      [id, scope.companyId],
    );
    if (!current.rows[0]) {
      return res.status(404).json({ message: "Emprestimo nao encontrado." });
    }
    const contractNo = d.contractNo || current.rows[0].contract_no;
    const currentRow = current.rows[0];
    const scheduleChanged =
      Number(currentRow.principal || 0) !== Number(d.amount) ||
      Number(currentRow.interest_rate || 0) !== Number(d.rate) ||
      String(currentRow.amortization_method || "") !== String(d.amortizationMethod || "") ||
      String(currentRow.payment_frequency || "") !== String(d.paymentFrequency || "") ||
      String(currentRow.disbursed_on || "") !== String(d.disbursed || "") ||
      String(currentRow.maturity_on || "") !== String(d.maturity || "") ||
      String(currentRow.next_payment_on || "") !== String(d.nextPayment || "");

    let installments = null;
    if (scheduleChanged) {
      installments = buildInstallments(d);
      if (!installments.valid) {
        return res.status(400).json({ message: installments.message });
      }
    }
    const updated = await withTransaction(async (dbClient) => {
      const loanUpdated = await dbClient.query(
        `
        UPDATE loans
        SET contract_no = $1, client_id = $2, manager_user_id = $3, product = $4, principal = $5, balance = $6, interest_rate = $7,
            administrative_fee_mode = $8, administrative_fee_rate = $9, administrative_fee_amount = $10, disbursement_net_amount = $11,
            daily_penalty_rate = $12, amortization_method = $13, payment_frequency = $14, disbursed_on = $15, maturity_on = $16, next_payment_on = $17, days_overdue = $18, status = $19
        WHERE id = $20 AND company_id = $21
        RETURNING id
        `,
        [
          contractNo,
          d.clientId,
          d.managerUserId,
          d.product,
          d.amount,
          d.balance,
          d.rate,
          d.administrativeFeeMode,
          d.administrativeFeeRate,
          d.administrativeFeeAmount,
          d.disbursementNetAmount,
          d.dailyPenaltyRate,
          d.amortizationMethod,
          d.paymentFrequency,
          d.disbursed,
          d.maturity,
          d.nextPayment,
          d.daysOverdue,
          d.status,
          id,
          scope.companyId,
        ],
      );
      if (!loanUpdated.rows[0]) return loanUpdated;
      if (scheduleChanged && installments) {
        await replaceLoanInstallments(dbClient, id, installments.rows);
      }
      await syncLoanDelinquencyState(dbClient, id, scope.companyId);
      await insertLoanContractAudit(dbClient, {
        companyId: scope.companyId,
        loanId: id,
        contractNo,
        action: "update",
        actorUserId: Number(req.user?.sub) || null,
        actorName: req.user?.name || null,
        payloadSnapshot: {
          clientId: d.clientId,
          managerUserId: d.managerUserId,
          product: d.product,
          amount: d.amount,
          balance: d.balance,
          rate: d.rate,
          administrativeFeeMode: d.administrativeFeeMode,
          administrativeFeeRate: d.administrativeFeeRate,
          administrativeFeeAmount: d.administrativeFeeAmount,
          disbursementNetAmount: d.disbursementNetAmount,
          dailyPenaltyRate: d.dailyPenaltyRate,
          amortizationMethod: d.amortizationMethod,
          paymentFrequency: d.paymentFrequency,
          disbursed: d.disbursed,
          maturity: d.maturity,
          nextPayment: d.nextPayment,
          status: d.status,
        },
      });
      return loanUpdated;
    });

    if (!updated.rows[0]) {
      return res.status(404).json({ message: "Emprestimo nao encontrado." });
    }

    return res.json({ message: "Emprestimo atualizado com sucesso." });
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Numero de contrato ja existe." });
    }
    if (error?.code === "23503") {
      return res.status(400).json({ message: "Cliente informado nao existe." });
    }
    return next(error);
  }
});

loanRouter.delete("/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para remover emprestimo." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "ID invalido." });
    }

    const removed = await withTransaction(async (dbClient) => {
      const current = await dbClient.query(
        `
        SELECT id, contract_no, client_id, product, principal, balance, interest_rate, daily_penalty_rate, amortization_method, payment_frequency,
               manager_user_id, disbursed_on, maturity_on, next_payment_on, days_overdue, status
        FROM loans
        WHERE id = $1 AND company_id = $2
        FOR UPDATE
        `,
        [id, scope.companyId],
      );
      if (!current.rows[0]) return null;

      await insertLoanContractAudit(dbClient, {
        companyId: scope.companyId,
        loanId: id,
        contractNo: current.rows[0].contract_no,
        action: "delete",
        actorUserId: Number(req.user?.sub) || null,
        actorName: req.user?.name || null,
        payloadSnapshot: {
          clientId: Number(current.rows[0].client_id),
          managerUserId: current.rows[0].manager_user_id ? Number(current.rows[0].manager_user_id) : null,
          product: current.rows[0].product,
          amount: Number(current.rows[0].principal),
          balance: Number(current.rows[0].balance),
          rate: Number(current.rows[0].interest_rate),
          dailyPenaltyRate: Number(current.rows[0].daily_penalty_rate),
          amortizationMethod: current.rows[0].amortization_method,
          paymentFrequency: current.rows[0].payment_frequency,
          disbursed: current.rows[0].disbursed_on,
          maturity: current.rows[0].maturity_on,
          nextPayment: current.rows[0].next_payment_on,
          daysOverdue: Number(current.rows[0].days_overdue),
          status: current.rows[0].status,
        },
      });

      const deleted = await dbClient.query("DELETE FROM loans WHERE id = $1 AND company_id = $2 RETURNING id", [id, scope.companyId]);
      return deleted.rows[0] ? { id: deleted.rows[0].id } : null;
    });

    if (!removed) {
      return res.status(404).json({ message: "Emprestimo nao encontrado." });
    }

    return res.json({ message: "Emprestimo removido com sucesso." });
  } catch (error) {
    return next(error);
  }
});
