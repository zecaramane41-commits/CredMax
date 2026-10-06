# CredMax — Auditoria vs. Arquitetura Oficial (Fase 1 · Fundação)

> **Propósito:** classificar cada funcionalidade existente do repositório contra a arquitetura alvo (`CREDMAX_ARQUITETURA.md`) antes de migrar. Legenda:
>
> 🟢 Já está profissional e deve permanecer
> 🟡 Existe, mas precisa ser reorganizada
> 🟠 Existe parcialmente e precisa de evolução
> 🔴 Está ausente e precisa ser construída
> ⚠️ Existe, mas a arquitetura atual pode causar problemas de escala

**Código-fonte audita** (núcleo atual): tabelas PostgreSQL nas migrações `001`–`012`, rotas do backend `backend/src/routes/*`, páginas do frontend `src/app/pages/*`.

---

## A. Fundação (Fase 1)

| Funcionalidade | Estado | Observações |
|----------------|--------|-------------|
| Dados do cliente (identificação, contactos, endereço, emprego, rendimento, grupo) | 🟡 | Tabela `clients` concentra praticamente tudo em colunas planas (`employer_name`, `monthly_income`, `monthly_expenses`, `business_*`, `group_*`). Funciona, mas não segue o modelo separado por domínio (`EMPLOYMENT`. `INCOME`, `ADDRESS`). Precisa de reorganização para o perfil 360º. |
| Perfil 360º do cliente (resumo com score, limites, exposição, atrasos, responsável) | 🟠 | Existem dados dispersos (`clients.score`, `loans.balance/days_overdue`, `risk_rules`, `client_evaluations.final_score`), mas **não há** uma view/ficha consolidada 360º que junte estado, limite, total emprestado/pago/atraso, próxima prestação e responsável. |
| Documentos do cliente e do crédito | 🟢 | `client_documents` e `loan_documents` já existem (com tipos). Fundação sólida. |
| Auditoria / trilha de acessos | 🟢 | `security_audit_log`, `auth_login_audit`, páginas `audit/*` (LogsSistema, Acessos, EventosCríticos), rotas `admin-audit-routes`. Fonte sólida. |
| Máquina de estados uniforme (DRAFT→…→PAID) | 🟠 | Existem audit tables específicas (`loan_installment_audit`, `loan_contract_audit`) e `loan_financial_events`, mas **não existe** um **PROCESS_LOG genérico** com `from_state/to_state/actor/reason/note/document_ids` que atravesse pedido→crédito→cobrança. A trilha está fragmentada por módulo. |
| Pesquisa global (cliente, crédito, pedido, contrato, pagamento num só campo) | 🔴 | **Ausente.** Não há endpoint nem UI de pesquisa global. |
| Padrão único de listas + filtros comuns | 🟡 | Várias listas já usam padrões parecidos, mas **não** há componente/estrutura consolidada `[Pesquisar][Filtros][Exportar][+Novo]` nem conjunto comum filtros (estado, período, agência, responsável, produto, valor, risco, carteira). |

---

## B. Originação (Fase 2)

| Funcionalidade | Estado | Observações |
|----------------|--------|-------------|
| Simulador | 🟢 | `SimulatorPage` (rota `credits/simulator`) com a base de cálculo (prestação/juros/taxas). **Fase 2.2:** simulador **público** em `/credito` (`POST /api/portal/simulate`) reutiliza `buildInstallments` + política de aprovação da empresa e liga à criação direta de um pedido (`Solicitar este crédito`). |
| Portal público do cliente | 🟠 | **Fase 2.2 entregue:** registo/login públicos (tabela `portal_accounts`, migração `014`, JWT de portal dedicado + lockout após tentativas), simulador público e submissão de pedidos (`SUBMITTED` + `publishAppEvent`) com acompanhamento e linha do tempo em `/credito/pedidos` (ownership por cliente). **Falta (Fase 3):** consulta de prestações/pagamentos, renovação/liquidação no portal. |
| Pedido de crédito (CREDIT APPLICATION) | 🟠 | Existe `loan_approval_requests` (pedido de aprovação), mas **não** está separado o ciclo *pedido* (`SUBMITTED`→`TRIAGE`) do *crédito* (`loans`). Falta triagem/documentação do pedido. |
| Triagem (checklist de documentação) | 🔴 | **Ausente.** Sem lista por pedido de documentos pendentes/recebidos/inválidos. |
| Avaliação | 🟠 | `client_evaluations` já existe (score, decisão, recomendação). Falta **agenda de avaliações** (data/hora/avaliador/localização/anexos) e notificações automáticas. |
| Análise de crédito (Central de Análise) | 🟠 | Risco e score existem; falta a **central de análise** com capacidade financeira, taxa de esforço, histórico do cliente e **alertas/regras de apoio** (nunca decisão automática). |
| Aprovação em workflow por valor | 🟢 | Forte: `loan_approval_policies` + `loan_approval_requests` com decisões em níveis (**analyst → manager → final**) registadas *by_user*, com notas. É a base para o workflow Supervisor/Gerente/Comité (parcialmente parametrizável). |

