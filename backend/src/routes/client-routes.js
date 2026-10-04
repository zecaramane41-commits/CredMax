import express from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../config/db.js";
import { isCentralAdmin, requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireReadWrite } from "../middleware/permissions.js";
import {
  normalizeMozDocumentNumber,
  normalizeMozNuit,
  validateMozDocumentNumber,
  validateMozNuit,
} from "../utils/mozambique-validation.js";

export const clientRouter = express.Router();

clientRouter.use(requireAuth);
clientRouter.use(requireReadWrite("clients.view", "clients.manage"));
const PHONE_REGEX = /^\+258\d{9}$/;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);
const CLIENT_DOCUMENT_TYPES = [
  { type: "bi", label: "BI", required: true },
  { type: "comprovativo_residencia", label: "Comprovativo de Residencia", required: true },
  { type: "comprovativo_renda", label: "Comprovativo de Renda", required: true },
  { type: "contrato_assinado", label: "Contrato Assinado", required: true },
  { type: "outro", label: "Outro", required: false },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DOCUMENTS_ROOT = path.resolve(__dirname, "../../uploads/client-documents");

function safeFileName(name) {
  return String(name || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "documento";
}

function mimeExtension(mimeType) {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  return "bin";
}

function normalizeBase64Input(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const marker = "base64,";
  const markerIndex = raw.indexOf(marker);
  return markerIndex >= 0 ? raw.slice(markerIndex + marker.length) : raw;
}

function computeDocumentStatus(expiresOn) {
  if (!expiresOn) return "valid";
  const today = new Date(new Date().toISOString().slice(0, 10));
  const expiry = new Date(`${expiresOn}T00:00:00.000Z`);
  if (Number.isNaN(expiry.getTime())) return "valid";
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring";
  return "valid";
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function computeAutomaticClientScore({ monthlyIncome, monthlyExpenses, status }) {
  const income = Number(monthlyIncome || 0);
  const expenses = Number(monthlyExpenses || 0);
  const disposable = income - expenses;
  const expenseRatio = income > 0 ? expenses / income : 2;
  const normalizedStatus = String(status || "").trim().toLowerCase();

  let score = 650;

  if (income <= 0) score -= 220;
  else if (disposable >= 30000) score += 140;
  else if (disposable >= 15000) score += 90;
  else if (disposable >= 5000) score += 40;
  else if (disposable >= 0) score += 10;
  else score -= 120;

  if (expenseRatio <= 0.4) score += 120;
  else if (expenseRatio <= 0.7) score += 60;
  else if (expenseRatio <= 1) score += 10;
  else score -= 80;

  if (normalizedStatus === "active") score += 60;
  else if (normalizedStatus === "warning") score -= 70;
  else if (normalizedStatus === "alert") score -= 140;

  return Math.max(0, Math.min(1000, Math.round(score)));
}

function validateClientPayload(body) {
  const rawGroupMembers = Array.isArray(body?.groupMembers) ? body.groupMembers : [];
  const groupMembers = rawGroupMembers
    .map((item) => ({
      // Membros de grupo sao vinculados ao lider (grupo), nao tratados como cliente singular independente.
      memberClientId: null,
      memberName: String(item?.memberName || "").trim(),
      allocationAmount: Number(item?.allocationAmount || 0),
    }))
    .filter((item) => item.memberClientId || item.memberName);
  const data = {
    name: String(body?.name || "").trim(),
    type: String(body?.type || "").trim(),
    nuit: normalizeMozNuit(body?.nuit),
    phone: String(body?.phone || "").trim(),
    email: String(body?.email || "").trim().toLowerCase(),
    phoneAlt: String(body?.phoneAlt || "").trim(),
    documentType: String(body?.documentType || "").trim(),
    documentNumber: "",
    birthDate: String(body?.birthDate || "").trim(),
    gender: String(body?.gender || "").trim(),
    maritalStatus: String(body?.maritalStatus || "").trim(),
    nationality: String(body?.nationality || "").trim(),
    province: String(body?.province || "").trim(),
    city: String(body?.city || "").trim(),
    district: String(body?.district || "").trim(),
    neighborhood: String(body?.neighborhood || "").trim(),
    addressLine: String(body?.addressLine || "").trim(),
    houseNumber: String(body?.houseNumber || "").trim(),
    occupation: String(body?.occupation || "").trim(),
    employerName: String(body?.employerName || "").trim(),
    monthlyIncome: Number(body?.monthlyIncome || 0),
    monthlyExpenses: Number(body?.monthlyExpenses || 0),
    businessName: String(body?.businessName || "").trim(),
    businessSector: String(body?.businessSector || "").trim(),
    registrationDate: String(body?.registrationDate || "").trim(),
    notes: String(body?.notes || "").trim(),
    groupName: String(body?.groupName || "").trim(),
    groupDescription: String(body?.groupDescription || "").trim(),
    groupLeaderName: String(body?.groupLeaderName || "").trim(),
    groupMembers,
    score: 0,
    status: String(body?.status || "").trim(),
  };
  data.documentNumber = normalizeMozDocumentNumber(body?.documentNumber, data.documentType);

  if (!data.name || !data.nuit || !data.phone) {
    return { valid: false, message: "Nome, NUIT e telefone são obrigatórios." };
  }
  if (!PHONE_REGEX.test(data.phone)) {
    if (/^\d{9}$/.test(data.phone)) {
      data.phone = `+258${data.phone}`;
    } else {
      return { valid: false, message: "Telefone principal inválido. Use formato +258 seguido de 9 dígitos." };
    }
  }
  if (data.phoneAlt && !PHONE_REGEX.test(data.phoneAlt)) {
    if (/^\d{9}$/.test(data.phoneAlt)) {
      data.phoneAlt = `+258${data.phoneAlt}`;
    }
  }
  if (!["singular", "grupo", "empresa"].includes(data.type)) {
    data.type = "singular";
  }
  if (data.type === "grupo" && !data.groupName) {
    return { valid: false, message: "Nome do grupo é obrigatório para cliente do tipo grupo." };
  }
  const nuitError = validateMozNuit(data.nuit, { required: true, label: "NUIT" });
  if (nuitError) {
    return { valid: false, message: nuitError };
  }
  if (data.documentNumber && data.documentType) {
    const documentError = validateMozDocumentNumber(data.documentNumber, data.documentType, {
      required: false,
      label: "Documento",
    });
    if (documentError) {
      return { valid: false, message: documentError };
    }
  }
  data.birthDate = data.birthDate || "1990-01-01";
  data.gender = data.gender || "masculino";
  data.maritalStatus = data.maritalStatus || "solteiro";
  data.nationality = data.nationality || "Mocambicana";
  data.province = data.province || "Maputo Cidade";
  data.district = data.district || data.province;
  data.city = data.city || data.district || data.province;
  data.neighborhood = data.neighborhood || "";
  data.addressLine = data.addressLine || [data.neighborhood, data.district, data.province].filter(Boolean).join(", ") || "Endereço principal";
  data.occupation = data.occupation || "Particular";
  if (!["active", "warning", "alert"].includes(data.status)) {
    data.status = "active";
  }
  if (data.registrationDate && !isValidIsoDate(data.registrationDate)) {
    data.registrationDate = getTodayIsoDate();
  }

  data.registrationDate = data.registrationDate || getTodayIsoDate();
  data.score = computeAutomaticClientScore({
    monthlyIncome: data.monthlyIncome,
    monthlyExpenses: data.monthlyExpenses,
    status: data.status,
  });

  return { valid: true, data };
}

async function findFirstClientDuplicate({ companyId, currentClientId = null, nuit, documentNumber, email, phone, phoneAlt }) {
  const idClause = currentClientId ? "AND id <> $2" : "";
  const idParams = currentClientId ? [companyId, currentClientId] : [companyId];
  const paramIndexStart = idParams.length + 1;

  const checks = [
    {
      field: "nuit",
      value: nuit,
      sql: `SELECT id FROM clients WHERE company_id = $1 ${idClause} AND nuit = $${paramIndexStart} LIMIT 1`,
      message: "NUIT ja existente.",
    },
    {
      field: "document_number",
      value: documentNumber,
      sql: `SELECT id FROM clients WHERE company_id = $1 ${idClause} AND document_number = $${paramIndexStart} LIMIT 1`,
      message: "Numero de documento ja existente.",
    },
    {
      field: "email",
      value: email,
      sql: `SELECT id FROM clients WHERE company_id = $1 ${idClause} AND LOWER(email) = LOWER($${paramIndexStart}) LIMIT 1`,
      message: "Email ja existente.",
    },
    {
      field: "phone",
      value: phone,
      sql: `SELECT id FROM clients WHERE company_id = $1 ${idClause} AND (phone = $${paramIndexStart} OR phone_alt = $${paramIndexStart}) LIMIT 1`,
      message: "Telefone ja existente.",
    },
  ];

  for (const check of checks) {
    const result = await query(check.sql, [...idParams, check.value]);
    if (result.rows[0]) return check.message;
  }

  if (phoneAlt) {
    const altQuery = await query(
      `SELECT id FROM clients WHERE company_id = $1 ${idClause} AND (phone = $${paramIndexStart} OR phone_alt = $${paramIndexStart}) LIMIT 1`,
      [...idParams, phoneAlt],
    );
    if (altQuery.rows[0]) return "Telefone alternativo ja existente.";
  }

  return null;
}

function toClient(row) {
  return {
    id: Number(row.id),
    name: row.name,
    type: row.type,
    nuit: row.nuit,
    phone: row.phone,
    email: row.email,
    phoneAlt: row.phone_alt || "",
    documentType: row.document_type || "",
    documentNumber: row.document_number || "",
    birthDate: row.birth_date,
    gender: row.gender || "",
    maritalStatus: row.marital_status || "",
    nationality: row.nationality || "",
    province: row.province || "",
    city: row.city || "",
    district: row.district || "",
    neighborhood: row.neighborhood || "",
    addressLine: row.address_line || "",
    houseNumber: row.house_number || "",
    occupation: row.occupation || "",
    employerName: row.employer_name || "",
    monthlyIncome: Number(row.monthly_income || 0),
    monthlyExpenses: Number(row.monthly_expenses || 0),
    businessName: row.business_name || "",
    businessSector: row.business_sector || "",
    groupName: row.group_name || "",
    groupDescription: row.group_description || "",
    groupLeaderName: row.group_leader_name || "",
    groupMembers: Array.isArray(row.group_members) ? row.group_members : [],
    registrationDate: row.registration_date,
    notes: row.notes || "",
    score: Number(row.score),
    status: row.status,
    carteiraId: row.carteira_id ? Number(row.carteira_id) : null,
    carteiraNome: row.carteira_nome || "",
    gestorName: row.gestor_name || "",
    gestorUserId: row.gestor_user_id ? Number(row.gestor_user_id) : null,
    loans: Number(row.loans || 0),
    debt: Number(row.debt || 0),
  };
}

function maskRight(value, visibleTail = 2) {
  const raw = String(value || "");
  if (raw.length <= visibleTail) return raw;
  return `${"*".repeat(Math.max(0, raw.length - visibleTail))}${raw.slice(-visibleTail)}`;
}

function computeCreditEvaluation(client) {
  const monthlyIncome = Number(client.monthly_income || 0);
  const monthlyExpenses = Number(client.monthly_expenses || 0);
  const debt = Number(client.debt || 0);
  const loans = Number(client.loans || 0);
  const score = Number(client.score || 0);
  const status = String(client.status || "");

  const disposableIncome = monthlyIncome - monthlyExpenses;
  const debtToIncome = monthlyIncome > 0 ? debt / monthlyIncome : 999;

  let points = 50;
  const reasons = [];

  if (monthlyIncome <= 0) {
    points -= 30;
    reasons.push("Renda mensal nao informada ou invalida.");
  } else if (disposableIncome >= 20000) {
    points += 15;
    reasons.push("Boa folga financeira mensal para suportar prestacoes.");
  } else if (disposableIncome >= 10000) {
    points += 10;
    reasons.push("Folga financeira aceitavel.");
  } else if (disposableIncome >= 0) {
    points += 4;
    reasons.push("Folga financeira baixa, exige cautela.");
  } else {
    points -= 20;
    reasons.push("Despesas mensais superiores a renda mensal.");
  }

  if (debtToIncome <= 1) {
    points += 20;
    reasons.push("Endividamento atual baixo em relacao a renda.");
  } else if (debtToIncome <= 3) {
    points += 10;
    reasons.push("Endividamento moderado, ainda controlavel.");
  } else if (debtToIncome <= 5) {
    reasons.push("Endividamento elevado para a renda declarada.");
  } else {
    points -= 15;
    reasons.push("Endividamento muito elevado para a renda declarada.");
  }

  if (score >= 800) {
    points += 20;
    reasons.push("Score de credito excelente.");
  } else if (score >= 700) {
    points += 12;
    reasons.push("Score de credito bom.");
  } else if (score >= 600) {
    points += 4;
    reasons.push("Score medio, com risco controlado.");
  } else {
    points -= 15;
    reasons.push("Score baixo, risco elevado.");
  }

  if (status === "active") {
    points += 8;
    reasons.push("Historico atual em estado ativo.");
  } else if (status === "warning") {
    points -= 6;
    reasons.push("Cliente em estado de atencao.");
  } else if (status === "alert") {
    points -= 12;
    reasons.push("Cliente em estado de alerta.");
  }

  if (loans > 3) {
    points -= 4;
    reasons.push("Cliente com varios creditos em carteira.");
  } else if (loans === 0) {
    reasons.push("Sem credito ativo no momento.");
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(points)));
  const decision = finalScore >= 75 ? "Aprovado" : finalScore >= 55 ? "Condicional" : "Reprovado";
  const recommendation =
    decision === "Aprovado"
      ? "Aprovacao recomendada com plano normal de acompanhamento."
      : decision === "Condicional"
        ? "Aprovacao condicional: reduzir valor, exigir avalista ou entrada maior."
        : "Nao aprovar agora. Recomenda-se reavaliacao apos melhoria financeira.";

  return {
    monthlyIncome,
    monthlyExpenses,
    disposableIncome,
    debt,
    debtToIncome,
    loans,
    score,
    status,
    finalScore,
    decision,
    recommendation,
    reasons,
  };
}

function validateGuarantorPayload(body) {
  const clientId = Number(body?.clientId);
  const data = {
    name: String(body?.name || "").trim(),
    nuit: normalizeMozNuit(body?.nuit),
    phone: String(body?.phone || "").trim(),
    clientId,
    guaranteedAmount: Number(body?.guaranteedAmount || 0),
    activeGuarantees: Number(body?.activeGuarantees || 0),
  };

  if (!data.name || !data.nuit || !data.phone) {
    return { valid: false, message: "Nome, NUIT e telefone do avalista sao obrigatorios." };
  }
  if (!PHONE_REGEX.test(data.phone)) {
    return { valid: false, message: "Telefone do avalista invalido. Use formato +258 seguido de 9 digitos." };
  }
  const guarantorNuitError = validateMozNuit(data.nuit, { required: true, label: "NUIT do avalista" });
  if (guarantorNuitError) {
    return { valid: false, message: guarantorNuitError };
  }
  if (!Number.isInteger(data.clientId) || data.clientId <= 0) {
    return { valid: false, message: "Selecione um cliente valido para o avalista." };
  }
  if (!Number.isFinite(data.guaranteedAmount) || data.guaranteedAmount < 0) {
    return { valid: false, message: "Valor garantido invalido." };
  }
  if (!Number.isInteger(data.activeGuarantees) || data.activeGuarantees < 0) {
    return { valid: false, message: "Quantidade de garantias ativas invalida." };
  }

  return { valid: true, data };
}

function validateCollateralPayload(body) {
  const clientId = Number(body?.clientId);
  const data = {
    clientId,
    collateralType: String(body?.collateralType || "").trim(),
    description: String(body?.description || "").trim(),
    estimatedValue: Number(body?.estimatedValue || 0),
    documentRef: String(body?.documentRef || "").trim(),
    status: String(body?.status || "active").trim().toLowerCase(),
  };

  if (!Number.isInteger(data.clientId) || data.clientId <= 0) {
    return { valid: false, message: "Selecione um cliente valido para a garantia." };
  }
  if (!data.collateralType) {
    return { valid: false, message: "Tipo de garantia e obrigatorio." };
  }
  if (!data.description) {
    return { valid: false, message: "Descricao da garantia e obrigatoria." };
  }
  if (!Number.isFinite(data.estimatedValue) || data.estimatedValue < 0) {
    return { valid: false, message: "Valor estimado da garantia invalido." };
  }
  if (!["active", "released"].includes(data.status)) {
    return { valid: false, message: "Estado da garantia invalido." };
  }

  return { valid: true, data };
}

clientRouter.get("/options", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para listar clientes." });
    const result = await query(
      `
      SELECT c.id, c.name, c.client_type
      FROM clients c
      WHERE c.company_id = $1
        AND NOT (
          c.client_type = 'singular'
          AND EXISTS (
            SELECT 1
            FROM client_group_members gm
            WHERE gm.company_id = c.company_id
              AND gm.member_client_id = c.id
          )
        )
      ORDER BY c.name ASC
      `,
      [scope.companyId],
    );
    return res.json({
      clients: result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        type: row.client_type || "singular",
      })),
    });
  } catch (error) {
    return next(error);
  }
});

