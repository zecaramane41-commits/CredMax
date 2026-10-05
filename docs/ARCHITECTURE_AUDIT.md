# Auditoria de Arquitetura — CredMax

## Estado auditado

- Branch de referência: `main`
- Commit auditado: `d81c978a586741f23e63f3ebe8349e5996173591`
- Fonte oficial: `zecaramane41-commits/CredMax`
- Objetivo: preparar a evolução para Client 360, originação digital, workflow de crédito, carteira, cobrança, integrações e consignado sem reescrever os domínios que já funcionam.

## Conclusões principais

### 1. O núcleo de crédito já é substancial

Existem atualmente estruturas para:

- clientes e documentos;
- avaliações;
- grupos solidários;
- garantias/avalistas;
- pedidos de aprovação;
- empréstimos;
- contratos e documentos;
- parcelas;
- pagamentos e alocações;
- promessas de pagamento;
- renegociações;
- eventos financeiros;
- carteiras;
- risco;
- notificações;
- contabilidade;
- reconciliação;
- integrações;
- parametrização de produtos, encargos, limites e calendário financeiro.

**Decisão:** preservar estas capacidades e evoluí-las incrementalmente.

### 2. O maior problema atual é organização de domínio

`client-routes.js` possui aproximadamente 1.731 linhas e concentra CRUD, documentos, avaliações, garantias e colaterais.

`loan-routes.js` possui aproximadamente 9.449 linhas e concentra aprovação, encargos, simulação, empréstimos, desembolso, parcelas, pagamentos, cobrança, promessas, renegociação e operações financeiras.

**Decisão:** não reescrever estes arquivos de uma vez. Introduzir serviços e sub-rotas gradualmente, mantendo os endpoints existentes durante a migração.

### 3. Client 360 é a primeira fundação funcional

O banco já possui:

- `clients`;
- `client_documents`;
- `client_evaluations`;
- `client_group_members`;
- `guarantors`;
- `collaterals`;
- `loans`;
- `loan_repayments`;
- `loan_installments`;
- `loan_payment_promises`;
- `loan_renegotiations`;
- `portfolios`.

O frontend já possui a área de Clientes, pesquisa e operações relacionadas, mas ainda não existe uma visão única e completa de Cliente 360.

**Gap P0:** criar uma página/detalhe 360 que agregue identidade, documentos, avaliações, créditos, parcelas, pagamentos, cobrança, garantias, carteira, histórico e auditoria.

### 4. Global search é P0

Hoje há pesquisa na área de clientes, mas não há evidência de uma camada única de pesquisa transversal para:

- clientes;
- pedidos;
- créditos;
- contratos;
- pagamentos;
- documentos.

**Decisão:** criar serviço/API de pesquisa global após a fundação do Client 360.

### 5. Originação digital ainda é um gap P0

Já existe `POST /loans/simulate` e existe fluxo interno de pedidos de aprovação, mas o blueprint exige uma origem pública separada:

`simulação pública → pedido → identificação → consentimento → submissão → triagem`.

**Decisão:** não expor diretamente o fluxo interno de aprovação como portal público. Criar domínio de candidatura/pedido de crédito separado e ligá-lo ao crédito interno.

### 6. Workflow de crédito precisa de uma fonte explícita

O sistema já possui estados de pedidos e empréstimos, mas o blueprint exige uma máquina de estados auditável para:

`DRAFT → SUBMITTED → TRIAGE → DOCUMENTATION → ANALYSIS → EVALUATION → APPROVAL → APPROVED → CONTRACT → DISBURSEMENT → ACTIVE → PAID`

com estados alternativos de rejeição, cancelamento, expiração, incumprimento, reestruturação e write-off.

**Gap P0:** introduzir workflow/eventos de transição sem eliminar os estados legados até que a migração esteja concluída.

### 7. Auditoria e permissões já existem e devem ser reutilizadas

O sistema possui middleware de permissões, logs de segurança/auditoria e vários mecanismos de auditoria por domínio.

**Decisão:** nenhuma nova operação crítica deve depender apenas de autorização no frontend. Transições de estado, aprovação, desembolso, pagamento, reversão e alterações de parâmetros devem permanecer protegidas no backend e auditadas.

### 8. Multiempresa e carteiras já estão presentes

As entidades centrais possuem `company_id` e o sistema já possui escopo de empresa e carteiras.

