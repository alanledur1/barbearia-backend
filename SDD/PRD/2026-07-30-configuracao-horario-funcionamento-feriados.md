# PRD — Configuração de horário de funcionamento e CRUD de feriados com bloqueio de agendamento nas datas configuradas

## 1) Objetivo
- Permitir que o dono da barbearia configure o horário de funcionamento (por dia da semana) via uma nova página de configurações, substituindo o horário hardcoded (9h–20h, fuso BRT fixo, igual todo dia) hoje embutido em `validateBusinessHours`.
- Permitir que o dono cadastre/exclua feriados/bloqueios (datas específicas) que passam a impedir a criação de novos agendamentos nessas datas.
- Hoje não existe nenhuma forma de o dono ajustar o horário de atendimento sem alterar código e fazer novo deploy; e não existe nenhum conceito de feriado — um agendamento pode ser criado em qualquer data (ex.: Natal, Ano Novo) desde que dentro de 9h–20h.

## 2) Escopo
**Inclui**
- Novas tabelas Prisma: `BusinessHours` (1 linha por dia da semana, com horário de abertura/fechamento e flag "fechado") e `Holiday` (datas bloqueadas, com motivo opcional).
- Substituição de `validateBusinessHours` (hoje hardcoded, `appointmentService.ts:31-50`) por uma versão que consulta `BusinessHours` no banco, mantendo o comportamento atual como valor padrão (seed).
- Nova checagem de feriado: `createAppointment` (e `update`, quando reagenda) passam a rejeitar agendamento cuja data caia em uma linha de `Holiday`.
- Endpoints CRUD novos no backend para `BusinessHours` (leitura + atualização em lote das 7 linhas) e `Holiday` (listar, criar, excluir), restritos ao papel `DONO` (autenticado).
- Nova página de configurações no frontend (`/barber/configuracoes` ou equivalente dentro da área `/barber`), visível e acessível **apenas** para o papel `dono`, com formulário de horário de funcionamento por dia da semana e uma lista/CRUD simples de feriados.
- Link de acesso à nova página a partir da área logada do dono (ex.: `BarberHeader`), visível somente quando `user.userType === 'dono'`.

**Não inclui (fora de escopo)**
- Qualquer mudança no fluxo público de agendamento (`/agendamento`, `agendamento/page.tsx`): a geração de horários (`generateTimeSlotsForDate`) e o `DayPicker` continuam com as regras hardcoded atuais (ver seção 3, Frontend) e **não** passam a consultar `BusinessHours`/`Holiday`. Isso é uma decisão de escopo explícita (ver Decision Log no Plan), não um bug a corrigir aqui — o roadmap já prevê uma dependência futura de Epic 1/3 nesse sentido, mas o pedido desta execução restringe as "Superfícies tocadas" a `schema.prisma`, `appointmentService.ts` e a nova página de configurações.
- Horário de funcionamento por barbeiro individual (a tabela é global à barbearia, não por `adminId`).
- Feriados recorrentes (ex.: repetir todo 25/12 automaticamente) — cada feriado é uma data literal cadastrada manualmente.
- Acesso de `ADMIN` à página de configurações (fica para Epic 5, conforme `ROADMAP_V2.md`).
- CRUD de usuários, agenda diária, dashboards, planos (Epics 3/4/6/8) — inalterados.
- Qualquer mudança em `POST /api/appointments` além da nova validação de feriado (o contrato de payload não muda).

## 3) Fluxo atual (como funciona hoje)