clientRouter.get("/:id/evaluations", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar avaliacoes." });
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId)) return res.status(400).json({ message: "ID invalido." });

    const exists = await query("SELECT id FROM clients WHERE id = $1 AND company_id = $2 LIMIT 1", [clientId, scope.companyId]);
    if (!exists.rows[0]) return res.status(404).json({ message: "Cliente nao encontrado." });

    const result = await query(
      `
      SELECT
        ce.id,
        ce.client_id,
        ce.analyst_user_id,
        ce.final_score,
        ce.decision,
        ce.recommendation,
        ce.reasons,
        ce.note,
        ce.payload_snapshot,
        ce.created_at,
        u.full_name AS analyst_name
      FROM client_evaluations ce
      LEFT JOIN users u ON u.id = ce.analyst_user_id
      WHERE ce.client_id = $1 AND ce.company_id = $2
      ORDER BY ce.created_at DESC
      `,
      [clientId, scope.companyId],
    );

    return res.json({
      history: result.rows.map((row) => ({
        id: Number(row.id),
        clientId: Number(row.client_id),
        analystUserId: row.analyst_user_id ? Number(row.analyst_user_id) : null,
        analystName: row.analyst_name || "",
        finalScore: Number(row.final_score),
        decision: row.decision,
        recommendation: row.recommendation,
        reasons: Array.isArray(row.reasons) ? row.reasons : [],
        note: row.note || "",
        payloadSnapshot: row.payload_snapshot || {},
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

clientRouter.get("/:id/group-members", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar membros do grupo." });
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId) || clientId <= 0) return res.status(400).json({ message: "ID invalido." });

    const clientResult = await query(
      "SELECT id, client_type, group_name FROM clients WHERE id = $1 AND company_id = $2 LIMIT 1",
      [clientId, scope.companyId],
    );
    const client = clientResult.rows[0];
    if (!client) return res.status(404).json({ message: "Cliente nao encontrado." });
    if (client.client_type !== "grupo") return res.status(400).json({ message: "Cliente selecionado nao e do tipo grupo." });

    const rows = await query(
      `
      SELECT
        gm.id,
        gm.member_client_id,
        gm.member_name,
        gm.allocation_amount
      FROM client_group_members gm
      WHERE gm.company_id = $1
        AND gm.group_client_id = $2
      ORDER BY gm.id ASC
      `,
      [scope.companyId, clientId],
    );

    return res.json({
      group: {
        id: Number(client.id),
        name: client.group_name || "",
      },
      members: rows.rows.map((row) => ({
        id: Number(row.id),
        memberClientId: row.member_client_id ? Number(row.member_client_id) : null,
        memberName: row.member_name || "",
        allocationAmount: Number(row.allocation_amount || 0),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

clientRouter.post("/:id/evaluations", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para registrar avaliacao." });
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId)) return res.status(400).json({ message: "ID invalido." });

    const note = String(req.body?.note || "").trim();

    const clientResult = await query(
      `
      SELECT
        c.id,
        c.monthly_income,
        c.monthly_expenses,
        c.score,
        c.status,
        COALESCE(COUNT(l.id), 0) AS loans,
        COALESCE(SUM(l.balance), 0)::numeric(14,2) AS debt
      FROM clients c
      LEFT JOIN loans l ON l.client_id = c.id
      WHERE c.id = $1 AND c.company_id = $2
      GROUP BY c.id
      `,
      [clientId, scope.companyId],
    );

    const client = clientResult.rows[0];
    if (!client) return res.status(404).json({ message: "Cliente nao encontrado." });

    const evaluation = computeCreditEvaluation(client);
    const payloadSnapshot = {
      monthlyIncome: evaluation.monthlyIncome,
      monthlyExpenses: evaluation.monthlyExpenses,
      disposableIncome: evaluation.disposableIncome,
      debt: evaluation.debt,
      debtToIncome: evaluation.debtToIncome,
      loans: evaluation.loans,
      score: evaluation.score,
      status: evaluation.status,
    };

    const inserted = await query(
      `
      INSERT INTO client_evaluations (
        client_id, company_id, analyst_user_id, final_score, decision, recommendation, reasons, note, payload_snapshot
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb)
      RETURNING id, client_id, analyst_user_id, final_score, decision, recommendation, reasons, note, payload_snapshot, created_at
      `,
      [
        clientId,
        scope.companyId,
        req.user?.sub || null,
        evaluation.finalScore,
        evaluation.decision,
        evaluation.recommendation,
        JSON.stringify(evaluation.reasons),
        note || null,
        JSON.stringify(payloadSnapshot),
      ],
    );

    const analystResult = req.user?.sub
      ? await query("SELECT full_name FROM users WHERE id = $1 LIMIT 1", [req.user.sub])
      : { rows: [] };

    const row = inserted.rows[0];
    return res.status(201).json({
      message: "Avaliacao registrada com sucesso.",
      evaluation: {
        id: Number(row.id),
        clientId: Number(row.client_id),
        analystUserId: row.analyst_user_id ? Number(row.analyst_user_id) : null,
        analystName: analystResult.rows[0]?.full_name || "",
        finalScore: Number(row.final_score),
        decision: row.decision,
        recommendation: row.recommendation,
        reasons: Array.isArray(row.reasons) ? row.reasons : [],
        note: row.note || "",
        payloadSnapshot: row.payload_snapshot || {},
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

clientRouter.get("/:id/documents", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para consultar documentos." });
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId) || clientId <= 0) return res.status(400).json({ message: "ID invalido." });

    const clientResult = await query("SELECT id, name FROM clients WHERE id = $1 AND company_id = $2 LIMIT 1", [clientId, scope.companyId]);
    if (!clientResult.rows[0]) return res.status(404).json({ message: "Cliente nao encontrado." });

    const docsResult = await query(
      `
      SELECT
        cd.id,
        cd.client_id,
        cd.doc_type,
        cd.title,
        cd.version_no,
        cd.file_name,
        cd.mime_type,
        cd.file_size_bytes,
        cd.issued_on,
        cd.expires_on,
        cd.note,
        cd.uploaded_by_user_id,
        cd.uploaded_by_name,
        cd.uploaded_at
      FROM client_documents cd
      WHERE cd.company_id = $1
        AND cd.client_id = $2
      ORDER BY cd.doc_type ASC, cd.version_no DESC, cd.uploaded_at DESC
      `,
      [scope.companyId, clientId],
    );

    const versions = docsResult.rows.map((row) => ({
      id: Number(row.id),
      clientId: Number(row.client_id),
      docType: row.doc_type,
      title: row.title,
      versionNo: Number(row.version_no),
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSizeBytes: Number(row.file_size_bytes || 0),
      issuedOn: row.issued_on,
      expiresOn: row.expires_on,
      status: computeDocumentStatus(row.expires_on),
      note: row.note || "",
      uploadedByUserId: row.uploaded_by_user_id ? Number(row.uploaded_by_user_id) : null,
      uploadedByName: row.uploaded_by_name || "Sistema",
      uploadedAt: row.uploaded_at,
    }));

    const latestByTypeMap = new Map();
    for (const item of versions) {
      if (!latestByTypeMap.has(item.docType)) latestByTypeMap.set(item.docType, item);
    }

    const checklist = CLIENT_DOCUMENT_TYPES
      .filter((item) => item.required)
      .map((item) => {
        const doc = latestByTypeMap.get(item.type) || null;
        const status = !doc ? "missing" : doc.status;
        return {
          type: item.type,
          label: item.label,
          required: true,
          status,
          isCompliant: Boolean(doc && status !== "expired"),
          document: doc,
        };
      });

    const latestByType = Array.from(latestByTypeMap.values())
      .sort((a, b) => String(a.docType).localeCompare(String(b.docType), "pt"));

    return res.json({
      client: { id: Number(clientResult.rows[0].id), name: clientResult.rows[0].name },
      summary: {
        totalVersions: versions.length,
        requiredItems: checklist.length,
        compliantItems: checklist.filter((item) => item.isCompliant).length,
        missingItems: checklist.filter((item) => item.status === "missing").length,
        expiredItems: checklist.filter((item) => item.status === "expired").length,
        checklistCompleted: checklist.every((item) => item.isCompliant),
      },
      checklist,
      latestByType,
      versions,
    });
  } catch (error) {
    return next(error);
  }
});

clientRouter.post("/:id/documents", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para carregar documentos." });
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId) || clientId <= 0) return res.status(400).json({ message: "ID invalido." });

    const clientResult = await query("SELECT id, name FROM clients WHERE id = $1 AND company_id = $2 LIMIT 1", [clientId, scope.companyId]);
    if (!clientResult.rows[0]) return res.status(404).json({ message: "Cliente nao encontrado." });

    const docType = String(req.body?.docType || "").trim().toLowerCase();
    if (!CLIENT_DOCUMENT_TYPES.some((item) => item.type === docType)) {
      return res.status(400).json({ message: "Tipo de documento invalido." });
    }

    const title = String(req.body?.title || "").trim() || CLIENT_DOCUMENT_TYPES.find((item) => item.type === docType)?.label || "Documento";
    const note = String(req.body?.note || "").trim();
    const issuedOn = String(req.body?.issuedOn || "").trim();
    const expiresOn = String(req.body?.expiresOn || "").trim();
    if (issuedOn && !isValidIsoDate(issuedOn)) return res.status(400).json({ message: "Data de emissao invalida." });
    if (expiresOn && !isValidIsoDate(expiresOn)) return res.status(400).json({ message: "Data de validade invalida." });

    const mimeType = String(req.body?.mimeType || "").trim().toLowerCase();
    if (!ALLOWED_DOCUMENT_MIME.has(mimeType)) {
      return res.status(400).json({ message: "Tipo de ficheiro invalido. Use PDF, PNG ou JPG." });
    }

    const base64Data = normalizeBase64Input(req.body?.fileBase64);
    if (!base64Data) return res.status(400).json({ message: "Ficheiro nao informado." });

    let fileBuffer;
    try {
      fileBuffer = Buffer.from(base64Data, "base64");
    } catch {
      return res.status(400).json({ message: "Ficheiro em base64 invalido." });
    }
    if (!fileBuffer || fileBuffer.length === 0) return res.status(400).json({ message: "Ficheiro vazio." });
    if (fileBuffer.length > MAX_DOCUMENT_BYTES) {
      return res.status(400).json({ message: "Ficheiro excede o limite de 10MB." });
    }

    const sourceFileName = safeFileName(String(req.body?.fileName || "documento"));
    const ext = mimeExtension(mimeType);
    const actorName = String(req.user?.name || "").trim() || "Sistema";
    const actorId = Number(req.user?.sub) || null;

    const versionResult = await query(
      `
      SELECT COALESCE(MAX(version_no), 0)::INT AS max_version
      FROM client_documents
      WHERE company_id = $1
        AND client_id = $2
        AND doc_type = $3
      `,
      [scope.companyId, clientId, docType],
    );
    const nextVersion = Number(versionResult.rows[0]?.max_version || 0) + 1;

    const folder = path.join(CLIENT_DOCUMENTS_ROOT, `company-${scope.companyId}`, `client-${clientId}`, docType);
    await fs.mkdir(folder, { recursive: true });
    const stampedName = `v${nextVersion}-${Date.now()}-${sourceFileName.replace(/\.[^.]+$/, "")}.${ext}`;
    const absolutePath = path.join(folder, stampedName);
    await fs.writeFile(absolutePath, fileBuffer);

    const inserted = await query(
      `
      INSERT INTO client_documents (
        company_id,
        client_id,
        doc_type,
        title,
        version_no,
        file_name,
        mime_type,
        file_size_bytes,
        storage_path,
        issued_on,
        expires_on,
        note,
        uploaded_by_user_id,
        uploaded_by_name
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF($10, '')::date, NULLIF($11, '')::date, $12, $13, $14)
      RETURNING id, doc_type, title, version_no, file_name, mime_type, file_size_bytes, issued_on, expires_on, note, uploaded_by_user_id, uploaded_by_name, uploaded_at
      `,
      [
        scope.companyId,
        clientId,
        docType,
        title,
        nextVersion,
        sourceFileName,
        mimeType,
        fileBuffer.length,
        absolutePath,
        issuedOn,
        expiresOn,
        note || null,
        actorId,
        actorName,
      ],
    );

    const row = inserted.rows[0];
    return res.status(201).json({
      message: `Documento carregado com sucesso (versao ${Number(row.version_no)}).`,
      document: {
        id: Number(row.id),
        docType: row.doc_type,
        title: row.title,
        versionNo: Number(row.version_no),
        fileName: row.file_name,
        mimeType: row.mime_type,
        fileSizeBytes: Number(row.file_size_bytes || 0),
        issuedOn: row.issued_on,
        expiresOn: row.expires_on,
        status: computeDocumentStatus(row.expires_on),
        note: row.note || "",
        uploadedByUserId: row.uploaded_by_user_id ? Number(row.uploaded_by_user_id) : null,
        uploadedByName: row.uploaded_by_name || "Sistema",
        uploadedAt: row.uploaded_at,
      },
    });
  } catch (error) {
    return next(error);
  }
});

clientRouter.get("/:id/documents/:documentId/download", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para descarregar documentos." });
    const clientId = Number(req.params.id);
    const documentId = Number(req.params.documentId);
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(documentId) || documentId <= 0) {
      return res.status(400).json({ message: "Identificadores invalidos." });
    }

    const result = await query(
      `
      SELECT id, file_name, mime_type, storage_path
      FROM client_documents
      WHERE id = $1
        AND company_id = $2
        AND client_id = $3
      LIMIT 1
      `,
      [documentId, scope.companyId, clientId],
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ message: "Documento nao encontrado." });

    const resolvedRoot = path.resolve(CLIENT_DOCUMENTS_ROOT);
    const resolvedFile = path.resolve(String(row.storage_path || ""));
    if (!resolvedFile.startsWith(resolvedRoot)) {
      return res.status(400).json({ message: "Caminho de ficheiro invalido." });
    }

    try {
      await fs.access(resolvedFile);
    } catch {
      return res.status(404).json({ message: "Ficheiro do documento nao encontrado no armazenamento." });
    }

    res.setHeader("Content-Type", row.mime_type || "application/octet-stream");
    return res.download(resolvedFile, row.file_name || `documento-${documentId}`);
  } catch (error) {
    return next(error);
  }
});

