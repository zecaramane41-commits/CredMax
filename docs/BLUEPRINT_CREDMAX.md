# Blueprint Oficial do CredMax

> Documento de referência funcional para a evolução do CredMax para uma plataforma profissional, online, escalável e orientada ao ciclo completo de crédito.

## 1. Objetivo

O CredMax deve evoluir de um sistema organizado por páginas isoladas para uma plataforma de gestão de microcrédito orientada por **cliente, crédito, processos, estados, regras de negócio, risco, pagamentos e auditoria**.

O princípio central é:

**Cliente → Simulação → Pedido → Triagem → Avaliação → Análise → Aprovação → Contrato → Garantias → Desembolso → Carteira → Pagamentos → Cobrança → Liquidação/Renovação**

Os módulos administrativos devem suportar esse ciclo sem duplicar dados nem criar processos paralelos.

## 2. Princípios de arquitetura funcional

1. **Cliente 360°**: toda a relação com o cliente deve ser consultável numa ficha única.
2. **Crédito 360°**: cada operação deve possuir estado, histórico, documentos, decisões, agenda, contrato, plano e pagamentos.
3. **Workflow explícito**: mudanças críticas de estado devem ser controladas, autorizadas e auditadas.
4. **Single source of truth**: cada dado operacional deve ter uma origem canónica.
5. **Configuração por empresa**: produtos, taxas, limites, calendários, regras de aprovação e risco devem ser parametrizáveis.
6. **Multiempresa/multifilial**: isolamento por empresa deve existir no backend e na base de dados.
7. **Segurança por permissão**: a UI não substitui autorização no backend.
8. **Auditabilidade**: decisões e alterações críticas devem preservar quem, quando, o quê e porquê.
9. **Online-first**: o produto deve funcionar como aplicação web responsiva/PWA e API.
10. **Integração por contratos**: integrações externas devem possuir adaptadores/API contracts próprios, sem acoplamento à lógica principal.
11. **Human-in-the-loop**: IA e automação podem recomendar, classificar e alertar, mas decisões críticas devem respeitar as políticas de aprovação configuradas.
12. **Evolução incremental**: preservar funcionalidades estáveis e migrar por domínio, evitando reescritas desnecessárias.

## 3. Navegação alvo

### Dashboard
- visão operacional
- KPIs da carteira
- pedidos novos
- créditos em análise
- aprovações pendentes
- desembolsos pendentes
- pagamentos
- atrasos
- cobrança
- alertas e tarefas

### Clientes
- todos
- individuais
- empresas/empresários
- grupos solidários
- funcionários públicos
- pesquisa global
- perfil 360°
- documentos
- rendimentos e despesas
- empregador
- garantias
- histórico de crédito
- contactos
- atividades e tarefas

### Crédito
- simulador
- pedidos
- triagem
- documentação
- avaliações
- análise
- aprovação
- contratos
- garantias
- desembolsos

### Carteira
- ativa
- próxima do vencimento
- em atraso
- crítica
- liquidada
- reestruturada
- renovação

### Pagamentos
- recebimentos
- pagamentos pendentes
- métodos
- alocações
- reconciliação
- estornos/correções controladas

### Cobrança
- carteira vencida
- tarefas
- contactos
- promessas de pagamento
- visitas
- acordos
- campanhas
- escalonamento

### Consignado
- funcionários
- empregadores
- margem consignável
- autorizações
- ordens de desconto
- lotes
- retornos
- reconciliação
- integrações

### Financeiro
- caixa
- contas
- movimentos
- transferências
- liquidações
- fechos

### Contabilidade
- lançamentos
- contas
- diário
- reconciliação
- fechos
- exportações

### Risco
- score
- exposição
- capacidade de pagamento
- alertas
- concentração
- PAR
- inadimplência
- regras de risco

### Relatórios
- carteira
- crédito
- pagamentos
- cobrança
- financeiro
- risco
- regulatório
- auditoria
- exportação

### Notificações
- inbox operacional
- e-mail
- SMS
- WhatsApp
- push/PWA
- preferências e templates

### Integrações
- pagamentos
- bancos
- mobile money
- SMS/e-mail/WhatsApp
- contabilidade
- folha/consignado
- APIs externas
- webhooks
- monitorização de integrações

