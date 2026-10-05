const TRANSITIONS = Object.freeze({
  pending_analyst: new Set(["pending_manager", "rejected"]),
  pending_manager: new Set(["pending_final", "rejected"]),
  pending_final: new Set(["approved", "rejected"]),
  risk_blocked: new Set(["rejected"]),
  rejected: new Set(),
  approved: new Set(["disbursed"]),
  disbursed: new Set(),
});

export function getCreditWorkflowNextStatus(currentStatus, decision, { isAdmin = false, directApproval = false } = {}) {
  const current = String(currentStatus || "").trim().toLowerCase();
  const action = String(decision || "").trim().toLowerCase();

  if (action === "reopen") {
    if (!["rejected", "risk_blocked"].includes(current)) {
      throw new Error("Apenas pedidos rejeitados ou bloqueados podem ser reabertos.");
    }
    return null;
  }

  if (action === "reject") {
    if (!["pending_analyst", "pending_manager", "pending_final", "risk_blocked"].includes(current)) {
      throw new Error("A solicitacao nao pode ser rejeitada a partir do estado atual.");
    }
    return "rejected";
  }

  if (action !== "approve") {
    throw new Error("Acao de workflow invalida.");
  }

  if (current === "pending_analyst") return isAdmin && directApproval ? "approved" : "pending_manager";
  if (current === "pending_manager") return isAdmin && directApproval ? "approved" : "pending_final";
  if (current === "pending_final") return "approved";
  if (current === "approved") return "disbursed";

  throw new Error("A solicitacao nao pode avancar para aprovacao a partir do estado atual.");
}

export async function recordCreditWorkflowTransition(dbClient, {
  companyId,
  requestId,
  previousStatus,
  nextStatus,
  action,
  reason = null,
  actorUserId = null,
  actorName = null,
  actorRole = null,
  metadata = {},
}) {
  if (!dbClient) throw new Error("Conexao de banco obrigatoria para registar transicao.");
  if (!Number.isInteger(Number(companyId)) || !Number.isInteger(Number(requestId))) {
    throw new Error("Empresa e solicitacao sao obrigatorias para auditar o workflow.");
  }

  await dbClient.query(
    `
    INSERT INTO credit_workflow_audit (
      company_id, request_id, previous_status, next_status,
      action, reason, actor_user_id, actor_name, actor_role, metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    `,
    [
      Number(companyId),
      Number(requestId),
      String(previousStatus || ""),
      String(nextStatus || ""),
      String(action || ""),
      reason ? String(reason) : null,
      actorUserId ? Number(actorUserId) : null,
      actorName ? String(actorName) : null,
      actorRole ? String(actorRole) : null,
      JSON.stringify(metadata || {}),
    ],
  );
}