**Gap P0/P1:** reforçar isolamento de empresa nas novas consultas e endpoints; nunca implementar Client 360 ou pesquisa global sem filtro de empresa no backend.

### 9. Migrações precisam de normalização

Foi encontrado conflito de numeração:

- `010_credit_products.sql`
- `010_disbursed_request_status.sql`
- `011_financial_calendar.sql`
- `011_payment_methods.sql`

O migrador ordena arquivos lexicograficamente.

**Gap P0:** normalizar a sequência de migrações antes de uma grande expansão do schema, evitando instalações limpas com ordem ambígua.

### 10. Schema inicial deve ser tratado como legado de referência

`001_initial_schema.sql` é descrito como schema exportado/introspectado. Ele contém muitas entidades centrais, mas não deve ser usado como justificativa para duplicar tabelas.

**Decisão:** novas migrações devem alterar/adicionar estruturas de forma explícita. Antes de criar qualquer entidade nova, verificar se a capacidade já existe em tabelas atuais.

## Matriz Current → Target → Gap → Prioridade

| Domínio | Current | Target | Gap | Prioridade |
|---|---|---|---|---|
| Clientes | CRUD + pesquisa + documentos | Client 360 | visão agregada, histórico e timeline | P0 |
| Documentos | `client_documents` e documentos de crédito | cofre documental por cliente/crédito | integração no 360 + validade + auditoria | P0 |
| Avaliação | `client_evaluations` | avaliação agendada + resultado + evidências | agenda e ligação ao workflow | P0 |
| Crédito | `loans` muito desenvolvido | Credit 360 + workflow | agregação e máquina de estados | P0 |
| Aprovação | `loan_approval_requests` | aprovação multi-nível configurável | separar pedido/originação de decisão | P0 |
| Pagamentos | parcelas + reembolsos | ledger operacional completo | melhorar timeline, reversão e reconciliação no 360 | P0 |
| Cobrança | promessas + operações | coleção orientada a tarefas/eventos | consolidar no crédito/cliente 360 | P1 |
| Risco | regras + score + métricas | decisão assistida e rastreável | integrar análise/workflow | P0 |
| Parametrização | produtos, encargos, limites, calendário | políticas por empresa/produto | validar todos os fluxos | P0 |
| Pesquisa | pesquisa de clientes | pesquisa global | serviço transversal | P0 |
| Portal público | inexistente como domínio dedicado | simulação + pedido online | novo domínio/API/UX | P0 |
| Contratos | documentos/auditoria existentes | contrato versionado + assinatura | fluxo de condições e assinatura | P1 |
| Garantias | colaterais/avalistas | garantias ligadas ao crédito | consolidar no Credit 360 | P1 |
| Financeiro | caixa, contabilidade, reconciliação | integração ponta a ponta | integração com workflow | P1 |
| Integrações | conectores e eventos existentes | adaptadores idempotentes | health/retry/webhook/reconciliação | P1 |
| Consignado | sem domínio dedicado | margem, autorização, lote e retorno | novo domínio | P1 |
| PWA | frontend web existente | PWA online-first | auditoria técnica | P1 |
| Auditoria | múltiplos logs | trilha transversal | unificar eventos críticos | P0 |

## Ordem de implementação aprovada

1. Normalizar estratégia de migrações.
2. Client 360: backend agregador + frontend.
3. Workflow/eventos de crédito.
4. Pesquisa global.
5. Originação pública: simulação → pedido → triagem.
6. Credit 360 completo.
7. Contratos, garantias e desembolso.
8. Pagamentos e cobrança consolidados.
9. Dashboard operacional, risco e relatórios.
10. Consignado e camada de integração oficial.
11. PWA, notificações, observabilidade e APIs externas.

## Regra de evolução

Antes de alterar um domínio:

1. localizar UI;
2. localizar API;
3. localizar regras de negócio;
4. localizar tabelas/migrações;
5. localizar permissões;
6. localizar auditoria;
7. localizar integrações;
8. identificar dependências;
9. alterar incrementalmente;
10. validar build/testes;
11. publicar no GitHub com commit/PR verificável.

## Próximo domínio

O próximo desenvolvimento deve ser **Client 360**, preservando os endpoints atuais e adicionando uma camada de agregação própria para não transformar novamente `client-routes.js` em um monólito.