### Configurações
- empresa
- filiais
- utilizadores
- perfis
- permissões
- produtos
- taxas
- penalizações/mora
- limites
- aprovação
- risco
- calendário financeiro
- documentos
- notificações
- integrações

## 4. Cliente 360°

A pesquisa de clientes deve suportar nome, documento, NUIT, telefone, número interno, conta e identificadores profissionais quando aplicáveis.

Ao abrir um cliente, o sistema deve apresentar:

### Resumo
- estado
- score
- limite disponível
- exposição
- saldo atual
- total emprestado
- total pago
- atraso atual
- próxima prestação
- responsável

### Dados
- identificação
- contactos
- endereço
- situação familiar
- atividade/profissão
- empregador
- rendimento
- despesas
- dependentes

### Documentos
- documento de identificação
- NUIT
- comprovativos
- declarações
- contratos
- garantias
- anexos
- validade e estado de verificação

### Histórico
- pedidos
- créditos
- pagamentos
- atrasos
- cobranças
- avaliações
- alterações relevantes
- comunicações

## 5. Crédito 360°

Cada crédito deve possuir:

- identificador único
- cliente
- produto
- valor solicitado
- valor aprovado
- valor desembolsado
- prazo
- frequência
- taxa
- taxas/encargos
- penalização
- método de amortização
- garantias
- estado
- responsável
- agência/filial
- datas relevantes

Abas funcionais:
- resumo
- timeline
- análise
- aprovação
- contrato
- garantias
- plano de pagamento
- pagamentos
- atraso/mora
- cobrança
- documentos
- auditoria

## 6. Workflow de crédito

Estados de referência:

`DRAFT → SUBMITTED → TRIAGE → DOCUMENTATION → ANALYSIS → EVALUATION → APPROVAL → APPROVED → CONTRACT → DISBURSEMENT → ACTIVE → PAID`

Estados alternativos:
- REJECTED
- CANCELLED
- EXPIRED
- DELINQUENT
- RESTRUCTURED
- WRITTEN_OFF, quando aplicável

Cada transição crítica deve registrar:
- estado anterior
- novo estado
- utilizador
- data/hora
- motivo
- observação
- evidências/documentos quando aplicável

## 7. Portal público e origem digital de pedidos

O CredMax deve disponibilizar uma experiência pública para partilha pela empresa.

Fluxo:

**Link público → Simulação → Resultado → Solicitação → Identificação → Consentimentos → Envio → Pedido criado no CredMax**

O simulador deve respeitar as parametrizações ativas da empresa e indicar claramente que o resultado é uma estimativa sujeita a análise e aprovação.

Ao solicitar:
- criar pedido com identificador
- associar/identificar cliente
- guardar dados da simulação
- notificar equipa
- iniciar triagem
- permitir solicitação de documentos
- permitir agendamento de avaliação

O portal público não deve expor dados internos nem permitir contornar autenticação e regras de aprovação.

## 8. Triagem e avaliação

A triagem deve possuir checklist e ações:
- aceitar
- solicitar documentação
- encaminhar
- agendar avaliação
- rejeitar com motivo

A agenda de avaliações deve suportar:
- avaliador
- cliente
- data/hora
- localização
- tipo
- estado
- resultado
- observações
- anexos

## 9. Análise e aprovação

A central de análise deve consolidar:
- capacidade financeira
- taxa de esforço
- histórico
- exposição
- score
- garantias
- documentação
- alertas de risco
- exceções às políticas

A aprovação deve ser multi-nível conforme valor, produto, risco e regras da empresa.

Deve existir segregação entre:
- preparação
- análise
- aprovação
- execução/desembolso

Quando uma operação exceder uma política, o sistema deve exigir tratamento explícito da exceção, com autorização e auditoria.

## 10. Contratos, garantias e desembolso

Após aprovação:
1. gerar contrato com dados da operação;
2. controlar versão e estado;
3. recolher assinatura/aceitação conforme integração disponível;
4. validar garantias e condições precedentes;
5. criar ordem de desembolso;
6. validar destino e método;
7. processar;
8. confirmar;
9. iniciar carteira.