### Backend
- `validateBusinessHours(start: Date, durationMinutes: number)` ([appointmentService.ts:31-50](../../src/services/appointmentService.ts)) é um método **síncrono**, sem acesso a banco: hardcode `businessOpenHour = 9`, `businessCloseHour = 20`, converte UTC→BRT subtraindo 3 horas (`getUTCHours() - 3 + 24) % 24`) e lança `CustomError(..., 400)` se o início for antes das 9h BRT ou o fim depois das 20h BRT. Não diferencia dia da semana, não sabe de feriado.
- É chamado em dois pontos: `createAppointment` ([appointmentService.ts:158](../../src/services/appointmentService.ts)) e `update` (reagendamento, [appointmentService.ts:253](../../src/services/appointmentService.ts)).
- Não existe nenhuma tabela nem checagem de feriado — `createAppointment` só valida: data no futuro, serviço existe, horário dentro do expediente, profissional válido, disponibilidade (sem sobreposição) do barbeiro.
- Não existe nenhuma rota/controller/service para horário de funcionamento ou feriados hoje.

### Frontend
- `agendamento/page.tsx::generateTimeSlotsForDate` ([page.tsx:69-153](../../../barbearia-shelby-frontend/src/app/agendamento/page.tsx)) gera os horários **inteiramente no client**, com regras hardcoded e **independentes** do backend: lista fixa `09:00`...`19:30` (com intervalo de almoço 12:00–13:00 embutido na própria lista), e regras extras por dia da semana (`date.getDay()`):
  - Sábado (`day === 6`): só até `16:30`.
  - Demais dias exceto sexta e sábado (`day !== 5`, ou seja domingo/segunda/terça/quarta/quinta): só a partir de `13:00`.
  - Sexta (`day === 5`): lista completa, sem filtro extra.
  - O `DayPicker` ([page.tsx:359-368](../../../barbearia-shelby-frontend/src/app/agendamento/page.tsx)) já desabilita domingo e segunda (`dayOfWeek: [0, 1]`) e datas passadas — mas isso é uma regra de UI solta, não vem de nenhuma configuração de backend.
  - Essa lógica é **totalmente separada** de `validateBusinessHours` no backend (que só limita 9h–20h) — ou seja, hoje já existem duas fontes de verdade divergentes para "horário de funcionamento" (uma no backend simples, uma no frontend rica por dia da semana). Este PRD documenta esse fato; a decisão de não unificá-las nesta execução está registrada em "Escopo".
- Não existe nenhuma UI de feriados nem de configuração de horário.
- `/barber` ([layout.tsx](../../../barbearia-shelby-frontend/src/app/barber/layout.tsx)) é protegido por `ProtectedRoute` com `allowedUserType={['barbeiro', 'dono', 'admin']}` — qualquer subpágina nova sob `/barber` herda esse guard de primeiro nível; uma restrição adicional a `dono` precisa de outro `ProtectedRoute`/checagem (com `allowedUserType={['dono']}`) na própria subpágina ou em um layout aninhado.
- `BarberHeader` ([BarberHeader.tsx](../../../barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx)) tem botões de navegação (`Novo Agendamento`, `Faturamento`) usando `next/link` — padrão a seguir para o novo link de configurações.

## 4) Fluxo desejado (comportamento esperado)
- Dono acessa uma nova página de configurações (dentro da área logada, só visível/acessível para o papel `dono`) e vê um formulário com os 7 dias da semana, cada um com horário de abertura, horário de fechamento e um toggle "fechado neste dia". Salva as alterações.
- Na mesma página (ou seção irmã), o dono vê a lista de feriados/bloqueios cadastrados, pode adicionar um novo (data + motivo opcional) e remover um existente.
- A partir da configuração salva, `validateBusinessHours` no backend passa a usar os valores do dia da semana correspondente (em vez do hardcode 9h–20h fixo) para qualquer criação/reagendamento de agendamento — em qualquer fluxo de entrada (`POST /appointments`, `PATCH /appointments/:id`), independentemente de o cliente ser visitante, cliente logado ou staff.
- Se a data (convertida para o dia BRT) coincidir com uma linha em `Holiday`, a criação/reagendamento do agendamento é rejeitada com uma mensagem clara (ex.: "A barbearia está fechada nesta data (feriado)."), com o mesmo padrão de erro (`CustomError`, 400) já usado pelas outras validações de `appointmentService.ts`.
- Comportamento por padrão (seed/estado inicial, sem nenhuma configuração manual do dono): idêntico ao atual — 9h–20h todos os dias, nenhum feriado cadastrado. Isso evita qualquer regressão até o dono efetivamente configurar algo.

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `barbearia-backend/src/routes/index.ts` — registra os `Router` de cada área (`/api/clients`, `/api/services`, `/api/appointments`, `/api/admin`, `/api/billing/summary`); é onde uma nova rota `/api/business-hours` e/ou `/api/holidays` precisaria ser montada.
- `barbearia-backend/src/routes/admin.routes.ts` + `admin.controller.ts` — melhor precedente de rota **restrita a staff** (`authMiddleware` + `requireRole('DONO','ADMIN')`) para modelar a nova rota (aqui restrita só a `DONO`).
- `barbearia-backend/src/routes/service.routes.ts` + `service.controller.ts` — precedente de CRUD simples (create/list/getById/update/delete) ligado a um `*Service` dedicado.
- `barbearia-shelby-frontend/src/app/barber/layout.tsx` — guarda de rota de primeiro nível da área `/barber` (`ProtectedRoute allowedUserType={['barbeiro','dono','admin']}`); a nova página de configurações precisa de guarda adicional restrita a `['dono']`.

