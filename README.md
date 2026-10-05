# MSU — Sistema de Microcrédito

Plataforma full-stack para gestão de microcrédito em Moçambique: clientes, créditos, desembolsos, reembolsos, dia financeiro, contabilidade e relatórios regulatórios.

> **Blueprint oficial:** [docs/BLUEPRINT_CREDMAX.md](docs/BLUEPRINT_CREDMAX.md) define a arquitetura funcional alvo e a estratégia de migração incremental do CredMax.

## Estrutura do projeto

```
MSU/
├── shared/                 # Código partilhado (permissões)
├── src/                    # Frontend React + Vite + TypeScript
├── backend/                # API Express + PostgreSQL
│   ├── src/
│   │   ├── config/         # Ambiente e base de dados
│   │   ├── db/             # Migrações e seeds
│   │   ├── middleware/     # Auth, permissões, validação
│   │   ├── routes/         # Endpoints REST
│   │   ├── services/       # Lógica de negócio reutilizável
│   │   ├── utils/          # Utilitários
│   │   └── validators/     # Schemas de entrada
│   └── scripts/            # Backup, exportação de schema
├── docs/                   # Documentação técnica e blueprint
├── docker-compose.yml      # Ambiente local com Docker
└── package.json            # Scripts do frontend
```

## Requisitos

- Node.js 20+
- PostgreSQL 14+
- npm

## Configuração rápida

1. Copiar variáveis de ambiente:
```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

2. Editar `backend/.env` com credenciais reais da base de dados e um `JWT_SECRET` forte (mín. 32 caracteres em produção).

3. Instalar dependências:
```bash
npm install
npm --prefix backend install
```

4. Migrar e popular a base de dados:
```bash
npm run db:migrate
npm run db:seed
```

5. Iniciar em desenvolvimento:
```bash
npm run dev:full
```

- Frontend: http://localhost:5173
- API: http://localhost:8000/api

## Scripts principais

| Comando | Descrição |
|---------|-----------|
| `npm run dev:full` | Frontend + backend em paralelo |
| `npm run build` | Build de produção do frontend |
| `npm run db:migrate` | Aplicar migrações versionadas |
| `npm run db:seed` | Criar utilizador admin inicial |
| `npm --prefix backend test` | Testes do backend |

## Segurança

- Permissões aplicadas no **backend** (não apenas na UI)
- Rate limiting no login
- Helmet para headers HTTP
- Validação de input com Zod nos endpoints críticos
- Catálogo de permissões centralizado em `shared/permissions.mjs`

## Docker

```bash
docker compose up --build
```

## Documentação adicional

- [Blueprint oficial do CredMax](docs/BLUEPRINT_CREDMAX.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Plano de continuidade](backend/CONTINUITY_PLAN.md)
