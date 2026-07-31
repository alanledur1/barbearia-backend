# PRD — Área de configurações da aplicação com acesso total restrito ao papel admin

## 1) Objetivo
- Garantir que o papel `ADMIN` tenha acesso a **todas** as páginas/rotas de configuração da
  aplicação hoje restritas apenas a `DONO` — sem remover nada do que `DONO` já acessa.
- Fecha a lacuna deixada intencionalmente pelo Epic 0 (RBAC): o papel `ADMIN` foi criado, mas
  nenhuma rota/guard de configuração foi aberta para ele além do que já usava `requireRole('DONO', 'ADMIN')`
  desde o início (ex.: `/api/admin`, `/api/clients`, `/api/auth/register`).

## 2) Escopo
**Inclui**
- Backend: trocar `requireRole('DONO')` por `requireRole('DONO', 'ADMIN')` nas rotas que hoje são
  `DONO`-only e pertencem a páginas de configuração (horário de funcionamento, feriados, CRUD de
  usuários).
- Frontend: abrir os guards de rota (`ProtectedRoute allowedUserType`) de `/barber/configuracoes`
  e `/barber/usuarios` para incluir `admin`, e exibir os respectivos links no `BarberHeader` também
  para `admin`.

**Não inclui (fora de escopo)**
- Qualquer mudança na regra de negócio do CRUD de usuários em si (ex.: `ADMIN` continua fora de
  `MANAGEABLE_ROLES` em `userService.ts` — gestão de contas `ADMIN` não faz parte deste epic, é
  decisão herdada do Epic 4).
- Novas páginas de configuração (Epic 6, 7, 8 ainda não existem — este epic só abre o que já
  existe hoje).
- Mudança de comportamento para `CLIENTE`, `BARBEIRO`, visitante ou `DONO` (regra transversal do
  roadmap: nenhum desses perde ou ganha acesso).
- Alteração de schema Prisma (nenhuma tabela/coluna nova é necessária).

## 3) Fluxo atual (como funciona hoje)
Hoje três grupos de rotas de configuração são restritos exclusivamente a `DONO`:

- `barbearia-backend/src/routes/businessHours.routes.ts:9-10` — `GET/PUT /api/business-hours`,
  `requireRole('DONO')` (Epic 2).
- `barbearia-backend/src/routes/holiday.routes.ts:9-11` — `GET/POST /api/holidays`,
  `DELETE /api/holidays/:id`, `requireRole('DONO')` (Epic 2).
- `barbearia-backend/src/routes/user.routes.ts:11-14` — `GET/POST /api/users`,
  `GET/PUT /api/users/:id`, `requireRole('DONO')` (Epic 4).

No frontend, os guards correspondentes:
- `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx:6` —
  `<ProtectedRoute allowedUserType={['dono']}>`.
- `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx:6` —
  `<ProtectedRoute allowedUserType={['dono']}>`.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx:51,56` —
  os links "Configurações" e "Usuários" só renderizam se `auth.user?.userType === 'dono'`.

O guard genérico `ProtectedRoute` (`barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx:19-20`)
já aceita uma lista de papéis (`allowedUserType: UserType | UserType[]`) e redireciona para
`/Login` se `auth.user.userType` não estiver na lista — não precisa de mudança estrutural, só dos
valores passados por cada layout.

O middleware backend `requireRole` (`barbearia-backend/src/middlewares/requireRole.middleware.ts`)
já aceita múltiplos papéis via `...roles: string[]` e retorna 403 se `req.user.role` não estiver
na lista — mesmo padrão já usado em `admin.routes.ts`, `client.routes.ts`, `service.routes.ts`,
`appointment.routes.ts` e `index.ts` (billing), todos já com `'DONO', 'ADMIN'` juntos.

`AuthContext` (`barbearia-shelby-frontend/src/context/AuthContext.tsx:7`) já define
`UserType = 'cliente' | 'barbeiro' | 'dono' | 'admin'` — o papel `admin` já é um valor válido de
usuário logado, só não está habilitado nesses dois guards específicos.

## 4) Fluxo desejado (comportamento esperado)
- Um usuário logado como `ADMIN` consegue acessar `/barber/configuracoes` e `/barber/usuarios` no
  frontend, ver os links correspondentes no `BarberHeader`, e todas as chamadas de API dessas
  páginas (`/api/business-hours`, `/api/holidays`, `/api/users`) devolvem 200 (em vez de 403).
- Um usuário logado como `DONO` continua acessando exatamente as mesmas páginas e rotas que já
  acessava (nenhuma regressão).
- Um usuário `BARBEIRO`, `CLIENTE` ou visitante continua bloqueado dessas páginas/rotas (403 no
  backend, redirect para `/Login` no frontend), exatamente como hoje.
- A regra transversal do roadmap continua válida: `/`, `/Servicos`, `/Login`, `/CriarConta`,
  `/EsqueciSenha`, `/agendamento`, `/meus-servicos` permanecem acessíveis a visitante/cliente sem
  nenhuma mudança.

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `barbearia-backend/src/routes/businessHours.routes.ts` — rotas de horário de funcionamento
  (Epic 2), hoje `requireRole('DONO')`.
- `barbearia-backend/src/routes/holiday.routes.ts` — rotas de feriados (Epic 2), hoje
  `requireRole('DONO')`.
- `barbearia-backend/src/routes/user.routes.ts` — rotas de CRUD de usuários (Epic 4), hoje
  `requireRole('DONO')`.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx` — guard da página de
  horário/feriados.