Nenhuma operação deve ser marcada como desembolsada apenas por alteração manual de um estado sem evidência operacional adequada.

## 11. Amortização, pagamentos e cobrança

O plano deve suportar os métodos e frequências configurados pela empresa/produto.

Cada prestação deve possuir:
- principal
- juros
- taxas
- mora/penalização
- valor devido
- valor pago
- saldo
- vencimento
- estado

Pagamentos devem suportar:
- identificação
- método
- referência
- data
- valor
- alocação
- confirmação
- reconciliação
- estorno/correção controlada

A cobrança deve ser baseada em tarefas e eventos, não apenas numa lista de atrasos.

## 12. Consignado e funcionários públicos

O CredMax deve possuir um domínio próprio para crédito consignado, preparado para futura integração oficial.

Dados de referência:
- empregador
- entidade
- identificador do funcionário
- categoria
- remuneração
- descontos
- margem disponível
- autorização de desconto

Fluxo alvo:

**Cliente → Validação profissional → Cálculo da margem → Solicitação/autorização → Crédito → Ordem de desconto → Lote → Processamento externo → Retorno → Reconciliação → Pagamento**

A integração com sistemas estatais só deve ser ativada através de interfaces, credenciais, contratos e autorizações oficiais. Até existir uma integração real, o sistema deve trabalhar com um adaptador/mock claramente separado, nunca simulando uma integração oficial em produção.

## 13. Modelo de dados alvo

A estrutura deve evoluir em torno dos domínios:

- companies
- branches
- users
- roles/permissions
- clients
- client_documents
- client_contacts
- client_addresses
- client_employment
- client_income
- client_expenses
- solidarity_groups
- credit_products
- credit_applications
- application_documents
- evaluations
- credit_analyses
- approval_requests
- approval_decisions
- contracts
- guarantees
- loans
- loan_schedules
- loan_installments
- payments
- payment_allocations
- collections
- collection_actions
- promises_to_pay
- restructurings
- financial_accounts
- financial_transactions
- accounting_entries
- risk_scores
- notifications
- integration_connections
- integration_events
- integration_batches
- audit_events
- configuration tables

Nomes exatos e normalização serão definidos durante a auditoria do schema existente; não criar tabelas duplicadas quando uma estrutura existente puder ser evoluída com segurança.

## 14. Pesquisa, listas e padrões de UX

Todas as entidades operacionais devem seguir um padrão consistente:
- pesquisa
- filtros
- ordenação
- paginação
- exportação quando aplicável
- ações por permissão
- estados visuais consistentes
- empty state
- loading
- erro recuperável

A pesquisa global deve localizar, quando autorizado:
- clientes
- créditos
- pedidos
- contratos
- pagamentos
- referências operacionais

## 15. Notificações orientadas por eventos

Eventos importantes devem produzir notificações configuráveis:
- novo pedido
- documentação pendente
- avaliação agendada
- crédito aprovado/rejeitado
- contrato pendente
- desembolso pendente
- pagamento confirmado
- prestação próxima
- atraso
- promessa vencida
- reconciliação pendente
- integração com erro

Canais previstos:
- in-app
- e-mail
- SMS
- WhatsApp
- push/PWA

## 16. Dashboard operacional

O dashboard deve privilegiar decisões e trabalho pendente:
- carteira total
- desembolsos
- recebimentos
- PAR
- atraso
- pedidos
- análises
- aprovações
- cobrança
- reconciliação
- alertas
- tarefas

Os indicadores devem ser derivados de dados transacionais e ter definições documentadas.

## 17. Segurança, auditoria e conformidade

Obrigatório para operações críticas:
- autenticação segura
- MFA quando aplicável
- gestão de sessões
- permissões granulares
- segregação de funções
- maker/checker
- limites de aprovação
- proteção contra escalação de privilégios
- logs de segurança
- auditoria de alterações
- isolamento por empresa
- proteção de documentos e dados pessoais
- rate limiting e validação de input
- gestão de segredos fora do código

## 18. Integrações

As integrações externas devem ficar atrás de uma camada própria.

Cada integração deve possuir:
- configuração
- credenciais/segredos
- estado
- health/status
- requests
- responses
- retries
- idempotência
- logs
- webhooks
- reconciliação
- alertas