---

## C. Operação do crédito (Fase 3)

| Funcionalidade | Estado | Observações |
|----------------|--------|-------------|
| Contrato | 🟢 | `loan_contract_audit`, `loan_documents` e geração PDF com `jspdf`/`jspdf-autotable` já presentes. |
| Garantias | 🟢 | `collaterals` e `guarantors` já existem (fundação sólida). |
| Desembolso | 🟠 | `loans` tem `disbursement_status`, `disbursed_at/on`, e a migração `010_disbursed_request_status` trata estados. Falta o fluxo completo tipo ordem `PENDING → VALIDATED → PROCESSED → CONFIRMED` com método/conta destino/operador/referência. |
| Plano de pagamento / prestações (amortização) | 🟢 | `loan_installments` + `amortization_method` + `payment_frequency` no `loans`. Sólido. |
| Pagamentos e alocação (capital/juros/mora) | 🟢 | `loan_repayments`, `loan_repayment_allocations` com `principal_applied`, `interest_applied`, `mora_applied`, `unapplied_amount`. Forte. |
| Cobrança (promessas, contactos, visitas) | 🟠 | Base existe: `loan_payment_promises`, `collection_visits`, `days_overdue`, migração `009_charges_and_policies`. Falta **Central de Cobrança** orientada a tarefas (filas de críticos/em atraso/próximos + histórico unificado + ações Ligar/WhatsApp/Promessa/Visita). |
| Renovação / reestruturação | 🟠 | `loan_renegotiations` + páginas `operations/ReestruturacaoPage`. Existe, mas não integrado como alternativa de fim de ciclo. |

---

## D. Gestão (Fase 4)

| Funcionalidade | Estado | Observações |
|----------------|--------|-------------|
| Dashboard operacional | 🟢 | `dashboard-routes` + `DashboardPage`. Já possui indicadores do dia. Falta apenas a secção explícita de **ações necessárias** e KPIs como PAR 30 (verificar em relatórios). |
| Risco (regras, score, exposição, alertas) | 🟢 | `risk_rules`, páginas `risk/*` (RiskCenter, RegrasRisco, Score, Exposicao, AlertasRisco). Forte. |
| Carteiras e transferências | 🟢 | `portfolios`, `portfolio_transfers`, páginas `portfolios/*`. Sólido. |
| Financeiro / dia financeiro / caixa | 🟢 | `cash_expenses`, `finance_day_sessions` (+ audits), `company_payments`, rotas `finance-session`, `company-payment`. Forte. |
| Contabilidade | 🟢 | `accounting_accounts`, `accounting_entries`, `accounting_entry_lines`, `ContabilidadePage`. Sólido. |
| Relatórios / regulatórios / BI | 🟢 | `regulatory-report-routes` + páginas `reports/*` (inclui Banco de Moçambique, IVA). Forte. |
| Auditoria de negócio (eventos críticos) | 🟢 | `security_audit_log`, `eventos-routes`, páginas `audit/*`. Sólido. |

---

## E. Consignado e integrações (Fase 5)

