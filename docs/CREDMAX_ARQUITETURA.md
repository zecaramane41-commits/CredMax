# CredMax — Arquitetura Oficial (Fase 1 · Fundação)

> **Filosofia central:** o CredMax não é um conjunto de páginas CRUD. É uma **plataforma completa de ciclo de crédito**, centrada no **cliente** e organizada por **processos** que atravessam os módulos. Cada informação nasce num ponto, passa por estados controlados e alimenta os módulos seguintes.

---

## 1. Visão do ciclo de crédito (eixo operacional)

```text
Cliente → Simulação → Pedido → Triagem → Avaliação → Análise de Crédito
      → Aprovação → Contrato → Garantias → Desembolso → Plano de Pagamento
      → Cobrança → Liquidação / Renovação
```

Eixo paralelo (gestão institucional):

```text
Empresa → Produtos → Políticas → Risco → Operações → Financeiro
      → Contabilidade → Relatórios → Auditoria
```

Cada etapa consome os dados da anterior e publica um **evento** que dispara notificações e alimenta o modo seguinte.

---

## 2. Arquitetura em camadas (online desde o início)

```text
Frontend Web / PWA (móvel responsivo)
         │  HTTPS
         ▼
API (Express + JWT/MFA + permissionamento por empresa)
         │
         ▼
Serviços de domínio (regras de negócio reutilizáveis)
         │
         ▼
PostgreSQL (multi-empresa via company_id)
         │
         ▼
Integrações externas (camada de integração — nunca fictícia)
```

Requisitos de plataforma:

- Autenticação segura, multi-sessão, auditoria
- Multiempresa (`company_id` por registo)
- Armazenamento de documentos
- Notificações (sistema, e-mail, SMS, WhatsApp, push/PWA)
- PWA / mobile responsive
- APIs de integração externa com controlo de acesso

---

## 3. Modelo de dados alvo

```text
COMPANY
   ├── CLIENT
   │     ├── DOCUMENT
   │     ├── ADDRESS
   │     ├── EMPLOYMENT        (tipo de rendimento, funcionário público, margem consignável)
   │     ├── INCOME
   │     └── CONTACT
   ├── CREDIT APPLICATION      (pedido → triagem → análise → avaliação → aprovação)
   │     └── DOCUMENT
   ├── LOAN
   │     ├── CONTRACT
   │     ├── GUARANTEE
   │     ├── SCHEDULE
   │     ├── INSTALLMENT
   │     ├── PAYMENT
   │     └── COLLECTION
   ├── ACCOUNTING
   ├── FINANCE
   └── AUDIT / PROCESS LOG
```

Princípio: **os dados são o centro**, agrupados por terem um dono (o cliente) e um ciclo de vida (o crédito).

---

## 4. Máquinas de estado (parte central do sistema)

### 4.1 Estado de um pedido / crédito

```text
DRAFT → SUBMITTED → TRIAGE → DOCUMENTATION → ANALYSIS → EVALUATION
     → APPROVAL → APPROVED → CONTRACT → DISBURSEMENT → ACTIVE
     → PAID | DELINQUENT | RESTRUCTURED
REJECTED  ← qualquer etapa de submissão/triagem/análise/aprovação pode rejeitar
REJECTED  → SUBMITTED  (reabertura de pedido rejeitado/bloqueado)
```

### 4.2 Estado do desembolso

```text
PENDING → VALIDATED → PROCESSED → CONFIRMED
```

### 4.3 Estado do desconto consignado

```text
AUTHORIZED → DISCOUNT_REQUESTED → PROCESSED → CONFIRMED → RECONCILED
```

### 4.4 Trilha de processo (obrigatória)

Toda mudança de estado regista sempre:

- `actor_user_id` (quem fez)
- `created_at` (quando fez)
- `from_state` (estado anterior)
- `to_state` (novo estado)
- `reason` (motivo)
- `note` (observação)
- `document_ids[]` (documentos relacionados)

Isto cria uma verdadeira **linha do tempo** por cliente e por crédito.

