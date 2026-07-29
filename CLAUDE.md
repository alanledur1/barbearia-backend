# CLAUDE.md — Barbearia Shelby (backend)

Arquivo de contexto para o Claude Code. Lido automaticamente ao iniciar sessões neste repositório.
Atualize este arquivo conforme o projeto evolui.

> Contexto geral do projeto (frontend + backend, deploy, convenções compartilhadas) está em
> `CLAUDE.md` na pasta raiz `Barber project/` — não versionado aqui.

## Visão Geral

API REST em Node.js/TypeScript para o sistema de agendamento da Barbearia Shelby, usando
Express 5 e Prisma 7 sobre PostgreSQL.

## Estrutura

```
barbearia-backend/
├── src/
│   ├── controllers/       # Handlers das rotas
│   ├── routes/             # Definição das rotas Express
│   ├── services/           # Regras de negócio
│   ├── middlewares/        # Auth, validação, etc.
│   ├── schemas/            # Validação com Zod
│   ├── models/
│   ├── notifications/      # E-mail (Resend/Nodemailer) e WhatsApp
│   ├── schedulers/         # Jobs com node-cron
│   ├── config/
│   ├── prisma/
│   └── server.ts
├── prisma/                 # Schema do banco e migrations
├── dist/                   # Build TypeScript compilado
├── SDD/                    # Planejamento e especificações (spec-driven development)
│   ├── PRD/
│   ├── SPEC/
│   ├── PLAN/
│   ├── busca.md
│   ├── implementar.md
│   └── planejamento.md
├── Dockerfile
├── docker-entrypoint.sh
├── DEPLOY_NORTHFLANK.md
├── prisma.config.ts
└── package.json
```

## Stack Técnica

| Item        | Tecnologia                     |
|-------------|----------------------------------|
| Runtime     | Node.js ≥22 + TypeScript        |
| Framework   | Express 5                       |
| ORM         | Prisma 7 (`@prisma/adapter-pg`) |
| Banco       | PostgreSQL                      |
| Auth        | JWT (jsonwebtoken) + bcrypt     |
| Validação   | Zod                             |
| E-mail      | Resend / Nodemailer             |
| WhatsApp    | whatsapp-web.js                 |
| PDF/scraping| Puppeteer                       |
| Deploy      | Docker → Northflank             |

## Comandos

```bash
npm run dev               # Desenvolvimento (ts-node-dev)
npm run build              # Compilar TypeScript → dist/
npm start                  # Rodar build compilado
npm run seed                # Rodar seed do Prisma

npx prisma migrate dev     # Rodar migrations (dev)
npx prisma migrate deploy  # Rodar migrations (produção)
npx prisma studio          # GUI do banco de dados
npx prisma generate        # Regenerar o Prisma Client
```

## Variáveis de Ambiente (`.env`)

```
DATABASE_URL=
JWT_SECRET=
EMAIL_USER=
EMAIL_PASS=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
WHATSAPP_BUSINESS_ID=
```

## Rotas (API)

Definidas em `src/routes/`:

- `auth.routes.ts` — login/registro
- `admin.routes.ts` — endpoints administrativos
- `client.routes.ts` — endpoints de cliente
- `appointment.routes.ts` — agendamentos
- `service.routes.ts` — serviços da barbearia
- `whatsapp.routes.ts` — notificações via WhatsApp

<!-- TODO: documentar path + método de cada endpoint conforme forem estabilizando -->

## Convenções

- TypeScript estrito.
- Commits: <!-- TODO: definir padrão -->
- Branches: <!-- TODO: definir estratégia -->

## Regras para o Claude Code

- Nunca alterar o schema Prisma sem avisar explicitamente o usuário.
- Nunca commitar arquivos `.env`.
- Sempre rodar `npm run build` após mudanças, antes de testar.
- Ao criar/alterar rotas de API, atualizar a seção "Rotas" acima.
- Manter os arquivos em `SDD/` atualizados com planos e especificações.
- Mudanças que alteram o contrato da API (payload, rota, status code) afetam o frontend
  (repositório separado) — sinalizar isso explicitamente ao usuário.

## Deploy

Via Docker no Northflank — ver `DEPLOY_NORTHFLANK.md` para instruções detalhadas.

## TODO / Próximos Passos

- [ ] Documentar rotas da API (path + payload)
- [ ] Definir padrão de commits
- [ ] Definir estratégia de branches
- [ ] Adicionar testes

---
Última atualização: 2026-07-28