### 5.2 Domínio / Regras / Serviços
- `barbearia-backend/src/services/appointmentService.ts` — `validateBusinessHours` (linhas 31-50, ponto central a substituir), chamada em `createAppointment` (linha 158) e `update` (linha 253).
- `barbearia-backend/src/services/serviceService.ts` — padrão de serviço simples (`create`/`listAll`/`findById`/`update`/`delete`) usando `prisma.service.*` diretamente, sem camada extra — modelo a espelhar para um novo `BusinessHoursService`/`HolidayService`.
- `barbearia-backend/src/middlewares/requireRole.middleware.ts` — `requireRole(...roles: string[])`, já usado com `'DONO'` isoladamente em nenhum lugar hoje (sempre em conjunto com `'ADMIN'`), mas a assinatura suporta `requireRole('DONO')` diretamente.
- `barbearia-backend/src/utils/customErrors.ts` — `CustomError(message, statusCode, details?)`, padrão de erro de negócio já usado em `appointmentService.ts` e `serviceService.ts`.

### 5.3 Persistência / Modelos / Migrações
- `barbearia-backend/prisma/schema.prisma` — schema atual tem `User` (com `role: UserRole`), `Service`, `Appointment`, `AppointmentStatus`, `Otp`. Não existe nenhuma tabela relacionada a horário/feriado.
- Datasource é PostgreSQL; `generator client` usa `prisma-client-js`. Client instanciado via adapter (`barbearia-backend/src/prisma/db.ts`, `PrismaPg` sobre `pg.Pool`) e reexportado em `barbearia-backend/src/services/prisma.service.ts` (usado por todos os `*Service` — `appointmentService.ts` importa `{ prisma }` de lá).
- **Migrations**: projeto usa **Prisma 7** (`npx prisma migrate dev` / `npx prisma migrate deploy`), não Flask-Migrate. Histórico em `barbearia-backend/prisma/migrations/`: `20250927174921_init`, `20251019183810_update_schema`, `20251125005315_create_only`, `20260512222028_add_otp_table`, `20260730002447_rbac_user_unification` (mais recente, do Epic 0). A pasta `migrations/` está versionada no git (o bug de `.gitignore` que a excluía foi corrigido no Epic 0). Duas tabelas novas (`BusinessHours`, `Holiday`) são estritamente aditivas — não alteram nem removem colunas/tabelas existentes, portanto não há risco de `DROP`/`NOT NULL` destrutivo esperado.
- `barbearia-backend/src/prisma/seed.ts` — hoje só cria 3 usuários (`DONO`, `ADMIN`, `BARBEIRO`) via `prisma.user.upsert`. É o lugar natural para popular as 7 linhas padrão de `BusinessHours` (9h–20h, todo dia, `isClosed=false`) mantendo o comportamento atual como default. Roda via `npm run seed` (`ts-node src/prisma/seed.ts`); **não** roda automaticamente no deploy (`npm run deploy` só faz `migrate` + `build`, conforme `DEPLOY_NORTHFLANK.md:104`).