| Funcionalidade | Estado | Observações |
|----------------|--------|-------------|
| Funcionários públicos / dados consignado | 🔴 | **Ausente.** Sem `employment.kind`, código de funcionário, margem consignável, descontos. |
| Motor de margem consignável | 🔴 | **Ausente.** Falta o cálculo salário líquido × margem permitida e a prestação máxima recomendada. |
| Autorizações, lotes, descontos consignados | 🔴 | **Ausente.** |
| Reconciliação (lotes consignados) | 🔴 | Existe `reconciliation_runs`, mas é usado no contexto de pagamentos/empresa; **não** cobre o fluxo consignado (lote esperado vs. recebido por funcionário). |
| Camada de integração com o Estado | 🟠 | Existe `integration_connectors` e rotas `integration-routes`. Bom ponto de partida, mas **não** há a camada abstrata pronta para API oficial de consignado (autenticação/certificados/endpoints/lotes/retorno). |

---

## F. Escala e plataforma (Fase 6)

| Funcionalidade | Estado | Observações |
|----------------|--------|-------------|
| Notificações (sistema, SMS, e-mail) | 🟢 | `notification_settings`, `system_notifications`, `client_sms_log`, `client_email_log`, `installment_reminder_log`, módulos `notifications/*`. Forte. Falta canal WhatsApp/push/PWA. |
| Autenticação segura / MFA / permissões | 🟢 | `auth-routes`, `auth_login_audit`, `shared/permissions.mjs`, `password_reset_otps`. Sólido. |
| Multiempresa | 🟢 | `company_id` por registo + `x-company-id` + `company-context-routes`. Sólido. |
| Administração central (admin) | 🟢 | Módulo `admin/*` próprio (suporte, monitorização, segurança, relatórios) com tabelas `support_tickets`, `platform_notifications`, `platform_settings`. Forte. |
| PWA / mobile | 🟠 | Aplicação já é web responsiva (Vite/React). Falta manifesto/service-worker para PWA instalável. |
| APIs externas / observabilidade / alta disponibilidade | 🟠 | `integration_connectors` existe; faltam métricas de observabilidade, filas/automação e configuração de alta disponibilidade. |

---

## G. Riscos de escala na arquitetura atual (⚠️)

| Risco | Impacto | Recomendação |
|-------|---------|--------------|
| Rotas de crédito "monolíticas" | `loan-routes.js` concentra demasiado (a `docs/ARCHITECTURE.md` já prevê dividir em `routes/loans/`). Dificulta manutenção e testes. | Dividir por sub-domínio (pedidos, avaliação, aprovação, desembolso, pagamentos, cobrança). |
| Páginas frontend grandes com hooks embutidos | Manutenção e testes frágeis. | Extrair hooks/componentes e seguir o **padrão único de listas**. |
| Trilha de processo fragmentada | Auditoria de negócio não contínua entre pedido/crédito/cobrança. | Introduzir `PROCESS_LOG` genérico. |
| Clientes com dados planos | Esquema fixo dificulta consignado e novos tipos de rendimento. | Separar `EMPLOYMENT`/`INCOME`/`ADDRESS`. |
| Sem pesquisa global | Reduz eficiência operacional. | Fazer pesquisa global com as entidades-índice (cliente, crédito, pedido, contrato, pagamento). |

---

## H. Roadmap de migração (por prioridade)

1. **Fase 1 — Fundação (começa agora):** estados/`PROCESS_LOG`, perfil 360º do cliente, pesquisa global, separar dados do cliente, consolidar lista padrão. *(Sem alterar o que já é 🟢.)*
2. **Fase 2 — Originação:** portal público + simulador público → pedido → triagem → agenda de avaliação → central de análise → workflow de aprovação.
3. **Fase 3 — Operação:** ordem de desembolso, central de cobrança, renovação como fim de ciclo.
4. **Fase 4 — Gestão:** ações necessárias no dashboard, PAR 30/risco.
5. **Fase 5 — Consignado:** dados de funcionário público, motor de margem, lotes/descontos, reconciliação, camada de integração (coluna nova numérica, nunca fictícia).
6. **Fase 6 — Escala:** PWA, WhatsApp/push, observabilidade, alta disponibilidade.

> Resumo do contador: **Forte (🟢)** nas áreas operacionais/financeiras já amadurecidas (avaliação, contrato, garantias, prestações, pagamentos, risco, contabilidade, relatórios, auditoria, multiempresa, notificações). **Lacunas (🔴)** concentram-se em: pesquisa global, portal público, triagem, central de cobrança, consignado completo e integração estatal. **Reorganização (🟡🟠)** no modelo de dados do cliente, máquina de estados unificada e rotas monolíticas.