- `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx` — guard da página de CRUD de
  usuários.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx` — links
  condicionais de navegação para essas duas páginas.

### 5.2 Domínio / Regras / Serviços
- `barbearia-backend/src/middlewares/requireRole.middleware.ts` — middleware genérico
  `requireRole(...roles)`, reutilizado sem alteração.
- `barbearia-backend/src/services/userService.ts` — `MANAGEABLE_ROLES = ['CLIENTE', 'BARBEIRO', 'DONO']`
  (linha 6); `ADMIN` continua fora da lista de papéis gerenciáveis pelo CRUD — não é tocado por
  este epic (decisão herdada do Epic 4, documentada no PRD/Plan daquele epic).
- `barbearia-backend/src/controllers/businessHours.controller.ts`,
  `barbearia-backend/src/controllers/holiday.controller.ts`,
  `barbearia-backend/src/controllers/user.controller.ts` — nenhuma lógica interna checa `role`
  diretamente; dependem só do middleware de rota.

### 5.3 Persistência / Modelos / Migrações
- Nenhuma tabela/coluna nova. `User.role` (enum `UserRole`: `CLIENTE`/`BARBEIRO`/`DONO`/`ADMIN`)
  já existe desde o Epic 0. Sem migration necessária.

### 5.4 Integrações externas (clients/adapters/providers)
- N/A — feature é puramente de autorização interna.

### 5.5 UI / Componentes (se aplicável)
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` — componente
  genérico já pronto para receber `allowedUserType={['dono', 'admin']}`, sem alteração estrutural.
- `barbearia-shelby-frontend/src/context/AuthContext.tsx` — `UserType` já inclui `'admin'`.

### 5.6 Testes / Fixtures (se existirem)
- Não há testes automatizados (Jest/Cypress) cobrindo `ProtectedRoute`, `BarberHeader` ou as
  rotas de configuração hoje. Validação é via build + E2E manual/browser, como nos epics
  anteriores (0, 1, 2, 4).

## 6) Padrões existentes para reuso (evitar duplicação)
- `barbearia-backend/src/routes/admin.routes.ts:14-17` e
  `barbearia-backend/src/routes/client.routes.ts:26,31` — já usam
  `requireRole('DONO', 'ADMIN')`, exatamente o padrão a replicar nas 3 rotas identificadas.
- `barbearia-shelby-frontend/src/app/barber/layout.tsx:6` — já usa
  `allowedUserType={['barbeiro', 'dono', 'admin']}`, confirma o padrão de lista de papéis a
  replicar.

## 7) Documentação externa (via Context7)
Não aplicável — mudança é de configuração de autorização usando primitivas já existentes no
próprio codebase (middleware Express custom e componente React custom), sem uso de API nova de
biblioteca/framework.

## 8) Impactos prováveis (áreas afetadas)
- Backend: `businessHours.routes.ts`, `holiday.routes.ts`, `user.routes.ts` (só a lista de papéis
  passada a `requireRole`).
- Frontend: `barber/configuracoes/layout.tsx`, `barber/usuarios/layout.tsx`,
  `BarberDashboard/BarberHeader.tsx`.

## 9) Critérios de aceitação
- [ ] `ADMIN` autenticado acessa `/barber/configuracoes` e vê/edita horário de funcionamento e
      feriados normalmente (200 nas chamadas de API).
- [ ] `ADMIN` autenticado acessa `/barber/usuarios` e realiza o CRUD de usuários normalmente (200
      nas chamadas de API).
- [ ] `ADMIN` vê os links "Configurações" e "Usuários" no `BarberHeader`.
- [ ] `DONO` continua acessando ambas as páginas e rotas sem nenhuma mudança de comportamento.
- [ ] `BARBEIRO` e `CLIENTE` continuam recebendo 403 (API) e redirect para `/Login` (frontend) ao
      tentar acessar essas páginas/rotas.
- [ ] Visitante (não logado) e cliente continuam acessando exatamente `/`, `/Servicos`, `/Login`,
      `/CriarConta`, `/EsqueciSenha`, `/agendamento`, `/meus-servicos` sem mudança.

## 10) Open Questions (bloqueios / dúvidas)
Nenhuma. Todas as decisões estão evidenciadas diretamente no codebase: as 3 rotas backend
`DONO`-only e os 2 guards frontend `DONO`-only foram localizados com certeza, e o padrão de
"abrir para `DONO, ADMIN`" já existe em outras rotas do próprio repo (Seção 6) — não há ambiguidade
de modelagem a resolver.