Domínios previstos:
- bancos
- mobile money
- pagamentos
- SMS
- e-mail
- WhatsApp
- assinatura
- contabilidade
- folha/consignado
- APIs externas

## 19. PWA e operação online

O produto deve ser responsivo e preparado para PWA:
- instalação no dispositivo
- experiência mobile
- notificações push quando suportadas
- cache seguro de recursos públicos
- tratamento de conectividade
- recuperação de sessão
- APIs versionadas

Não armazenar offline dados sensíveis sem uma estratégia explícita de segurança e expiração.

## 20. IA e automação

A IA pode apoiar:
- classificação
- pesquisa
- resumo de cliente
- resumo de crédito
- detecção de inconsistências
- alertas de risco
- priorização de cobrança
- assistência documental

Não deve aprovar, desembolsar ou alterar decisões críticas autonomamente fora das regras e permissões definidas pela empresa.

## 21. Estratégia de migração

A migração deve ser incremental.

### Fase 1 — Fundação
- blueprint
- auditoria de schema
- clientes 360°
- pesquisa global
- estados/workflows
- documentos
- auditoria

### Fase 2 — Originação digital
- simulador público
- portal público
- pedidos
- triagem
- avaliação
- análise
- aprovação

### Fase 3 — Operação de crédito
- contratos
- garantias
- desembolso
- plano de pagamento
- pagamentos
- cobrança
- renovação/reestruturação

### Fase 4 — Gestão
- dashboard operacional
- risco
- financeiro
- contabilidade
- relatórios
- BI

### Fase 5 — Consignado
- funcionários públicos
- margem
- autorizações
- lotes
- descontos
- reconciliação
- adaptadores de integração oficial

### Fase 6 — Escala
- PWA
- notificações multicanal
- integrações
- APIs externas
- observabilidade
- performance
- alta disponibilidade

## 22. Regra de evolução do código

Antes de alterar um domínio:
1. localizar UI;
2. localizar API;
3. localizar regras de negócio;
4. localizar tabelas/migrações;
5. localizar permissões;
6. localizar integrações;
7. localizar auditoria;
8. identificar fluxos dependentes;
9. escrever/ajustar testes;
10. alterar de forma incremental;
11. validar build/testes;
12. commit e revisão;
13. merge;
14. verificar estado final.

Nunca duplicar uma entidade ou regra apenas para criar uma nova interface.

## 23. Critérios de aceitação do blueprint

Uma funcionalidade só é considerada completa quando:
- existe na UI quando necessário;
- possui API coerente;
- possui persistência correta;
- respeita company scope;
- respeita permissões;
- valida regras no backend;
- possui estados claros;
- trata erros;
- possui integração com os fluxos dependentes;
- possui auditoria quando crítica;
- possui testes adequados;
- não quebra fluxos existentes.

## 24. Ordem imediata de trabalho

Após este blueprint, o próximo trabalho técnico deve ser uma **auditoria de arquitetura do CredMax**, sem grandes alterações de código, cobrindo:

1. schema PostgreSQL;
2. domínio de clientes;
3. domínio de créditos;
4. workflow de pedidos;
5. pagamentos/cobrança;
6. permissões e auditoria;
7. pesquisa e UX das listas;
8. portal público;
9. arquitetura de integrações;
10. preparação para consignado.

A auditoria produzirá uma matriz:

| Domínio | Estado atual | Alvo | Gap | Prioridade | Migração |
|---|---|---|---|---|---|
| Clientes | existente | Cliente 360° | a determinar | P0 | incremental |
| Crédito | existente | Crédito 360° | a determinar | P0 | incremental |
| Parametrização | existente | configuração transversal | auditoria | P0 | preservar/evoluir |
| Portal público | parcial/ausente | origem digital | a determinar | P0 | novo domínio |
| Consignado | preparação | integração oficial | a determinar | P1 | novo domínio |
| PWA | a auditar | online/PWA | a determinar | P1 | incremental |

Este documento é o blueprint funcional de referência. A implementação deve seguir a auditoria e as prioridades definidas, não presumir que a arquitetura atual já corresponde ao alvo.
