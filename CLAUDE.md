CLAUDE.md — Barbearia Shelby

Arquivo de contexto para o Claude Code. Lido automaticamente ao iniciar sessões no projeto.
Atualize este arquivo conforme o projeto evolui.


Visão Geral
Barbearia Shelby é um sistema de agendamento online para barbearia.
O projeto é um monorepo com frontend em Next.js e backend em Node.js/TypeScript com Prisma.

Site: https://barbearia-shelby-frontend.vercel.app/
Contato: (51) 99817-7919 | borgeselias876@gmail.com
Endereço: Rua Esperanto, 203 – Quilombo


Estrutura do Monorepo
Barber project/
├── barbearia-backend/
│   ├── src/              # Lógica da API (rotas, controllers, services)
│   ├── prisma/           # Schema do banco e migrations
│   ├── dist/             # Build TypeScript compilado
│   ├── TASKS/            # Planejamento e especificações do projeto
│   │   ├── plan/
│   │   ├── spec/
│   │   ├── taks/
│   │   ├── plan-template.md
│   │   ├── specs-template.md
│   │   └── tasks-template.md
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   ├── DEPLOY_NORTHFLANK.md
│   ├── prisma.config.ts
│   ├── tsconfig.json
│   └── package.json
│
└── barbearia-shelby-frontend/
    ├── src/              # Componentes e páginas Next.js
    ├── public/           # Assets estáticos (logo, vídeo, imagens)
    ├── next.config.ts
    ├── next-env.d.ts
    ├── eslint.config.mjs
    ├── tsconfig.json
    └── package.json

Stack Técnica
CamadaTecnologiaFrontendNext.js + TypeScriptBackendNode.js + TypeScriptORMPrismaBanco<!-- TODO: PostgreSQL / SQLite / MySQL -->Deploy FEVercelDeploy BENorthflank (Docker)Estilo<!-- TODO: Tailwind / CSS Modules -->

Comandos
Backend
bashcd barbearia-backend

npm run dev              # Desenvolvimento
npm run build            # Compilar TypeScript → dist/

npx prisma migrate dev   # Rodar migrations (dev)
npx prisma migrate deploy # Rodar migrations (produção)
npx prisma studio        # GUI do banco de dados
npx prisma generate      # Regenerar o Prisma Client
Frontend
bashcd barbearia-shelby-frontend

npm run dev              # Desenvolvimento (http://localhost:3000)
npm run build            # Build de produção
npm run lint             # Verificar linting

Variáveis de Ambiente
Backend — .env
DATABASE_URL="postgresql://carlos:280124@localhost:5432/barbearia"
JWT_SECRET=sua_chave_secreta
EMAIL_USER=seuemail@gmail.com
EMAIL_PASS=sua_senha_de_aplicativo
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
WHATSAPP_BUSINESS_ID=


Frontend — .env.local
NEXT_PUBLIC_API_URL=http://localhost:3001

Páginas e Rotas
Frontend (Next.js)
RotaDescrição/Home com hero, sobre e contato/ServicosLista de serviços da barbearia/LoginLogin de usuário/CriarContaCadastro de usuário/agendamentoFluxo de agendamento
Backend (API)
# TODO: documentar rotas à medida que forem criadas
# Exemplo:
# POST /auth/login
# POST /auth/register
# GET  /servicos
# POST /agendamentos

Serviços Cadastrados

Sobrancelha
Corte e Barba
Máquina e Barba
Corte Máquina
Barba
Corte
Barba e Sobrancelha
Máquina + Barba
Corte e Sobrancelha


Convenções

Nomenclatura de páginas: PascalCase (/Login, /CriarConta, /Servicos)
Linguagem: TypeScript estrito em ambos os pacotes
Commits: <!-- TODO: definir padrão (ex: Conventional Commits pt-BR) -->
Branches: <!-- TODO: definir estratégia (main / dev / feature/*) -->


Regras para o Claude Code

Nunca alterar o schema Prisma sem avisar explicitamente o usuário
Nunca commitar arquivos .env ou .env.local
Sempre rodar npm run build no backend após mudanças antes de testar
Novas páginas no frontend seguem a convenção PascalCase
O deploy do backend é via Docker/Northflank — consultar DEPLOY_NORTHFLANK.md
Ao criar novas rotas de API, documentar neste arquivo na seção Backend
Manter os arquivos em TASKS/ atualizados com planos e especificações


Deploy
Frontend → Vercel

Deploy automático via push na branch principal
URL: https://barbearia-shelby-frontend.vercel.app/

Backend → Northflank

Deploy via Docker
Consultar barbearia-backend/DEPLOY_NORTHFLANK.md para instruções detalhadas


TODO / Próximos Passos

 Definir banco de dados e preencher DATABASE_URL
 Documentar rotas da API
 Definir padrão de commits
 Definir estratégia de branches
 Definir biblioteca de estilos do frontend
 Implementar autenticação (JWT)
 Implementar fluxo completo de agendamento
 Adicionar testes


Última atualização: <!-- TODO: atualizar a data a cada revisão -->