clientRouter.get("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para listar clientes." });
    const privacyResult = await query(
      "SELECT privacy_mask_sensitive_data, privacy_allow_cross_company_lookup FROM companies WHERE id = $1 LIMIT 1",
      [scope.companyId],
    );
    const maskSensitiveData = Boolean(privacyResult.rows[0]?.privacy_mask_sensitive_data);
    const allowCrossCompanyLookup = Boolean(privacyResult.rows[0]?.privacy_allow_cross_company_lookup);
    const canCrossLookup = allowCrossCompanyLookup || isCentralAdmin(req);
    const { search = "", type = "all" } = req.query;
    const carteiraIdRaw = Number(req.query.carteiraId);
    const carteiraIdFilter = Number.isInteger(carteiraIdRaw) && carteiraIdRaw > 0 ? carteiraIdRaw : null;
    const normalizedSearch = String(search).trim().toLowerCase();
    const searchValue = `%${normalizedSearch}%`;
    const validType = ["all", "singular", "grupo", "empresa"].includes(String(type)) ? String(type) : "all";

    const clientsResult = await query(
      `
      SELECT
        c.id,
        c.name,
        c.client_type AS type,
        c.nuit,
        c.phone,
        c.email,
        c.phone_alt,
        c.document_type,
        c.document_number,
        c.birth_date,
        c.gender,
        c.marital_status,
        c.nationality,
        c.province,
        c.city,
        c.district,
        c.neighborhood,
        c.address_line,
        c.house_number,
        c.occupation,
        c.employer_name,
        c.monthly_income,
        c.monthly_expenses,
        c.business_name,
        c.business_sector,
        c.group_name,
        c.group_description,
        c.group_leader_name,
        c.registration_date,
        c.notes,
        c.score,
        c.status,
        c.carteira_id,
        (SELECT p.name FROM portfolios p WHERE p.id = c.carteira_id) AS carteira_nome,
        (SELECT p.gestor_name FROM portfolios p WHERE p.id = c.carteira_id) AS gestor_name,
        (SELECT p.gestor_user_id FROM portfolios p WHERE p.id = c.carteira_id) AS gestor_user_id,
        COALESCE(COUNT(l.id), 0) AS loans,
        COALESCE(SUM(l.balance), 0)::numeric(14,2) AS debt,
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', gm.id,
                'memberClientId', gm.member_client_id,
                'memberName', gm.member_name,
                'allocationAmount', gm.allocation_amount
              )
              ORDER BY gm.id ASC
            )
            FROM client_group_members gm
            WHERE gm.group_client_id = c.id
              AND gm.company_id = c.company_id
          ),
          '[]'::jsonb
        ) AS group_members
      FROM clients c
      LEFT JOIN loans l ON l.client_id = c.id
      WHERE (LOWER(c.name) LIKE $1 OR c.nuit LIKE $1)
        AND ($2 = 'all' OR c.client_type = $2)
        AND c.company_id = $3
        AND ($4::int IS NULL OR c.carteira_id = $4::int)
        AND NOT (
          c.client_type = 'singular'
          AND EXISTS (
            SELECT 1
            FROM client_group_members gm_hidden
            WHERE gm_hidden.company_id = c.company_id
              AND gm_hidden.member_client_id = c.id
          )
        )
      GROUP BY c.id
      ORDER BY c.name ASC
    `,
      [searchValue, validType, scope.companyId, carteiraIdFilter],
    );

    const statsResult = await query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.client_type = 'singular')::int AS singular,
        COUNT(*) FILTER (WHERE c.client_type = 'grupo')::int AS grupo,
        COUNT(*) FILTER (WHERE c.client_type = 'empresa')::int AS empresa
      FROM clients c
      WHERE c.company_id = $1
        AND NOT (
          c.client_type = 'singular'
          AND EXISTS (
            SELECT 1
            FROM client_group_members gm_hidden
            WHERE gm_hidden.company_id = c.company_id
              AND gm_hidden.member_client_id = c.id
          )
        )
    `,
      [scope.companyId],
    );

    const guarantorsResult = await query(
      `
      SELECT g.id, g.name, g.nuit, g.phone, g.client_id, c.name AS client_name, g.guaranteed_amount, g.active_guarantees
      FROM guarantors g
      LEFT JOIN clients c ON c.id = g.client_id
      WHERE g.company_id = $1
      ORDER BY g.name ASC
    `,
      [scope.companyId],
    );

    const collateralsResult = await query(
      `
      SELECT
        co.id,
        co.client_id,
        c.name AS client_name,
        co.collateral_type,
        co.description,
        co.estimated_value,
        co.document_ref,
        co.status,
        co.created_at
      FROM collaterals co
      LEFT JOIN clients c ON c.id = co.client_id
      WHERE co.company_id = $1
      ORDER BY co.created_at DESC
    `,
      [scope.companyId],
    );

    const stats = statsResult.rows[0];
    let crossCompanyMatches = [];

    if (canCrossLookup && normalizedSearch.length >= 2) {
      const crossResult = await query(
        `
        SELECT
          c.id,
          c.name,
          c.nuit,
          c.score,
          c.status,
          c.company_id,
          co.name AS company_name,
          COALESCE(SUM(l.balance), 0)::numeric(14,2) AS debt,
          COALESCE(
            COUNT(l.id) FILTER (
              WHERE LOWER(COALESCE(l.status, '')) IN ('pending', 'approved', 'disbursed', 'active', 'overdue', 'delayed')
            ),
            0
          )::int AS active_loans
        FROM clients c
        JOIN companies co ON co.id = c.company_id
        LEFT JOIN loans l ON l.client_id = c.id AND l.company_id = c.company_id
        WHERE c.company_id <> $1
          AND (LOWER(c.name) LIKE $2 OR c.nuit LIKE $2)
          AND co.is_active = true
          AND co.privacy_allow_cross_company_lookup = true
        GROUP BY c.id, c.name, c.nuit, c.score, c.status, c.company_id, co.name
        ORDER BY active_loans DESC, debt DESC, c.name ASC
        LIMIT 40
        `,
        [scope.companyId, searchValue],
      );

      crossCompanyMatches = crossResult.rows.map((row) => ({
        clientId: Number(row.id),
        clientName: row.name || "",
        nuit: maskSensitiveData ? maskRight(row.nuit, 3) : (row.nuit || ""),
        score: Number(row.score || 0),
        status: row.status || "active",
        debt: Number(row.debt || 0),
        activeLoans: Number(row.active_loans || 0),
        companyId: Number(row.company_id),
        companyName: row.company_name || "",
      }));
    }

    return res.json({
      stats: {
        total: Number(stats.total),
        singular: Number(stats.singular),
        grupo: Number(stats.grupo),
        empresa: Number(stats.empresa),
        guarantors: guarantorsResult.rowCount,
        collaterals: collateralsResult.rowCount,
      },
      clients: clientsResult.rows.map((row) => {
        const client = toClient(row);
        if (!maskSensitiveData) return client;
        return {
          ...client,
          nuit: maskRight(client.nuit, 3),
          phone: maskRight(client.phone, 3),
          phoneAlt: client.phoneAlt ? maskRight(client.phoneAlt, 3) : "",
          documentNumber: client.documentNumber ? maskRight(client.documentNumber, 3) : "",
        };
      }),
      guarantors: guarantorsResult.rows.map((g) => ({
        id: Number(g.id),
        name: g.name,
        nuit: maskSensitiveData ? maskRight(g.nuit, 3) : g.nuit,
        phone: maskSensitiveData ? maskRight(g.phone, 3) : g.phone,
        clientId: g.client_id ? Number(g.client_id) : null,
        clientName: g.client_name || "",
        guaranteedAmount: Number(g.guaranteed_amount),
        activeGuarantees: Number(g.active_guarantees),
      })),
      collaterals: collateralsResult.rows.map((co) => ({
        id: Number(co.id),
        clientId: co.client_id ? Number(co.client_id) : null,
        clientName: co.client_name || "",
        collateralType: co.collateral_type || "",
        description: co.description || "",
        estimatedValue: Number(co.estimated_value || 0),
        documentRef: co.document_ref || "",
        status: co.status || "active",
        createdAt: co.created_at,
      })),
      crossCompanyMatches,
    });
  } catch (error) {
    return next(error);
  }
});

clientRouter.post("/guarantors", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para cadastrar avalista." });
    const validation = validateGuarantorPayload(req.body);
    if (!validation.valid) return res.status(400).json({ message: validation.message });
    const d = validation.data;

    const clientExists = await query("SELECT id, name FROM clients WHERE id = $1 AND company_id = $2", [d.clientId, scope.companyId]);
    if (!clientExists.rows[0]) return res.status(400).json({ message: "Cliente selecionado nao existe nesta empresa." });

    const inserted = await query(
      `
      INSERT INTO guarantors (name, nuit, phone, client_id, company_id, guaranteed_amount, active_guarantees)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, name, nuit, phone, client_id, guaranteed_amount, active_guarantees
      `,
      [d.name, d.nuit, d.phone, d.clientId, scope.companyId, d.guaranteedAmount, d.activeGuarantees],
    );
    const clientResult = clientExists;

    return res.status(201).json({
      message: "Avalista criado com sucesso.",
      guarantor: {
        id: Number(inserted.rows[0].id),
        name: inserted.rows[0].name,
        nuit: inserted.rows[0].nuit,
        phone: inserted.rows[0].phone,
        clientId: inserted.rows[0].client_id ? Number(inserted.rows[0].client_id) : null,
        clientName: clientResult.rows[0]?.name || "",
        guaranteedAmount: Number(inserted.rows[0].guaranteed_amount),
        activeGuarantees: Number(inserted.rows[0].active_guarantees),
      },
    });
  } catch (error) {
    if (error?.code === "23503") return res.status(400).json({ message: "Cliente selecionado nao existe." });
    if (error?.code === "23505") {
      if (String(error?.constraint || "").includes("ux_guarantors_client_id")) {
        return res.status(409).json({ message: "Este cliente ja possui avalista associado." });
      }
      return res.status(409).json({ message: "NUIT do avalista ja existe." });
    }
    return next(error);
  }
});

clientRouter.put("/guarantors/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para atualizar avalista." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });

    const validation = validateGuarantorPayload(req.body);
    if (!validation.valid) return res.status(400).json({ message: validation.message });
    const d = validation.data;

    const clientExists = await query("SELECT id, name FROM clients WHERE id = $1 AND company_id = $2", [d.clientId, scope.companyId]);
    if (!clientExists.rows[0]) return res.status(400).json({ message: "Cliente selecionado nao existe nesta empresa." });

    const updated = await query(
      `
      UPDATE guarantors
      SET name = $1, nuit = $2, phone = $3, client_id = $4, guaranteed_amount = $5, active_guarantees = $6
      WHERE id = $7 AND company_id = $8
      RETURNING id, name, nuit, phone, client_id, guaranteed_amount, active_guarantees
      `,
      [d.name, d.nuit, d.phone, d.clientId, d.guaranteedAmount, d.activeGuarantees, id, scope.companyId],
    );

    if (!updated.rows[0]) return res.status(404).json({ message: "Avalista nao encontrado." });
    const clientResult = clientExists;
    return res.json({
      message: "Avalista atualizado com sucesso.",
      guarantor: {
        id: Number(updated.rows[0].id),
        name: updated.rows[0].name,
        nuit: updated.rows[0].nuit,
        phone: updated.rows[0].phone,
        clientId: updated.rows[0].client_id ? Number(updated.rows[0].client_id) : null,
        clientName: clientResult.rows[0]?.name || "",
        guaranteedAmount: Number(updated.rows[0].guaranteed_amount),
        activeGuarantees: Number(updated.rows[0].active_guarantees),
      },
    });
  } catch (error) {
    if (error?.code === "23503") return res.status(400).json({ message: "Cliente selecionado nao existe." });
    if (error?.code === "23505") {
      if (String(error?.constraint || "").includes("ux_guarantors_client_id")) {
        return res.status(409).json({ message: "Este cliente ja possui avalista associado." });
      }
      return res.status(409).json({ message: "NUIT do avalista ja existe." });
    }
    return next(error);
  }
});

clientRouter.delete("/guarantors/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para remover avalista." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });
    const removed = await query("DELETE FROM guarantors WHERE id = $1 AND company_id = $2 RETURNING id", [id, scope.companyId]);
    if (!removed.rows[0]) return res.status(404).json({ message: "Avalista nao encontrado." });
    return res.json({ message: "Avalista removido com sucesso." });
  } catch (error) {
    return next(error);
  }
});

clientRouter.post("/collaterals", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para cadastrar garantia." });
    const validation = validateCollateralPayload(req.body);
    if (!validation.valid) return res.status(400).json({ message: validation.message });
    const d = validation.data;

    const clientExists = await query("SELECT id, name FROM clients WHERE id = $1 AND company_id = $2", [d.clientId, scope.companyId]);
    if (!clientExists.rows[0]) return res.status(400).json({ message: "Cliente selecionado nao existe nesta empresa." });

    const inserted = await query(
      `
      INSERT INTO collaterals (client_id, company_id, collateral_type, description, estimated_value, document_ref, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, client_id, collateral_type, description, estimated_value, document_ref, status, created_at
      `,
      [d.clientId, scope.companyId, d.collateralType, d.description, d.estimatedValue, d.documentRef || null, d.status],
    );

    return res.status(201).json({
      message: "Garantia criada com sucesso.",
      collateral: {
        id: Number(inserted.rows[0].id),
        clientId: inserted.rows[0].client_id ? Number(inserted.rows[0].client_id) : null,
        clientName: clientExists.rows[0]?.name || "",
        collateralType: inserted.rows[0].collateral_type,
        description: inserted.rows[0].description,
        estimatedValue: Number(inserted.rows[0].estimated_value || 0),
        documentRef: inserted.rows[0].document_ref || "",
        status: inserted.rows[0].status || "active",
        createdAt: inserted.rows[0].created_at,
      },
    });
  } catch (error) {
    if (error?.code === "23503") return res.status(400).json({ message: "Cliente selecionado nao existe." });
    return next(error);
  }
});

clientRouter.put("/collaterals/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para atualizar garantia." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });
    const validation = validateCollateralPayload(req.body);
    if (!validation.valid) return res.status(400).json({ message: validation.message });
    const d = validation.data;

    const clientExists = await query("SELECT id, name FROM clients WHERE id = $1 AND company_id = $2", [d.clientId, scope.companyId]);
    if (!clientExists.rows[0]) return res.status(400).json({ message: "Cliente selecionado nao existe nesta empresa." });

    const updated = await query(
      `
      UPDATE collaterals
      SET client_id = $1, collateral_type = $2, description = $3, estimated_value = $4, document_ref = $5, status = $6
      WHERE id = $7 AND company_id = $8
      RETURNING id, client_id, collateral_type, description, estimated_value, document_ref, status, created_at
      `,
      [d.clientId, d.collateralType, d.description, d.estimatedValue, d.documentRef || null, d.status, id, scope.companyId],
    );

    if (!updated.rows[0]) return res.status(404).json({ message: "Garantia nao encontrada." });
    return res.json({
      message: "Garantia atualizada com sucesso.",
      collateral: {
        id: Number(updated.rows[0].id),
        clientId: updated.rows[0].client_id ? Number(updated.rows[0].client_id) : null,
        clientName: clientExists.rows[0]?.name || "",
        collateralType: updated.rows[0].collateral_type,
        description: updated.rows[0].description,
        estimatedValue: Number(updated.rows[0].estimated_value || 0),
        documentRef: updated.rows[0].document_ref || "",
        status: updated.rows[0].status || "active",
        createdAt: updated.rows[0].created_at,
      },
    });
  } catch (error) {
    if (error?.code === "23503") return res.status(400).json({ message: "Cliente selecionado nao existe." });
    return next(error);
  }
});

clientRouter.delete("/collaterals/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para remover garantia." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });
    const removed = await query("DELETE FROM collaterals WHERE id = $1 AND company_id = $2 RETURNING id", [id, scope.companyId]);
    if (!removed.rows[0]) return res.status(404).json({ message: "Garantia nao encontrada." });
    return res.json({ message: "Garantia removida com sucesso." });
  } catch (error) {
    return next(error);
  }
});

clientRouter.post("/", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) {
      return res.status(400).json({ message: "Selecione uma empresa para cadastrar cliente." });
    }
    const validation = validateClientPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }
    const d = validation.data;
    const duplicateMessage = await findFirstClientDuplicate({
      companyId: scope.companyId,
      nuit: d.nuit,
      documentNumber: d.documentNumber,
      email: d.email,
      phone: d.phone,
      phoneAlt: d.phoneAlt,
    });
    if (duplicateMessage) return res.status(409).json({ message: duplicateMessage });

    const inserted = await query(
      `
      INSERT INTO clients (
        name, client_type, nuit, phone, email, phone_alt, document_type, document_number, birth_date,
        gender, marital_status, nationality, province, city, district, neighborhood, address_line,
        house_number, occupation, employer_name, monthly_income, monthly_expenses, company_id, business_name,
        business_sector, group_name, group_description, group_leader_name, registration_date, notes, score, status,
        created_by_user_id, created_by_name, carteira_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
      RETURNING id, name, client_type AS type, nuit, phone, email, phone_alt, document_type, document_number, birth_date,
        gender, marital_status, nationality, province, city, district, neighborhood, address_line,
        house_number, occupation, employer_name, monthly_income, monthly_expenses, business_name, group_name, group_description, group_leader_name,
        business_sector, registration_date, notes, score, status
      `,
      [
        d.name, d.type, d.nuit, d.phone, d.email, d.phoneAlt, d.documentType, d.documentNumber, d.birthDate,
        d.gender, d.maritalStatus, d.nationality, d.province, d.city, d.district, d.neighborhood, d.addressLine,
        d.houseNumber, d.occupation, d.employerName, d.monthlyIncome, d.monthlyExpenses, scope.companyId, d.businessName,
        d.businessSector,
        d.type === "grupo" ? d.groupName : null,
        d.type === "grupo" ? d.groupDescription : null,
        d.type === "grupo" ? d.groupLeaderName : null,
        d.registrationDate || null,
        d.notes, d.score, d.status,
        Number(req.user?.id) > 0 ? Number(req.user.id) : null,
        String(req.user?.name || req.user?.fullName || "").trim() || null,
        Number(req.body?.carteiraId) > 0 ? Number(req.body.carteiraId) : null,
      ],
    );

    const clientId = Number(inserted.rows[0].id);
    if (d.type === "grupo") {
      for (const member of d.groupMembers) {
        await query(
          `
          INSERT INTO client_group_members (company_id, group_client_id, member_client_id, member_name, allocation_amount)
          VALUES ($1,$2,$3,$4,$5)
          `,
          [scope.companyId, clientId, member.memberClientId, member.memberName || `Membro ${clientId}`, Number(member.allocationAmount || 0)],
        );
      }
    }

    // Salva garantias do cliente enviadas no cadastro
    const collaterals = Array.isArray(req.body?.collaterals)
      ? req.body.collaterals
      : Array.isArray(req.body?.collateralRows)
        ? req.body.collateralRows
        : [];
    for (const col of collaterals) {
      if (col && (col.description || col.collateralType || Number(col.estimatedValue) > 0)) {
        await query(
          `
          INSERT INTO collaterals (client_id, company_id, collateral_type, description, estimated_value, document_ref, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            clientId,
            scope.companyId,
            String(col.collateralType || "Imovel").trim(),
            String(col.description || "Garantia do cliente").trim(),
            Number(col.estimatedValue || 0),
            col.documentRef ? String(col.documentRef).trim() : null,
            String(col.status || "active").trim(),
          ],
        );
      }
    }

    // Salva avalista do cliente e suas garantias enviadas no cadastro
    if (req.body?.hasGuarantor || req.body?.guarantor) {
      const g = req.body.guarantor || {};
      const gName = String(g.name || "").trim();
      if (gName) {
        const gNuit = String(g.nuit || "").trim();
        const gPhone = String(g.phone || "").trim();
        const gAmount = Number(g.guaranteedAmount || g.valorGarantido || 0);

        await query(
          `
          INSERT INTO guarantors (name, nuit, phone, client_id, company_id, guaranteed_amount, active_guarantees)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (nuit) DO UPDATE
          SET name = EXCLUDED.name, phone = EXCLUDED.phone, client_id = EXCLUDED.client_id, guaranteed_amount = EXCLUDED.guaranteed_amount, active_guarantees = 1
          `,
          [gName, gNuit || `AV-${Date.now().toString(36)}`, gPhone || "—", clientId, scope.companyId, gAmount, 1],
        );

        if (g.hasCollateral && (g.collateralDescription || g.collateralType || Number(g.collateralValue) > 0)) {
          await query(
            `
            INSERT INTO collaterals (client_id, company_id, collateral_type, description, estimated_value, document_ref, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              clientId,
              scope.companyId,
              String(g.collateralType || "Avalista").trim(),
              `[Avalista: ${gName}] ${String(g.collateralDescription || "Garantia do Avalista").trim()}`,
              Number(g.collateralValue || 0),
              g.collateralDocumentRef ? String(g.collateralDocumentRef).trim() : null,
              "active",
            ],
          );
        }
      }
    }

    return res.status(201).json({ message: "Cliente criado com sucesso com garantias e avalista vinculados.", client: toClient(inserted.rows[0]) });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ message: "NUIT ja existe." });
    return next(error);
  }
});

clientRouter.put("/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para atualizar cliente." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });

    const validation = validateClientPayload(req.body);
    if (!validation.valid) return res.status(400).json({ message: validation.message });
    const d = validation.data;
    const duplicateMessage = await findFirstClientDuplicate({
      companyId: scope.companyId,
      currentClientId: id,
      nuit: d.nuit,
      documentNumber: d.documentNumber,
      email: d.email,
      phone: d.phone,
      phoneAlt: d.phoneAlt,
    });
    if (duplicateMessage) return res.status(409).json({ message: duplicateMessage });

    const updated = await query(
      `
      UPDATE clients SET
        name = $1, client_type = $2, nuit = $3, phone = $4, email = $5, phone_alt = $6, document_type = $7,
        document_number = $8, birth_date = $9, gender = $10, marital_status = $11, nationality = $12,
        province = $13, city = $14, district = $15, neighborhood = $16, address_line = $17, house_number = $18,
        occupation = $19, employer_name = $20, monthly_income = $21, monthly_expenses = $22, business_name = $23,
        business_sector = $24, group_name = $25, group_description = $26, group_leader_name = $27, registration_date = $28, notes = $29, score = $30, status = $31,
        updated_by_user_id = $32, updated_by_name = $33,
        carteira_id = COALESCE($36, carteira_id)
      WHERE id = $34 AND company_id = $35
      RETURNING id, name, client_type AS type, nuit, phone, email, phone_alt, document_type, document_number, birth_date,
        gender, marital_status, nationality, province, city, district, neighborhood, address_line,
        house_number, occupation, employer_name, monthly_income, monthly_expenses, business_name, group_name, group_description, group_leader_name,
        business_sector, registration_date, notes, score, status
      `,
      [
        d.name, d.type, d.nuit, d.phone, d.email, d.phoneAlt, d.documentType, d.documentNumber, d.birthDate,
        d.gender, d.maritalStatus, d.nationality, d.province, d.city, d.district, d.neighborhood, d.addressLine,
        d.houseNumber, d.occupation, d.employerName, d.monthlyIncome, d.monthlyExpenses, d.businessName,
        d.businessSector,
        d.type === "grupo" ? d.groupName : null,
        d.type === "grupo" ? d.groupDescription : null,
        d.type === "grupo" ? d.groupLeaderName : null,
        d.registrationDate || null,
        d.notes, d.score, d.status,
        Number(req.user?.id) > 0 ? Number(req.user.id) : null,
        String(req.user?.name || req.user?.fullName || "").trim() || null,
        id, scope.companyId,
        Number(req.body?.carteiraId) > 0 ? Number(req.body.carteiraId) : null,
      ],
    );

    if (!updated.rows[0]) return res.status(404).json({ message: "Cliente nao encontrado." });
    await query("DELETE FROM client_group_members WHERE company_id = $1 AND group_client_id = $2", [scope.companyId, id]);
    if (d.type === "grupo") {
      for (const member of d.groupMembers) {
        await query(
          `
          INSERT INTO client_group_members (company_id, group_client_id, member_client_id, member_name, allocation_amount)
          VALUES ($1,$2,$3,$4,$5)
          `,
          [scope.companyId, id, member.memberClientId, member.memberName || `Membro ${id}`, Number(member.allocationAmount || 0)],
        );
      }
    }

    // Sincroniza garantias do cliente na actualizacao
    if (Array.isArray(req.body?.collaterals) || Array.isArray(req.body?.collateralRows)) {
      const collaterals = Array.isArray(req.body?.collaterals)
        ? req.body.collaterals
        : req.body.collateralRows;
      
      // Remove garantias antigas do cliente para sincronizar com as do formulario
      await query("DELETE FROM collaterals WHERE client_id = $1 AND company_id = $2", [id, scope.companyId]);
      
      for (const col of collaterals) {
        if (col && (col.description || col.collateralType || Number(col.estimatedValue) > 0)) {
          await query(
            `
            INSERT INTO collaterals (client_id, company_id, collateral_type, description, estimated_value, document_ref, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              id,
              scope.companyId,
              String(col.collateralType || "Imovel").trim(),
              String(col.description || "Garantia do cliente").trim(),
              Number(col.estimatedValue || 0),
              col.documentRef ? String(col.documentRef).trim() : null,
              String(col.status || "active").trim(),
            ],
          );
        }
      }
    }

    // Sincroniza avalista do cliente na actualizacao
    if (req.body?.hasGuarantor && req.body?.guarantor) {
      const g = req.body.guarantor || {};
      const gName = String(g.name || "").trim();
      if (gName) {
        const gNuit = String(g.nuit || "").trim();
        const gPhone = String(g.phone || "").trim();
        const gAmount = Number(g.guaranteedAmount || g.valorGarantido || 0);

        const existingG = await query("SELECT id FROM guarantors WHERE client_id = $1 AND company_id = $2 LIMIT 1", [id, scope.companyId]);
        if (existingG.rows[0]) {
          await query(
            `
            UPDATE guarantors
            SET name = $1, nuit = $2, phone = $3, guaranteed_amount = $4, active_guarantees = 1
            WHERE id = $5 AND company_id = $6
            `,
            [gName, gNuit || "000000000", gPhone || "—", gAmount, existingG.rows[0].id, scope.companyId],
          );
        } else {
          await query(
            `
            INSERT INTO guarantors (name, nuit, phone, client_id, company_id, guaranteed_amount, active_guarantees)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (nuit) DO UPDATE
            SET name = EXCLUDED.name, phone = EXCLUDED.phone, client_id = EXCLUDED.client_id, guaranteed_amount = EXCLUDED.guaranteed_amount, active_guarantees = 1
            `,
            [gName, gNuit || `AV-${Date.now().toString(36)}`, gPhone || "—", id, scope.companyId, gAmount, 1],
          );
        }

        if (g.hasCollateral && (g.collateralDescription || g.collateralType || Number(g.collateralValue) > 0)) {
          await query(
            `
            INSERT INTO collaterals (client_id, company_id, collateral_type, description, estimated_value, document_ref, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              id,
              scope.companyId,
              String(g.collateralType || "Avalista").trim(),
              `[Avalista: ${gName}] ${String(g.collateralDescription || "Garantia do Avalista").trim()}`,
              Number(g.collateralValue || 0),
              g.collateralDocumentRef ? String(g.collateralDocumentRef).trim() : null,
              "active",
            ],
          );
        }
      }
    } else if (req.body?.hasGuarantor === false) {
      // Se explicitamente indicado sem avalista, desvincula avalista anterior
      await query("DELETE FROM guarantors WHERE client_id = $1 AND company_id = $2", [id, scope.companyId]);
    }

    return res.json({ message: "Cliente atualizado com sucesso.", client: toClient(updated.rows[0]) });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ message: "NUIT ja existe." });
    return next(error);
  }
});

clientRouter.delete("/:id", async (req, res, next) => {
  try {
    const scope = resolveCompanyScope(req);
    if (!scope.companyId) return res.status(400).json({ message: "Selecione uma empresa para remover cliente." });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "ID invalido." });
    const removed = await query("DELETE FROM clients WHERE id = $1 AND company_id = $2 RETURNING id", [id, scope.companyId]);
    if (!removed.rows[0]) return res.status(404).json({ message: "Cliente nao encontrado." });
    return res.json({ message: "Cliente removido com sucesso." });
  } catch (error) {
    return next(error);
  }
});
