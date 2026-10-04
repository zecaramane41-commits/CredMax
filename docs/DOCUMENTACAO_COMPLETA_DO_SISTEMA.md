# MSU — Documentação Completa do Sistema de Microcrédito

> **Sistema:** Gestão de Microcrédito (Moçambique)
> **Nome do produto (plataforma):** SiGeM
> **Modelo:** Plataforma SaaS multi-empresa (full-stack)
> **Nível:** Documento técnico-funcional baseado na análise do código-fonte do projeto `c:\MSU@`.

---

## Índice

1. [Visão geral do sistema](#1-visão-geral-do-sistema)
2. [Arquitetura técnica](#2-arquitetura-técnica)
3. [Estrutura do projeto](#3-estrutura-do-projeto)
4. [Autenticação e controlo de acesso](#4-autenticação-e-controlo-de-acesso)
5. [Perfis e permissões](#5-perfis-e-permissões)
6. [Módulo Clientes](#6-módulo-clientes)
7. [Módulo Crédito](#7-módulo-crédito)
8. [Módulo Operações](#8-módulo-operações)
9. [Módulo Financeiro (Fluxo de Caixa, Tesouraria, Contabilidade, Conciliação)](#9-módulo-financeiro)
10. [Dia Financeiro (Sessão de Caixa)](#10-dia-financeiro-sessão-de-caixa)
11. [Módulo Carteiras / Portfólios](#11-módulo-carteiras--portfólios)
12. [Central de Risco](#12-central-de-risco)
13. [Módulo Relatórios e Compliance Regulatório](#13-módulo-relatórios-e-compliance-regulatório)
14. [Módulo Notificações (SMS e Email)](#14-módulo-notificações-sms-e-email)
15. [Módulo Auditoria](#15-módulo-auditoria)
16. [Módulo Administração](#16-módulo-administração)
17. [Módulo Parametrização](#17-módulo-parametrização)
18. [Módulo Configurações](#18-módulo-configurações)
19. [Central Admin — Painel de Empresas](#19-central-admin--painel-de-empresas)
20. [API — Endpoints por módulo](#20-api--endpoints-por-módulo)
21. [Base de dados — Tabelas](#21-base-de-dados--tabelas)
22. [Segurança, Auditoria e Auditoria técnica (tamper-evident)](#22-segurança-e-auditoria-técnica)
23. [Backup e Continuidade de negócio](#23-backup-e-continuidade-de-negócio)
24. [Como executar o sistema](#24-como-executar-o-sistema)
25. [Documentos gerados (PDF) e formatação](#25-documentos-gerados-pdf-e-formatação)
26. [Roadmap / próximos passos de refactor](#26-roadmap--próximos-passos-de-refactor)

---

## 1. Visão geral do sistema

O **MSU** é uma plataforma *full-stack* para a **gestão de microcrédito em Moçambique**. Centraliza todo o ciclo de vida de um crédito e os processos de suporte de uma instituição de microfinanças:

- **Clientes** — cadastro completo (Singular, Grupo, Empresa), documentos, avaliação e garantias.
- **Créditos** — pedido → análise → aprovação → autorização → desembolso → acompanhamento.
- **Desembolsos e reembolsos** — processamento, amortização (PRICE/SAC), prestações.
- **Dia financeiro** — abertura/fecho de caixa, reforços, auditoria de reabertura.
- **Contabilidade** — plano de contas, diário/ledger, custos, fluxo de caixa.
- **Relatórios regulatórios** — conformidade com o Banco de Moçambique e encerramentos assinados.
- **Central admin** — gestão multi-empresa, assinaturas, suporte, monitorização.

A arquitetura é **multi-tenant**: cada empresa (instituição) opera num contexto isolado através do campo `company_id`, e um **admin central** gere todas as empresas com um seletor de contexto (`x-company-id`).

---

## 2. Arquitetura técnica

```
Client (React SPA)  →  Express API  →  PostgreSQL
                          │  Auth: JWT + MFA
                          │  Permission Middleware
                          └  Domain Services
```

### Stack

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 18 + TypeScript + Vite 6 + Tailwind CSS 4 + Radix UI (shadcn/ui) + React Router 7 + Recharts |
| **Backend** | Node.js 20+ + Express 4 + Zod 4 |
| **Base de dados** | PostgreSQL 14+ (16 no Docker) |
| **Autenticação** | JWT (jsonwebtoken), MFA, bcryptjs, rate limiting em login |
| **Segurança** | Helmet, CORS, validação Zod, política de passwords, auditoria |
| **Notificações** | SMS (console/Twilio) + Email (Nodemailer/SMTP), logs de envio |
| **PDF** | jsPDF + jspdf-autotable (frontend) |
| **Orquestração** | Docker Compose (PostgreSQL + API + Web/Nginx) |

### Camadas de código

- **`src/`** — Frontend (pages por domínio, `lib/` para API/auth, `components/ui/` design system).
- **`backend/src/`** — `routes/` (handlers), `middleware/` (auth, permissões, validação, subscription), `services/` (regras de negócio), `db/` (migrações e seeds), `validators/` (Zod).
- **`shared/`** — fonte única do catálogo de permissões e defaults por perfil (`permissions.mjs`) e tipos.

### Multi-tenant

- Cada registo de negócio carrega `company_id`.
- O admin central opera com header `x-company-id`.
- `resolveCompanyScope()` (em `middleware/auth.js`) resolve o contexto da empresa.
---

## 3. Estrutura do projeto

```
MSU/
├── shared/                 # Código partilhado (permissões, tipos)
├── src/                    # Frontend React + Vite + TypeScript
│   └── app/
│       ├── pages/          # Ecrãs por domínio
│       ├── components/     # componentização (clients, credits, ops, ui...)
│       ├── lib/            # Cliente API, auth, formatadores, PDF
│       ├── layouts/        # MainLayout (sidebar)
│       ├── config/         # Navegação (grupos e permissões)
│       └── routes.ts       # Router da aplicação
├── backend/                # API Express + PostgreSQL
│   └── src/
│       ├── config/         # db.js, env.js
│       ├── db/             # migrate.js, seed.js, migrator.js, migrations/
│       ├── middleware/     # auth, permissions, validate, subscription-check
│       ├── routes/         # Endpoints REST (um ficheiro por domínio)
│       ├── services/       # accounting, audit, risk, notification, reconciliation
│       ├── utils/          # mozambique-validation, password-policy, security, logger
│       └── validators/     # Schemas Zod (auth)
├── docs/                   # Documentação técnica
├── scripts/                # seed de dados do sistema
├── docker/                 # nginx.conf
├── docker-compose.yml      # Ambiente local com Docker
└── package.json            # Scripts do frontend/raiz
```

### Packages

- **Raiz** (`package.json`): build Vite, dev full (frontend+backend), migrate/seed.
- **Backend** (`backend/package.json`): dev (`node --watch`), start, check, test (node --test), db:migrate, db:seed, db:reset, db:export-schema.

---

## 4. Autenticação e controlo de acesso

- **Login** com JWT; verificação de password com `bcryptjs`.
- **MFA** configurável por empresa (`auth_enforce_mfa`, código hash `auth_mfa_code_hash`).
- **Rate limiting** no login (proteção contra força bruta).
- **Política de passwords** configuravel (comp. mínima, maiúscula, minúscula, nº, especial, expiração, bloqueio após tentativas — ver `companies`).
- **Auditoria de login**: tabela `auth_login_audit` regista email, sucesso, MFA, IP, user-agent, device.
- **Níveis de timeout de sessão** por perfil (admin/manager/operator) e timeout global.
- Middleware de **permissões** aplica controlo por endpoint (não apenas na UI).

### Fluxo de login com auditoria

```
POST /api/auth/login → valida credenciais → regista auth_login_audit →
MFA (se exigido) → emite JWT → resolve user permissions → redireciona para dashboard
```

---

## 5. Perfis e permissões

Catálogo centralizado em `shared/permissions.mjs`. Cada permissão usa a forma `dominio.acao`.

### Catálogo de permissões

| Domínio | Permissões |
|---------|-----------|
| Dashboard | `dashboard.view` |
| Clientes | `clients.view`, `clients.manage` |
| Créditos | `solicitar.credito`, `analisar.credito`, `aprovar.credito`, `autorizar.credito`, `desembolsar.credito` |
| Operações | `registrar.pagamento`, `registrar.mora`, `executar.extorno`, `reestruturar.credito` |
| Risco | `consultar.risco`, `gerir.regras.risco` |
| Carteiras | `visualizar.carteiras`, `gerir.carteiras` |
| Financeiro | `visualizar.financeiro`, `registrar.movimentos`, `conciliar.operacoes` |
| Relatórios | `visualizar.relatorios`, `exportar.relatorios` |
| Notificações | `enviar.notificacoes`, `gerir.modelos` |
| Auditoria | `consultar.auditoria` |
| Administração | `criar.usuarios`, `editar.usuarios`, `gerir.perfis`, `gerir.permissoes` |
| Parametrização | `alterar.parametros.negocio` |
| Configurações | `alterar.configuracoes.sistema` |
| Central Admin | `admin_dashboard.view`, `admin_companies.view/manage`, `admin_users.view/manage`, `admin_support.view/manage`, `admin_financeiro.view/manage`, `admin_monitoring.view`, `admin_notifications.view/manage`, `admin_reports.view`, `admin_audit.view`, `admin_security.view/manage` |

### Perfis (roles) e permissões por defeito

| Perfil | Perfil interno | Permissões principais |
|--------|----------------|-----------------------|
| **admin** | Administrador | Todas (`*`) |
| **manager** | Gestor | Dashboard, clientes, crédito completo (até desembolso), operações, risco, carteiras, financeiro, relatórios, notificações, auditoria |
| **agent** | Agente | Dashboard, clientes (ver), solicitar crédito, registar pagamento/mora, consultar risco, carteiras, relatórios |
| **operator** | Operador | Dashboard, clientes (gerir), solicitar crédito, pagamento/mora, risco, carteiras, relatórios |
| **assistant** | Assistente | Dashboard, clientes (gerir), solicitar crédito, pagamento, financeiro, relatórios, notificações |
| **accountant** | Contabilista | Dashboard, clientes (ver), pagamento, financeiro, movimentos, conciliação, relatórios, exportar |

> O perfil admin sem `companyId` é tratado como **central admin** (permite acesso global).
---

## 6. Módulo Clientes

**Página:** `src/app/pages/clients/ClientsPage.tsx`
**Permissões:** `clients.view` (ver) | `clients.manage` (gerir)

### Funcionalidades

- **Tipos de cliente:** Singular, Grupo e Empresa.
- **Cadastro com dados pessoais:** nome, NUIT, telefone, email, telefone alternativo, documento (BI/NUITE com nº), data de nascimento, género, estado civil, nacionalidade.
- **Localização:** província, cidade, distrito, bairro, morada, número de casa.
- **Dados socioeconómicos:** ocupação, entidade patronal, rendimento mensal, despesas mensais.
- **Dados de negócio:** nome da empresa do cliente, sector de atividade, data de registo.
- **Clientes Grupo:** nome e descrição do grupo, líder, e **membros** com alocação de valores (`client_group_members` com `allocation_amount`).
- **Score de crédito** do cliente (default 700) e **estado** (active/inactive).
- **Documentos do cliente** (`client_documents`): tipo, versão, upload, datas de emissão/validade.
- **Avaliação de cliente** (`client_evaluations`): score final, decisão, recomendação, razões.
- **Garantias / colaterais** (`collaterals`): tipo, descrição, valor estimado, referência de documento, estado.
- **Fiadores** (`guarantors`): nome, NUIT, telefone, montante garantido, nº de garantias ativas.
- Visualização, edição, pesquisa e **histórico de créditos** por cliente (`ClientCreditDetails`, `ClientCreditsModal`, `ClientExpandableRow`).

---

## 7. Módulo Crédito

**Páginas:** `src/app/pages/credits/` — página única `/credits` com abas (Pedidos, Análise, Aprovação, Autorização, Desembolso, Estado).
**Permissões:** `solicitar.credito`, `analisar.credito`, `aprovar.credito`, `autorizar.credito`, `desembolsar.credito`.

### 7.1 Simulador (`SimulatorPage.tsx` — `/credits/simulador`)

- Simulação de crédito com cálculo de prestação **PRICE** ou **SAC** (amortização).
- Frequências de pagamento: **Mensal, Quinzenal, Semanal, Diária**.
- Gera **PDF** com cabeçalho (dados da empresa), resumo (valor, prestação, juros, total), tabela do plano de pagamento e rodapé (endereço/contactos/data). Permite exportar e imprimir.

### 7.2 Pedidos de Crédito (aba Pedidos)

- Registo e acompanhamento de solicitações; criação com cliente, tipo, prazo, taxa, frequência.
- Suporte a créditos Singulares, Grupos e Empresas (com alocações por membro — `loan_group_member_allocations`).
- **Fluxo do pedido:** Rascunho → Pendente → Em Análise → Aprovação → Autorização → Desembolso → Liberado.
- Pipeline visual com indicadores de estado; expansão de detalhes com valores por etapa.
- **Validação:** bloqueia novo pedido se o cliente já tiver pedido ativo.
- Ordenação dos mais recentes; barra de pesquisa por nome/estado; cancelamento de pedidos em rascunho/pendente.
- Modal de novo pedido (`NovoPedidoModal.tsx`), detalhes (`PedidoDetailsModal.tsx`), pipeline partilhado (`PipelineShared.tsx`).

### 7.3 Análise

- Revisão de pedidos em estado `pendente` ou `em_analise`; aprova ou rejeita; regista observações.

### 7.4 Aprovação

- Define **valor aprovado** (pode diferir do solicitado); regista data e valor.

### 7.5 Autorização

- Define **valor autorizado**; regista data e valor.

### 7.6 Desembolso

- Processa o desembolso do valor aprovado/autorizado; regista valor e data; marca como **liberado**.
- Regista `disbursement_net_amount`, taxas administrativas e gera evento financeiro.

### 7.7 Estado do Crédito

- Acompanha o estado atual, saldo devedor, vencimentos e histórico de pagamentos/amortizações.

### 7.8 Plano de Pagamento (`PlanoDePagPage.tsx`)

- Tabela detalhada de amortização: parcela, vencimento, capital, juros, prestação e saldo devedor.

### Regras de negócio relacionadas

- `loan_approval_policies`: limites de analista/gestor/final, score mínimo, dívida máx., taxa de mora diária default, ativação de mora mensal/semanal/diária.
- `loan_approval_requests`: pedidos de aprovação multi-etapa com decisões de analista, gestor e final.
- `loan_financial_events`: eventos financeiros do empréstimo com snapshots antes/depois e workflow de revisão.
- `loan_contract_audit` e `loan_installment_audit`: auditoria de contratos e prestações.

---

## 8. Módulo Operações

**Páginas:** `src/app/pages/operations/`
**Permissões:** `registrar.pagamento`, `registrar.mora`, `executar.extorno`, `reestruturar.credito`.
**Componente partilhado:** `OperationPageShell.tsx`.

| Página | Caminho | Permissão | Função |
|--------|---------|-----------|--------|
| **Reembolsos** | `/operations/reembolsos` | `registrar.pagamento` | Registo de pagamentos, alocação por capital/juros/mora, emissão de recibo. |
| **Mora** | `/operations/mora` | `registrar.mora` | Gestão de juros de mora, acumulação e regularização. |
| **Abates** | `/operations/abates` | `registrar.pagamento` | Abates/abatimentos sobre créditos. |
| **Extornos** | `/operations/extornos` | `executar.extorno` | Estorno de transações registadas. |
| **Capitalização** | `/operations/capitalizacao` | `registrar.pagamento` | Capitalização de juros no saldo. |
| **Reestruturação** | `/operations/reestruturacao` | `reestruturar.credito` | Renegociação/reestruturação (alteração de termos). |

### Detalhe de reembolso

- `loan_repayments`: recibos (`receipt_no`), valor recebido vs aplicado, alocação por principal/juros/mora, modo de alocação, valor não aplicado.
- `loan_repayment_allocations`: repartição do pagamento por prestação (vencimento, dias em mora, capital, juros, mora, total aplicado).
- `loan_payment_promises`: promessas de pagamento com data e montante prometido.
- `loan_renegotiations`: renegociações com termos antigos/propostos e estado.

### Extorno (base de eventos)

- `loan_financial_events` guarda `event_type`, snapshots `before/after` e `workflow_status`. Extornos são eventos com revisão.

---

## 9. Módulo Financeiro

**Páginas:**
- `src/app/pages/finance/` — Fluxo de Caixa, Tesouraria, Contabilidade, Conciliação.
- `src/app/pages/accounting/AccountingPage.tsx` — contabilidade.
- `src/app/pages/treasury/CashFlowPage.tsx` — fluxo de caixa (rota legacy `/cash-flow`).

**Permissões:** `visualizar.financeiro`, `registrar.movimentos`, `conciliar.operacoes`.

| Página | Caminho | Função |
|--------|---------|--------|
| **Finance** | `/` (home) e `/finance` | Visão geral das operações financeiras (página principal). |
| **Fluxo de Caixa** | `/finance/fluxo-caixa`, `/cash-flow` | Controlo de entradas/saídas, projeção de fluxo, despesas, reforços. |
| **Tesouraria** | `/finance/tesouraria` | Contas e movimentos de tesouraria, controlo de saldos, centros de custo. |
| **Contabilidade** | `/finance/contabilidade`, `/accounting` | Plano de contas, diário (ledger), balancete, lançamentos. |
| **Conciliação** | `/finance/conciliacao` | Reconciliação de transações com extratos/movimentos externos. |

### Fluxo de Caixa (detalhe)

- **Visão geral/overview** (`GET /api/accounting/cash-flow/overview`).
- **Despesas** (`GET/POST /api/accounting/cash-flow/expenses`): categoria, montante, entidade/beneficiário, origem (`caixa_geral` ou centro de custo), workflow de aprovação.
- **Política de caixa** (`GET/PUT /api/accounting/cash-flow/policy`): limite de auto-aprovação do gestor (default 30 000), categorias que exigem admin (ex.: impostos).
- **Centros de custo** (`cash_cost_centers`): código, nome, ativo.
- **Aprovação de despesas** (`GET .../approvals` e `PATCH .../decision`): define `required_approval_role`, `approved_by`, `rejected_by`, justificação.
- **Anexos** de despesa (`cash_expense_attachments`): upload, download, metadados.
- **Auditoria de despesas** (`cash_expense_audit`): ações, ator, payload JSONB.
- Lançamento automático de **partidas contabilísticas** (`accounting_entries` + `accounting_entry_lines` débito/crédito).

### Contabilidade (detalhe)

- **Contas** (`GET /api/accounting/accounts`): `accounting_accounts` (código, nome, tipo, ativo).
- **Modelos de contas** (`GET /api/accounting/account-templates`, `POST /account-templates/apply`): templates por empresa (`companies.accounting_template_code` default `microcredito`).
- **Diário/Ledger** (`GET /api/accounting/ledger`): `accounting_entries` com linhas de débito/crédito, referência a evento/empréstimo, criador.
- **Acréscimo de mora:** `POST /api/accounting/mora/accrue`.

### Conciliação (detalhe)

- **Integrações** (`integration_connectors`, `external_transactions`): conectores por provider (ex.: API externa), importação de transações, estado `reconciled`.
- **Corridas de conciliação** (`reconciliation_runs`): iniciadas/finalizadas, contagens e valores combinados/não combinados, notas, responsável.
- Service `reconciliation-service.js` implementa o matching.

---

## 10. Dia Financeiro (Sessão de Caixa)

**Rotas:** `/api/finance-session`
**Tabelas:** `finance_day_sessions`, `finance_day_session_audit`, `finance_day_reopen_audit`.

| Endpoint | Função |
|----------|--------|
| `GET /state` | Estado atual da sessão do dia. |
| `POST /open` | Abrir dia com saldo inicial (`opening_balance`, `opening_capital`), notas. |
| `POST /reinforcement` | Reforços de capital durante o dia (`reinforcement_total`). |
| `POST /close` | Fecho do dia: saldo final, desembolsos, reembolsos, despesas, notas. |
| `GET /history` | Histórico de sessões. |
| `GET /audit` | Auditoria de ações na sessão (abre/fecha/reforço). |
| `GET /reopen-audit` | Auditoria de reaberturas de dia. |

### Controlos de auditoria

- Sessão regista `opened_by`, `closed_by`, saldos e notas de abertura/fecho.
- Reabertura de dia é **auditada** (`finance_day_reopen_audit`): estado anterior, saldo anterior, motivo, responsável.
- Todas as ações geram eventos em `finance_day_session_audit`.
---

## 11. Módulo Carteiras / Portfólios

**Páginas:** `src/app/pages/portfolios/` (PortfoliosPage, CarteirasAtivasPage, SegmentacaoPage, TransferenciasPage).
**Permissões:** `visualizar.carteiras`, `gerir.carteiras`.

### Modelo (migração 005)

- **Carteira (raiz)** → **Subcarteiras** → **Gestores/Subgestores** → **Clientes** → **Créditos**.
- `portfolios`: código, nome, descrição, `parent_id` (hierarquia), `gestor_name`, `gestor_user_id`, ativo.
  - Unicidade de código e nome por empresa; prevenção de ciclos (não pode ser pai de si próprio).
- `portfolio_transfers`: transferências de cliente/crédito entre carteiras com montante, motivo, estado (`pending/approved/rejected/cancelled`), solicitante/aprovador.
- Colunas `carteira_id` adicionadas a `clients`, `loans` e `loan_repayments` (ligadas a `portfolios`).
- **Backfill** automático: empréstimos associados à carteira do cliente; reembolsos associados à carteira do empréstimo.

### Funcionalidades

- Visão geral das carteiras e subcarteiras.
- Detalhe de carteiras ativas.
- Segmentação de clientes/carteiras.
- Transferências entre carteiras/gestores com fluxo de aprovação.
- KPIs de desempenho e mora por carteira (PDF "Carteira Desempenho Fecho", "Carteira Em Mora").

---

## 12. Central de Risco

**Páginas:** `src/app/pages/risk/` (RiskCenterPage, RegrasRiscoPage, ScorePage, ExposicaoPage, AlertasRiscoPage).
**Permissões:** `consultar.risco`, `gerir.regras.risco`.

| Página | Caminho | Função |
|--------|---------|--------|
| **Consulta de Risco** | `/risk/consulta` | Visualização do perfil de risco de clientes/créditos. |
| **Regras de Risco** | `/risk/regras` | Gestão de `risk_rules` (nome, descrição, `rule_limit`, prioridade, ativo). |
| **Score** | `/risk/score` | Scoring de clientes/créditos (`client_evaluations`, score do cliente). |
| **Exposição** | `/risk/exposicao` | Análise de exposição de crédito (dívidas, garantias). |
| **Alertas** | `/risk/alertas` | Alertas de risco gerados pelo sistema. |

### Regras de risco

- Configuráveis por empresa (`risk_rules`).
- Prioridade (ex.: Média) e limites configuráveis.
- `risk-metrics-service.js` calcula métricas do dashboard de risco (`GET /api/dashboard/risk-portfolio`).
- Defaults de política de aprovação: `loan_approval_policies` (score mínimo 600, limites de analista/gestor/final, mora mensal ativa por defeito).

---

## 13. Módulo Relatórios e Compliance Regulatório

**Páginas:** `src/app/pages/reports/` e `src/app/pages/compliance/CompliancePage.tsx`.
**Permissões:** `visualizar.relatorios`, `exportar.relatorios`.

| Página | Caminho | Função |
|--------|---------|--------|
| **Relatórios** | `/reports` | Hub de relatórios do sistema. |
| **Alertas** | `/reports/alertas` | Relatório de alertas gerados. |
| **Créditos** | `/reports/creditos` | Relatórios de créditos/empréstimos. |
| **Clientes** | `/reports/clientes` | Relatórios de clientes. |
| **Financeiro** | `/reports/financeiro` | Relatórios financeiros. |
| **Carteiras** | `/reports/carteiras` | Relatórios de carteiras. |
| **Banco de Moçambique** | `/reports/banco-mocambique` | Relatórios de conformidade para o BdM. |
| **Indicadores** | `/reports/indicadores` | Relatórios de indicadores/KPIs. |
| **Compliance** | `/compliance` | Conformidade regulamentar (normas BdM). |

### Relatórios regulatórios e encerramentos

- Rotas: `/api/reports` (`regulatory-report-routes.js`).
- `regulatory_report_closures`: encerramentos de períodos por `report_code` com `payload_json`, **assinatura** (`signature_algo` HMAC-SHA256, `signature_value`), responsável e data.
- `collection_performance_month_closures`: encerramento mensal de desempenho de cobrança com snapshot JSONB.

---

## 14. Módulo Notificações (SMS e Email)

**Páginas:** `src/app/pages/notifications/` (NotificationsPage, SmsPage, EmailPage, AlertasNotificacoesPage, ModelosPage).
**Permissões:** `enviar.notificacoes`, `gerir.modelos`.
**Componente:** `NotificationBell` (sino de notificações no topo).

| Página | Caminho | Função |
|--------|---------|--------|
| **Notificações** | `/notifications` | Centro de notificações do sistema. |
| **SMS** | `/notifications/sms` | Configuração/envio de SMS a clientes. |
| **Email** | `/notifications/email` | Configuração/envio de email. |
| **Alertas** | `/notifications/alertas` | Configuração de alertas e notificações. |
| **Modelos** | `/notifications/modelos` | Gestão de templates de notificação. |

### Canais e configuração

- **SMS:** `notification_settings` (sms_enabled, provider console/twilio, api key, sender id "SiGeM"); lembretes de vencimento (`due_reminder_days` default 3), avisos de pagamento e de caixa.
- **Email:** `notification_settings` (email_enabled, smtp_host/port/secure/user/pass/from); avisos de desembolso e de mora.
- **Logs:** `client_sms_log` e `client_email_log` (status, provider response, referência).
- **Lembretes de prestações:** `installment_reminder_log` (prestação, data, dias antes, ligação ao SMS log).

### Serviço de notificações e templates

- `notification-service.js` gere o envio e os templates programáticos.
- SMS de testes usam o provider `console` por defeito.

---

## 15. Módulo Auditoria

**Páginas:** `src/app/pages/audit/` (LogsSistemaPage, HistoricoAlteracoesPage, AcessosPage, EventosCriticosPage, AuditPage).
**Permissões:** `consultar.auditoria`.

| Página | Caminho | Função |
|--------|---------|--------|
| **Logs do Sistema** | `/audit/logs` | Logs técnicos do sistema. |
| **Histórico de Alterações** | `/audit/historico` | Histórico de alterações em dados sensíveis. |
| **Acessos** | `/audit/acessos` | Registo de acessos (login/logout, IP, user-agent, device). |
| **Eventos Críticos** | `/audit/eventos` | Eventos críticos (desembolsos, extornos, reestruturações). |
| **Auditoria** | `/audit` | Módulo principal de auditoria. |

### Fontes de dados de auditoria

- `security_audit_log`: log de segurança **tamper-evident** com correntes de hash (`previous_hash`, `entry_hash`), método, caminho, query/body, status, IP, user-agent, device.
- `auth_login_audit`: tentativas de login (sucesso/falha, motivo, MFA).
- `cash_expense_audit`: ações sobre despesas.
- `finance_day_session_audit` / `finance_day_reopen_audit`: ações do dia financeiro e reaberturas.
- `loan_contract_audit` / `loan_installment_audit`: alterações em contratos e prestações.
- `audit-log-service.js` centraliza a escrita de logs.

---

## 16. Módulo Administração

**Páginas:** `src/app/pages/administration/` (Utilizadores, Gestores, Perfis, Permissões, Departamentos).
**Permissões:** `criar.usuarios`, `editar.usuarios`, `gerir.perfis`, `gerir.permissoes`.

| Página | Caminho | Função |
|--------|---------|--------|
| **Utilizadores** | `/administration/utilizadores` | Criar, editar, desativar utilizadores; associar a perfis/departamentos. |
| **Gestores de Carteiras** | `/administration/gestores` | Gestão de gestores de carteiras. |
| **Perfis** | `/administration/perfis` | Definição de papéis (admin, gestor, operador...) e permissões por perfil. |
| **Permissões** | `/administration/permissoes` | Controlo granular de permissões por funcionalidade. |
| **Departamentos** | `/administration/departamentos` | Estrutura hierárquica de departamentos da empresa. |

### Utilizadores (tabela `users`)

- `full_name`, `email`, `password_hash`, `role`, `is_active`, `company_id`, `is_portfolio_only`.
- Bloqueio por tentativas (`failed_login_attempts`, `locked_until`), expiração de password (`password_changed_at`).
- Último login com IP e user-agent (`last_login_ip`, `last_login_user_agent`).
- Permissões individuais em `permissions_json` (JSONB); defaults aplicados por perfil.

---

## 17. Módulo Parametrização

**Páginas:** `src/app/pages/parametrization/` (Produtos de Crédito, Taxas, Penalizações, Limites, Calendário Financeiro).
**Permissões:** `alterar.parametros.negocio`.

| Página | Caminho | Função |
|--------|---------|--------|
| **Produtos de Crédito** | `/parametrization/produtos` | Tipos/produtos de crédito (Consumo, Negócio...) e regras por produto. |
| **Taxas** | `/parametrization/taxas` | Taxas de juros por tipo de produto/período. |
| **Penalizações** | `/parametrization/penalizacoes` | Penalizações por atraso, regras de mora e juros de mora. |
| **Limites** | `/parametrization/limites` | Limites de crédito por cliente/produto e controlo de exposição. |
| **Calendário Financeiro** | `/parametrization/calendario` | Feriados e dias úteis, calendário de vencimentos. |

Relacionado em BD: `loan_approval_policies` (limites de aprovação e mora), taxas de penalização no empréstimo, `risk_rules`.

---

## 18. Módulo Configurações

**Páginas:** `src/app/pages/settings/` (Empresa, Sistema, Integrações, Segurança, Backup).
**Permissões:** `alterar.configuracoes.sistema`.

| Página | Caminho | Função |
|--------|---------|--------|
| **Empresa** | `/settings/empresa` | Dados da empresa logada (sincronizados com a Central de Empresas). |
| **Sistema** | `/settings/sistema` | Configurações globais: MFA, timeout de sessão, política de passwords, privacidade (mascaramento). |
| **Integrações** | `/settings/integracoes` | Conectores para APIs externas (importação/matching). |
| **Segurança** | `/settings/seguranca` | Controlo de acesso e autenticação avançado. |
| **Backup** | `/settings/backup` | Gestão de backups do sistema. |

### Empresa

- **Campos:** nome, nome legal, NUIT, telefone, email, endereço, dados do proprietário (nome, NUIT, telefone, email, documento, morada), logo.
- **Fonte de verdade (Single Source of Truth):** os dados vêm da Central de Empresas; alterações refletem nos PDFs/relatórios automaticamente.
- Edição apenas para administradores (`alterar.configuracoes.sistema`).

### Sistema (parâmetros de autenticação/privacidade)

- `companies.auth_enforce_mfa`, `auth_mfa_code_hash`, `auth_session_timeout_min` (+ por perfil).
- `auth_password_min_length`, `require_upper/lower/number/special`, `expiry_days` (90), `max_login_attempts` (5), `lockout_minutes` (15).
- `privacy_mask_sensitive_data`, `privacy_allow_cross_company_lookup`.

---

## 19. Central Admin — Painel de Empresas

**Páginas:** `src/app/pages/admin/`.
**Permissões:** `admin_*` (apenas super-administradores).
**Navegação central:** `/admin-companies` (hub) → Dashboard, Assinaturas, Usuários, Suporte, Financeiro, Monitoramento, Notificações, Relatórios, Auditoria, Segurança, Configurações.

| Página | Caminho | Função |
|--------|---------|--------|
| **Central de Empresas** | `/admin-companies` | CRUD completo de empresas (fonte de verdade). |
| **Dashboard** | `/admin` | Dashboard administrativo consolidado (indicadores globais). |
| **Assinaturas** | `/admin-microcredito` | Gestão de planos/assinaturas das empresas. |
| **Usuários do Sistema** | `/admin/users` | Gestão de utilizadores em todas as empresas. |
| **Suporte** | `/admin/support` | Tickets de suporte das empresas. |
| **Financeiro da Plataforma** | `/admin/financeiro` | Visão financeira consolidada (pagamentos de planos). |
| **Monitoramento** | `/admin/monitoring` | Health e performance do sistema. |
| **Notificações** | `/admin/notifications` | Notificações da plataforma (todas as empresas). |
| **Relatórios** | `/admin/reports` | Relatórios administrativos consolidados. |
| **Auditoria** | `/admin/audit` | Auditoria consolidada de todas as empresas. |
| **Segurança** | `/admin/security` | Configurações de segurança globais. |
| **Configurações** | `/admin/settings` | Configurações globais da plataforma. |

### Central de Empresas (detalhe)

- Lista todas as empresas com nome, NUIT, telefone, email e estado.
- **Criar empresa** (formulário completo), **editar**, **ativar/desativar**, **eliminar**.
- **Fonte de verdade:** dados refletem automaticamente em Configurações > Empresa, cabeçalhos de PDF e faturação.
- Fluxo: `AdminCompaniesPage` → CRUD direto em `companies` → `GET/PUT /api/admin/companies` → `GET /api/company/profile` → PDFs/relatórios.
- Permissão: somente admins com `admin.gestao_empresas` (`admin_companies.manage`).

### Assinaturas / pagamentos das empresas

- `company_payments`: cobrança de planos (mensal/trimestral/anual), `payment_method`, `reference_no`, `receipt_no`, datas de validade, dias comprados, estado.
- Controlo de acesso por assinatura via middleware `subscription-check.js` (`companies.subscription_status`, `subscription_expires_at`, `subscription_grace_days`, `last_payment_at`, `total_paid`).
- `platform_settings`: preços dos planos (mensal 5000, trimestral 13500, anual 48000 MT), dias de carência (5), SMTP, SMS, nome/logo da plataforma, modo de manutenção.

### Módulos admin (migração 004)

- **Suporte:** `support_tickets` (categoria, prioridade, estado, responsável, nota de resolução) + `support_ticket_messages` (internas/públicas).
- **Notificações da plataforma:** `platform_notifications` (tipo, severidade, `target_companies`, agendamento, envio).
- **Configurações da plataforma:** `platform_settings` (chave→valor).

### Admin financeiro da plataforma

- Consolida `company_payments`, receitas por plano, estado das assinaturas, pendências (carência expirada).

---

## 20. API — Endpoints por módulo

Todos os routers são montados em `backend/src/routes/index.js` sob `/api`.

### `POST /api/auth` (auth-routes)
- `POST /login`, `POST /refresh`, `POST /logout`, `POST /forgot-password`, `POST /reset-password` (OTP), `POST /mfa/verify`.

### `/api/clients` (client-routes)
- CRUD de clientes, documentos, avaliações, garantias, fiadores, grupos/membros; pesquisa e histórico.

### `/api/loans` (loan-routes → loans/index.js)
- CRUD de pedidos/empréstimos, análise, aprovação, autorização, desembolso, estado.
- Instalações (`loan_installments`), reembolsos, alocações, promessas, renegociações.
- Eventos financeiros e auditoria (contrato/prestações).

### `/api/dashboard` (dashboard-routes)
- `GET /summary` (KPIs principais), `GET /risk-portfolio` (métricas de risco da carteira).

### `/api/finance-session` (finance-session-routes)
- `GET /state`, `POST /open`, `POST /reinforcement`, `POST /close`, `GET /history`, `GET /audit`, `GET /reopen-audit`.

### `/api/accounting` (accounting-routes)
- `GET /accounts`, `GET/POST /account-templates(...)`, `GET /ledger`, `GET/POST /cash-flow/overview|expenses|policy|cost-centers`, `PATCH /cash-flow/expenses/:id/decision`, anexos, `POST /mora/accrue`.

### `/api/integrations` (integration-routes)
- `GET /transactions`, `GET/PUT /connectors`, `POST /transactions/import`, `POST /reconcile`.

### `/api/notifications` (notification-routes)
- Notificações in-app, configurações (SMS/email), modelos, envios, log.

### `/api/email` (email-routes)
- `GET /log`, `POST /test`, `GET /preview/:messageType`.

### `/api/ops` (ops-routes)
- Operações: reembolsos, mora, abates, extornos, capitalização, reestruturação.

### `/api/reports` (regulatory-report-routes)
- Relatórios regulatórios e encerramentos com assinatura.

### `/api/users` (user-routes)
- CRUD de utilizadores, perfis, permissões, departamentos.

### `/api/company` (company-context-routes)
- `GET /profile` (perfil da empresa logada), contexto multi-empresa.

### `/api/admin/companies` (company-routes)
- `GET` (listar), `POST`, `PUT /:id`, ativar/desativar empresas.

### `/api/admin/payments` (company-payment-routes)
- Gestão de pagamentos/planos de assinatura; emissão de recibos.

### `/api/admin/support` | `/api/admin/monitoring` | `/api/admin/notifications` | `/api/admin/audit` | `/api/admin/settings`
- Tickets de suporte; health/performance; notificações da plataforma; auditoria consolidada; configurações globais.

### `/api/carteiras` (carteira-routes) | `/api/risk` (risk-routes) | `/api/eventos` (eventos-routes) | `/api/seed` (seed-routes)
- Portfólios/carteiras e transferências; regras e métricas de risco; eventos críticos (desembolsos/extornos/reestruturações); dados de seed.

---

## 21. Base de dados — Tabelas

Migrações versionadas em `backend/src/db/migrations/` (001–008), registadas em `schema_migrations`.

### Núcleo (001 — initial_schema)
`companies`, `users`, `clients`, `client_group_members`, `client_documents`, `client_evaluations`, `collaterals`, `guarantors`,
`loans`, `loan_installments`, `loan_installment_audit`, `loan_repayments`, `loan_repayment_allocations`, `loan_payment_promises`, `loan_renegotiations`,
`loan_approval_policies`, `loan_approval_requests`, `loan_financial_events`, `loan_group_member_allocations`, `loan_contract_audit`, `loan_documents`,
`accounting_accounts`, `accounting_entries`, `accounting_entry_lines`, `cash_cost_centers`, `cash_expenses`, `cash_expense_attachments`, `cash_expense_audit`, `cash_flow_policies`,
`external_transactions`, `integration_connectors`, `finance_day_sessions`, `finance_day_session_audit`, `finance_day_reopen_audit`, `reconciliation_runs`,
`regulatory_report_closures`, `collection_performance_month_closures`, `auth_login_audit`, `security_audit_log`, `password_reset_otps`, `system_backup_jobs`.

### 002 — Notificações/SMS
`notification_settings`, `system_notifications`, `client_sms_log`, `installment_reminder_log`.

### 003 — Pagamentos das empresas
`company_payments` + colunas de subscrição em `companies` (`subscription_status`, `subscription_expires_at`, `subscription_grace_days`, `last_payment_at`, `total_paid`).

### 004 — Módulos admin
`support_tickets`, `support_ticket_messages`, `platform_notifications`, `platform_settings`.

### 005 — Carteiras/Portfólios
`portfolios`, `portfolio_transfers` + `carteira_id` em `clients`/`loans`/`loan_repayments`.

### 006 — Regras de risco
`risk_rules`.

### 007/008 — Canal de email
`client_email_log` + colunas de SMTP em `notification_settings`.

### Modelo de dados em destaque

- **Cliente:** `name`, `client_type` (singular/grupo/empresa), `nuit`, `phone`, `score`, `status`, dados de localização/socioeconómicos/negócio.
- **Empréstimo:** `contract_no`, `client_id`, `product`, `principal`, `balance`, `interest_rate`, `administrative_fee_*`, `disbursement_net_amount`, `daily_penalty_rate`, `mora_waived_total`, `amortization_method` (price/sac), `payment_frequency`, `status`, datas (`disbursed_on`, `maturity_on`, `next_payment_on`), `days_overdue`.
- **Empresa:** dados legais/NUIT/contactos/proprietário, parâmetros de autenticação, privacidade, subscrição, `accounting_template_code`.

---

## 22. Segurança e Auditoria técnica

### Segurança implementada

- **Permissões no backend** (middleware `permissions.js`) — não apenas na UI.
- **Rate limiting** no login (`express-rate-limit`).
- **Helmet** para headers HTTP seguros.
- **CORS** configurado (ex.: dev em `http://localhost:5173`).
- **Validação de input** com **Zod** nos endpoints críticos (`validators/auth.js`).
- **JWT** com segredo forte exigido em produção (recomendado ≥32 caracteres).
- **MFA** e política de passwords configuráveis por empresa.
- **Contas bloqueadas** após tentativas falhadas (`users.locked_until`).

### Auditoria tamper-evident (imutável)

- `security_audit_log` encadeia registos com **corrente de hashes**:
  > `entry_hash = hash(payload_atual)` e `previous_hash = hash(registo_anterior)`.
  - Qualquer alteração posterior quebra a corrente, detetando adulteração.
  - Regista `actor`, `role`, `module`, `resource`, `method`, `path`, `query`, `body`, `status`, `ip`, `user_agent`, `device`.

### Auditoria por domínio

- Login (`auth_login_audit`), dia financeiro (`finance_day_*_audit`), caixa (`cash_expense_audit`), empréstimos (`loan_contract_audit`, `loan_installment_audit`), reaberturas (`finance_day_reopen_audit`).

---

## 23. Backup e Continuidade de negócio

Docs completos em `backend/CONTINUITY_PLAN.md` e página `Configurações > Backup`.

### Objetivos (RPO/RTO)
- RPO alvo: **15 minutos**.
- RTO alvo: **2 horas**.

### Rotina operacional
1. **Backup incremental** a cada 15 minutos.
2. **Backup full** diário (fora do horário de pico).
3. **Teste de restore** semanal, com checklist funcional.
4. **Drill de continuidade** mensal, com registo em `system_backup_jobs`.

### Recuperação
```bash
# Restaurar último backup válido
powershell -ExecutionPolicy Bypass -File backend/scripts/restore.ps1 -BackupFile <arquivo.sql>
```
Validação pós-restore: login + dashboard de risco, listagem de clientes/empréstimos, conciliação externa. Monitorização por 24h.

### Evidências obrigatórias
- ID do job em `system_backup_jobs`, tempo real de restore, resultado da validação, ações corretivas.
- Excel: também existe um ficheiro de referência "Fluxo de Caixa.xlsx" em `backend/`.

---

## 24. Como executar o sistema

### Requisitos
- Node.js 20+, PostgreSQL 14+, npm.

### Setup
```bash
cp .env.example .env
cp backend/.env.example backend/.env   # editar credenciais e JWT_SECRET
npm install
npm --prefix backend install
npm run db:migrate
npm run db:seed
```

### Desenvolvimento
```bash
npm run dev:full     # frontend (5173) + backend (8000) em paralelo
npm run build        # build de produção do frontend
npm run db:reset     # reset da base
npm --prefix backend test
```

### Docker
```bash
docker compose up --build
```
Serviços: `db` (PostgreSQL 16), `api` (Express :8000), `web` (Nginx :5173 → :80).

---

## 25. Documentos gerados (PDF) e formatação

Geração no frontend usando **jsPDF** + **jspdf-autotable** (`src/app/lib/print.ts`, `download.ts`, `format.ts`).
Os cabeçalhos dos documentos usam os **dados da empresa** (nome, NUIT, contactos, logo) como fonte de verdade.

Modelos PDF observados na pasta `src/app/form/`:
- **Desembolso.pdf** — comprovativo de desembolso.
- **REEMBOLSO.pdf** — recibo/comprovativo de reembolso.
- **Carteira Em Mora.pdf** — situação de mora por carteira.
- **Carteira Desempenho Fecho.pdf** — desempenho/fecho por carteira.
- **Reemb Previstos.pdf** — reembolsos previstos.
- **Confissao Divida.pdf**, **Declaracao.pdf**, **Termo Compromisso.pdf** — documentos jurídicos/declarativos.
- **RCreditoMoraAtual.pdf** — relatório de crédito em mora.
- **Estado do crédito** por cliente (ex.: "estado antonio sibone.pdf").

Gerador do simulador também produz PDF de plano de pagamento.

---

## 26. Roadmap / próximos passos de refactor

Conforme `docs/ARCHITECTURE.md`:
- Dividir `loan-routes.js` em sub-routers em `routes/loans/` (já iniciado: `loans/index.js` é o ponto modular).
- Extrair hooks dos pages grandes do frontend.
- Testes E2E nos fluxos críticos (login, desembolso, reembolso).
- API atual já está estruturada por domínio com base modular para evolução incremental.

---

## Anexo — Navegação lateral (MainLayout)

Grupos por ordem: **Dashboard → Simulador → Clientes → Crédito** (itens diretos) e depois grupos **Operações → Central de Risco → Carteiras → Financeiro → Relatórios → Notificações → Auditoria → Administração → Parametrização → Configurações**. Para admin central, a sidebar usa **Central Admin** (Central de Empresas, Dashboard, Assinaturas, Usuários, Suporte, Financeiro, Monitoramento, Notificações, Relatórios, Auditoria, Segurança, Configurações).

---

*Esta documentação foi gerada automaticamente a partir da análise do código-fonte do repositório `c:\MSU@` (frontend React, backend Express e migrações PostgreSQL). Alguns endpoints e detalhes de render devem ser confirmados diretamente nos ficheiros-fonte para a versão mais recente.*