**Pontos de gravação automática (Fase 2.1):** criação do pedido (`SUBMITTED`), decisão
(avanço de etapa → `APPROVAL`, rejeição/bloqueio → `REJECTED`, reabertura → `SUBMITTED`,
aprovação final → `APPROVED`) e desembolso (`application → ACTIVE` +
`disbursement → CONFIRMED`). As etapas intermédias puladas pelo fluxo real são registadas
como `Avanço automático`; entidades antigas sem trilha recebem o estado inicial de forma
retroativa (`Trilha iniciada`). Cada passo individual continua validado pela máquina de
estados — a trilha nunca escreve transições inválidas.

---

## 5. Portal público do cliente

```text
https://empresa.com/credito
```

O cliente **não entra no sistema interno**. No portal público o cliente pode:

- criar conta / aceder
- simular crédito
- solicitar crédito
- acompanhar o pedido (estado + linha do tempo)
- consultar aprovação / contrato
- consultar crédito, prestações e pagamentos
- receber notificações
- solicitar renovação / liquidação
- enviar / atualizar documentos

### 5.1 Simulador público

Entrada: valor, prazo, frequência. Saída: prestação estimada, juros, taxas, total a pagar, primeiro vencimento — com o aviso explícito de que **é uma simulação dependente de análise e aprovação**. Botão **SOLICITAR ESTE CRÉDITO** cria diretamente um `CREDIT APPLICATION` em estado `SUBMITTED` no CredMax.

---

## 6. Originação interna

### 6.1 Triagem (checklist de documentação)

Por pedido: lista `APPLICATION_DOCUMENT` com estados (pendente / recebido / inválido). Ações: **Aceitar para análise** · **Solicitar documentação** · **Rejeitar** · **Agendar avaliação**.

### 6.2 Agendamento de avaliação (módulo próprio)

Entidade `EVALUATION` (avaliador, cliente, localização, data, hora, tipo, resultado, observações, anexos) + agenda + notificações automáticas.

### 6.3 Análise de crédito — Central de Análise

Perfil de risco (score, semáforo), capacidade financeira (rendimento disponível, taxa de esforço), histórico, exposição. O sistema **alerta** o analista (regras heurísticas) mas **nunca decide sozinho** — a decisão pertence às políticas de aprovação.

### 6.4 Aprovação em workflow parametrizável

```text
Analista → Supervisor → Gerente → Comité
```

Limitação por valor (exemplo inicial, parametrizável):

```text
0 – 20.000 MT          → Analista
20.001 – 100.000 MT    → Supervisor
100.001 – 500.000 MT   → Gerente
> 500.000 MT           → Comité
```

---

## 7. Contrato, garantias e desembolso

- **Contrato:** gerado automaticamente com os dados do cliente/produto/prestação/garantias; fluxo `gerado → enviado → assinado → concluído → pronto para desembolso`.
- **Garantias:** ligadas ao cliente e ao crédito, com estado e documentos.
- **Desembolso:** ordem controlada (`PENDING → VALIDATED → PROCESSED → CONFIRMED`) com método, conta destino, operador, referência.

---

## 8. Carteira, pagamentos e cobrança

- **Carteira:** Ativa · Vencida · Em atraso · Liquidada · Renovações.
- **Pagamentos:** prestações com mais de 1 dia; alocação a capital/juros/mora; confirmação.
- **Cobrança orientada por tarefas:** central de cobrança com filas (críticos / em atraso / próximos do vencimento) e ações (`Ligar`, `WhatsApp`, `Registar contacto`, `Promessa de pagamento`, `Visita`) + histórico completo.

---

## 9. Crédito consignado (preparado desde já, sem fingir acesso ao Estado)

### 9.1 Dados de funcionário público

`EMPLOYMENT.kind ∈ {private, corporate, self_employed, public, other}`. Para público: entidade empregadora, instituição, código do funcionário, categoria, salário bruto, salário líquido, descontos existentes, margem consignável, identificação funcional.

### 9.2 Motor de margem consignável

```text
Salário bruto − Descontos existentes = Salário líquido
Salário líquido × Margem permitida  = Margem consignável
```