### 5.4 Integrações externas (clients/adapters/providers)
- Nenhuma integração externa nova. Sem WhatsApp/e-mail/Puppeteer envolvidos nesta feature.

### 5.5 UI / Componentes (se aplicável)
- `barbearia-shelby-frontend/src/app/barber/billing/page.tsx` + `BillingDashboard.tsx` + `Billing.module.scss` — melhor precedente de "nova subpágina dentro de `/barber`" com layout simples de cards/tabela, a espelhar para a página de configurações.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/EditServiceModel.tsx` + `EditServiceModal.module.scss` — precedente de formulário controlado simples (inputs + submit) para editar uma entidade, reaproveitável como referência de estilo para o form de horário/feriado.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx` — local onde adicionar o link/botão para a nova página (`next/link`), condicionado a `auth.user?.userType === 'dono'`.
- `barbearia-shelby-frontend/src/context/AuthContext.tsx` — `useAuth()` expõe `user.userType` (`'cliente' | 'barbeiro' | 'dono' | 'admin'`) e `token`, usados tanto para o guard de rota quanto para o header `Authorization: Bearer` nas chamadas à nova API.
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` — componente de guarda de rota (`allowedUserType`), a reusar com `['dono']` para a nova página.
- `barbearia-shelby-frontend/src/services/api.ts` — client axios único (`baseURL = NEXT_PUBLIC_API_URL + /api`), padrão de todas as chamadas.

### 5.6 Testes / Fixtures (se existirem)
- Não há testes automatizados hoje para agendamento, serviços ou admin em nenhum dos dois repositórios (confirmado também no PRD do Epic 1 — nenhum `*.test.ts`/`*.spec.ts`/`*.cy.*` encontrado). Validação desta feature dependerá de build/lint limpos + walkthrough manual no navegador, como no Epic 1.

## 6) Padrões existentes para reuso (evitar duplicação)
- `barbearia-backend/src/services/serviceService.ts` — padrão de `*Service` fino sobre `prisma.<model>.*`, sem camada de repositório adicional; seguir o mesmo estilo para `BusinessHoursService`/`HolidayService`.
- `barbearia-backend/src/controllers/service.controller.ts` + `service.routes.ts` — padrão de rota com leitura pública e mutação restrita por `requireRole`; aqui adaptado para leitura **também** restrita (não há necessidade de leitura pública, pois a única consumidora é a página de configurações autenticada).
- `barbearia-backend/src/utils/customErrors.ts::CustomError` — reusar para "feriado" e "fora do horário configurado", mantendo o mesmo formato de erro (`{ error: message }`, status 400) que o frontend já sabe exibir (`err.response?.data?.error`, ver `useBarberData.tsx` e `agendamento/page.tsx`).
- `barbearia-shelby-frontend/src/hooks/useBarberData.tsx` — padrão de hook com `getHeaders()` (`Authorization: Bearer <token>`), `fetchAll`, tratamento de erro via `err.response?.data?.error`; um novo hook (ex.: `useBusinessSettings`) deve seguir o mesmo padrão em vez de duplicar lógica de header/erro.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/EditServiceModal.module.scss` e `Billing.module.scss` — padrões visuais (inputs, botões, cards, tabela) já usados na área `/barber`, a reaproveitar em vez de criar um novo design system para a página de configurações.

## 7) Documentação externa (via Context7)
Feature é composta por: (a) duas tabelas Prisma simples + queries `findMany`/`upsert`/`create`/`delete` já usadas nos mesmos moldes em `appointmentService.ts`/`serviceService.ts`; (b) rotas Express seguindo o padrão idêntico já em uso (`Router`, `authMiddleware`, `requireRole`); (c) formulário React controlado com `useState`, igual ao já usado em `EditServiceModel.tsx`. Nenhuma API nova de biblioteca é introduzida (mesmas versões de Prisma 7, Express 5, React 19 já em uso). Não foram identificadas necessidades de consulta ao Context7 para esta feature.

### Consultas realizadas
Nenhuma consulta ao Context7 foi necessária — mesma justificativa do PRD do Epic 1: toda a implementação reusa APIs (Prisma `where`/`upsert`/`findMany`, Express `Router`, React `useState`) já utilizadas de forma idêntica em outros pontos do mesmo repositório.

### Trechos relevantes
- N/A.

## 8) Impactos prováveis (áreas afetadas)
- **Backend — schema**: duas tabelas novas (`BusinessHours`, `Holiday`) em `prisma/schema.prisma` + migration Prisma aditiva.
- **Backend — regra de negócio**: `validateBusinessHours` deixa de ser hardcoded e síncrono, passa a consultar `BusinessHours` (torna-se `async`); os dois call sites (`createAppointment`, `update`) precisam de `await`. Nova validação de feriado inserida no mesmo fluxo (mesmo padrão de `CustomError`).
- **Backend — API nova**: rotas/controllers/services novos para `BusinessHours` (leitura + atualização em lote) e `Holiday` (listar/criar/excluir), montados em `routes/index.ts`, restritos a `requireRole('DONO')`.
- **Backend — seed**: `prisma/seed.ts` ganha upsert das 7 linhas padrão de `BusinessHours` (preserva o comportamento atual como default).
- **Frontend — nova página**: nova rota sob `/barber` (ex.: `/barber/configuracoes`) com guarda `dono`-only, formulário de horário por dia da semana e CRUD simples de feriados.
- **Frontend — navegação**: `BarberHeader.tsx` ganha um link condicional (`dono`) para a nova página.
- **Contrato de API**: adição pura de rotas novas (`/api/business-hours`, `/api/holidays`) — não altera nenhum endpoint/payload existente. Sem breaking change para o frontend atual. A sinalizar ao usuário mesmo assim, por ser rota nova entre os dois repos (regra do `CLAUDE.md` raiz).

## 9) Critérios de aceitação
- [ ] Dono autenticado consegue acessar uma página de configurações (inacessível a cliente, barbeiro e visitante) e visualizar o horário de funcionamento atual por dia da semana.
- [ ] Dono consegue alterar o horário de abertura/fechamento de um ou mais dias da semana, e/ou marcar um dia como fechado, e salvar.
- [ ] Após salvar, uma tentativa de agendamento (via API) fora do novo horário configurado para aquele dia da semana é rejeitada com mensagem clara (400).
- [ ] Uma tentativa de agendamento (via API) dentro do novo horário configurado é aceita normalmente (sem regressão).
- [ ] Dono consegue cadastrar um feriado (data específica) e ele aparece na lista.
- [ ] Uma tentativa de agendamento (via API) numa data cadastrada como feriado é rejeitada com mensagem clara (400).
- [ ] Dono consegue remover um feriado cadastrado, e agendamentos voltam a ser aceitos normalmente nessa data.
- [ ] Sem nenhuma configuração manual do dono (estado inicial/seed), o comportamento é idêntico ao atual: 9h–20h todos os dias, nenhum feriado — sem regressão para quem já usa o sistema hoje.
- [ ] Regra transversal do `ROADMAP_V2.md`: visitante e cliente continuam acessando exatamente as páginas já existentes (`/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`, `/meus-servicos`) sem restrição nova; o fluxo de agendamento em si (wizard) não é alterado por esta feature.
- [ ] Barbeiro e admin (logados) não conseguem acessar a nova página de configurações (só dono, conforme escopo desta execução).

## 10) Open Questions (bloqueios / dúvidas)
Nenhuma. As decisões táticas necessárias (modelagem de `BusinessHours`/`Holiday`, papel restrito a `DONO`, não integração com o wizard de `/agendamento` nesta execução) estão resolvidas por evidência do codebase e pelo escopo explícito desta execução ("Superfícies tocadas"), e serão formalizadas como Decision Log na Fase 2 (planejamento).