Sugere a **prestação máxima recomendada**, evitando aprovar o que é incompatível com a margem.

### 9.3 Camada de integração com o Estado (abstrata, preparada, não fictícia)

```text
CredMax → Camada de Integração → API oficial / sistema autorizado → Sistema de salários
```

NÃO construir integração fictícia nem assumir acesso ao sistema estatal. A camada apenas deve suportar, quando existir uma API oficial real:

- autenticação/certificados/endpoints
- códigos de empregador e identificador do funcionário
- autorização de desconto e referência de desconto
- **lote de descontos** e **retorno do lote**
- reconciliação

### 9.4 Reconciliação

O sistema compara o esperado do lote vs. o recebido e expõe diferenças:

```text
Lote 2026-10 · esperado 1.200 · valor 12.500.000 MT
Processados 1.193 · falharam 7 · recebido 12.430.000 MT · diferença 70.000 MT
→ 🔴 7 descontos precisam de reconciliação
```

---

## 10. Organização dos módulos (menu alvo)

```text
DASHBOARD
├── CLIENTES        (Todos · Individuais · Empresas · Grupos · Funcionários Públicos)
├── CRÉDITO         (Simulador · Pedidos · Triagem · Avaliações · Análise · Aprovações
│                     · Contratos · Garantias · Desembolsos)
├── CARTEIRA        (Ativa · Vencida · Em atraso · Liquidada · Renovações)
├── PAGAMENTOS      (Recebimentos · Pendentes · Reconciliação · Métodos)
├── COBRANÇA        (Atrasados · Promessas · Contactos · Visitas · Campanhas)
├── CONSIGNADO      (Funcionários · Margens · Autorizações · Descontos · Reconciliação)
├── FINANCEIRO      (Caixa · Contas · Movimentos · Fecho)
├── CONTABILIDADE
├── RELATÓRIOS
├── NOTIFICAÇÕES
├── INTEGRAÇÕES
└── CONFIGURAÇÕES   (Empresa · Produtos · Taxas · Limites · Risco · Calendário
                      · Aprovações · Utilizadores · Permissões)
```

---

## 11. Experiência transversal

- **Perfil 360º do cliente:** Resumo (estado, score, limite, crédito atual, total emprestado/pago/atraso, próxima prestação, dias em atraso, risco, responsável) · Dados pessoais · Documentos · Créditos.
- **Ficha 360º do crédito:** Resumo + linha do tempo (eventos de estado).
- **Pesquisa global** obrigatória: por cliente, crédito, pedido, contrato, pagamento — num só campo.
- **Padrão único de listas:** `Título · Descrição · [Pesquisar][Filtros][Exportar][+ Novo] · Resultados · Paginação`, com filtros comuns (estado, período, agência, responsável, produto, valor, risco, carteira).
- **Dashboard operacional:** contadores do dia + KPIs (PAR 30, carteira) + lista de **ações necessárias**.
- **Notificações baseadas em eventos** (novo pedido, avaliação agendada, aprovado, prestação próxima/vencida, pagamento confirmado), com canais futuros (sistema, e-mail, SMS, WhatsApp, push).

---

## 12. Fases de implementação

| Fase | Âmbito |
|------|--------|
| **1 · Fundação** | arquitetura, clientes 360º, pesquisa global, estados/linha do tempo, documentos, auditoria |
| **2 · Originação** | portal público, simulador, pedidos, triagem, avaliação, análise, aprovação |
| **3 · Operação do crédito** | contratos, garantias, desembolso, amortização, pagamentos, cobrança, renovação |
| **4 · Gestão** | dashboards, risco, financeiro, contabilidade, relatórios, BI |
| **5 · Consignado** | funcionários públicos, margem, autorização, lotes, descontos, reconciliação, camada de integração |
| **6 · Escala** | PWA, notificações, integrações, APIs externas, automações, observabilidade, alta disponibilidade |

### Regra de migração

Antes de alterar código, cada funcionalidade existente é classificada (ver `CREDMAX_AUDITORIA.md`) e só depois migra fase a fase.