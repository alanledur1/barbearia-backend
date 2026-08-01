# Página de agenda diária estilo Google Calendar/Outlook consumindo agendamentos, horário de funcionamento e feriados — Implementation Plan

## Overview
Hoje não existe nenhuma visão de calendário dos agendamentos — `/barber` (`BarberDashboard.tsx`)
mostra uma lista plana (paginada) de todos os agendamentos, sem noção visual de horário do dia,
ocupação, horário de funcionamento ou feriados. Vamos adicionar uma nova página `/barber/agenda`
(mesmo público de `/barber`: barbeiro, dono, admin) com um grid vertical de horas para um único
dia, blocos de agendamento posicionados pelo horário/duração reais, navegação entre dias e um
seletor de barbeiro. O grid usa `BusinessHours`/`Holiday` (já existentes desde o Epic 2) para
sombrear período fora do expediente e sinalizar dias fechados. Como `BARBEIRO` hoje não consegue
ler `GET /business-hours`/`GET /holidays` (restritas a `DONO`/`ADMIN` desde o Epic 5), essas duas
rotas de **leitura** passam a aceitar também `BARBEIRO` — as rotas de escrita
(`PUT`/`POST`/`DELETE`) continuam `DONO`/`ADMIN`-only, sem mudança de regra de negócio. Nenhum
endpoint novo é necessário no backend: `GET /appointments?date=` (já suportado por
`AppointmentService.listAll`) e `GET /appointments/barbers` (já público) cobrem o que a tela
precisa; a filtragem por barbeiro selecionado é feita no cliente.

## Scope
### In Scope
- Backend: `GET /api/business-hours` e `GET /api/holidays` passam a aceitar o papel `BARBEIRO`
  (além de `DONO`/`ADMIN`, que já tinham acesso desde o Epic 5).
- Frontend: nova página `/barber/agenda` — grid diário de horas, blocos de agendamento coloridos
  por status, navegação anterior/próximo/hoje/data específica, seletor de barbeiro, painel de
  detalhes somente leitura ao clicar num bloco.
- Frontend: novo hook `useDailyAgenda.tsx` (barbeiros, horário de funcionamento, feriados,
  agendamentos do dia).
- Frontend: novo link "Agenda" no `BarberHeader.tsx`, visível para os 3 papéis (barbeiro, dono,
  admin) — mesmo público da página, sem restrição adicional.

### Out of Scope
- Criar, editar, concluir, cancelar ou excluir agendamento a partir da agenda — essas ações
  continuam exclusivas de `BarberDashboard`/`AppointmentCard`, que não são alterados. O clique num
  bloco da agenda abre um painel **somente leitura**.
- Visão semanal/mensal do calendário — só diária, conforme o epic.
- Qualquer mudança em `PUT /business-hours`, `POST/DELETE /holidays`, `AppointmentService`
  (`validateBusinessHours`/`validateNotHoliday`/`checkAvailability`/`createAppointment`) ou no
  wizard público `/agendamento` (`generateTimeSlotsForDate`) — decisão de escopo do Epic 2
  reafirmada aqui.
- Novo endpoint de leitura agregada no backend — o formato atual (`GET /appointments?date=` +
  `GET /appointments/barbers`) é suficiente; filtragem por barbeiro é client-side.
- Qualquer alteração de `prisma/schema.prisma` — todos os dados necessários já existem.

## Current State (from codebase)
- `barbearia-backend/src/routes/appointment.routes.ts:12` — `GET /` (`listAll`) exige só
  `authMiddleware` (sem `requireRole`) — qualquer papel autenticado, inclusive `BARBEIRO`, já pode
  listar agendamentos. `AppointmentService.listAll` (`appointmentService.ts:135-168`) aceita filtro
  `date` (string `YYYY-MM-DD`, comparado por dia UTC) e já inclui `admin: {id, name, email}` no
  `select` de cada resultado — não filtra por `adminId` (isso fica a cargo do cliente).
- `barbearia-backend/src/routes/appointment.routes.ts:14` — `GET /barbers` é pública (sem
  `authMiddleware`), retorna `{id, name}[]` de todos `User{role:'BARBEIRO'}`
  (`listBookableBarbers()`, `appointmentService.ts:107-113`).
- `barbearia-backend/src/routes/businessHours.routes.ts:9-10` e
  `barbearia-backend/src/routes/holiday.routes.ts:9-11` — hoje `GET`/`PUT`/`POST`/`DELETE` exigem
  `requireRole('DONO','ADMIN')`. `BARBEIRO` recebe `403` em todas. Este plan muda só os dois `GET`
  para incluir `BARBEIRO`.
- `barbearia-backend/src/services/businessHoursService.ts::listAll` /
  `barbearia-backend/src/services/holidayService.ts::listAll` — sem lógica de autorização própria
  (a autorização é só na rota); não precisam de nenhuma mudança.
- `barbearia-backend/prisma/schema.prisma` — `Appointment.date`/`endDate` são `DateTime` (instante
  UTC, armazenando o horário BRT convertido via `fromZonedTime` no controller de criação);
  `BusinessHours.dayOfWeek` (0-6), `openTime`/`closeTime` (`"HH:mm"`), `isClosed`; `Holiday.date`
  (`@db.Date`, único). Nenhuma migration necessária.
- `barbearia-shelby-frontend/src/app/barber/layout.tsx` — guard atual de todo `/barber/*`:
  `ProtectedRoute allowedUserType={['barbeiro','dono','admin']}`. A nova página tem exatamente
  esse público — **não precisa de `layout.tsx` aninhado próprio** (diferente de
  `configuracoes`/`usuarios`/`metricas`, que restringem a um subconjunto de `/barber`).
- `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` e
  `barbearia-shelby-frontend/src/hooks/useBarberMetrics.tsx` — padrão de hook a seguir
  (`getHeaders()` via `useAuth().token`, `api.get(..., {headers})`, `loading`/`error` com
  `extractErrorMessage`).
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx:69-153`
  (`generateTimeSlotsForDate`) — mostra o padrão já usado para cruzar disponibilidade com uma
  data; a agenda **não** reaproveita essa função (usa `BusinessHours`/`Holiday` reais, não slots
  hardcoded), mas reaproveita o formato de data `date.toISOString().split('T')[0]` só como
  referência — a agenda usa construção local (`getFullYear/getMonth/getDate`) para a data
  selecionada, evitando o deslocamento de fuso do `toISOString()` na navegação entre dias (ver
  Spec, `useDailyAgenda`/`page.tsx`).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/AppointmentCard.tsx` e
  `styles.module.scss:5-14,140-159` — paleta/nomenclatura de status a reaproveitar
  (`$confirmed-color:#0d6efd`, `$success-color:#28a745` p/ `COMPLETED`,
  `$cancelled-color:#dc3545`, `$brand-color:#f67366`, `$card-bg:#1e1e1e`).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx:44-67` —
  local dos links de navegação; "Novo Agendamento"/"Faturamento" são visíveis a todos os 3 papéis
  (sem condicional), diferente de "Métricas"/"Configurações"/"Usuários" (condicionados a
  `dono`/`admin`). O link "Agenda" segue o primeiro padrão (sem condicional).
- Não existe `.interface-design/system.md` neste repositório — confirmado via busca; a instrução
  do `implementar.md` de consultá-lo antes de UI não se aplica.
- Não há suíte Jest/Cypress cobrindo `/barber` ou agendamentos hoje (`npm test` não encontra
  suítes, confirmado nos epics 5/6/7).

## Desired End State
- Barbeiro, dono ou admin logado, ao acessar `/barber/agenda` (ou clicar em "Agenda" no header),
  vê um grid vertical do dia atual com as horas do expediente configurado, um seletor de barbeiro
  (barbeiro logado começa com si mesmo selecionado) e agendamentos do dia daquele barbeiro como
  blocos posicionados pelo horário/duração reais, coloridos por status.
- Trocar de dia (anterior/próximo/hoje/data específica) ou de barbeiro atualiza os blocos exibidos
  sem recarregar a página inteira.
- Período fora do expediente aparece visualmente sombreado; um dia marcado `isClosed` ou presente
  em `Holiday` mostra um aviso de "fechado" (sem impedir a visualização de agendamentos legados
  que porventura existam nessa data).
- Clicar num bloco abre um painel com os detalhes do agendamento (cliente/convidado, serviço,
  horário, status, notas), sem nenhuma ação de edição/cancelamento disponível nessa tela.
- `GET /api/business-hours` e `GET /api/holidays` respondem `200` para `BARBEIRO` (antes `403`);
  `PUT /business-hours`, `POST/DELETE /holidays` continuam rejeitando `BARBEIRO` com `403`.
- Cliente logado e visitante não conseguem acessar `/barber/agenda` (redirecionados para
  `/Login`, mesmo comportamento do guard de `/barber` hoje).
- As 7 rotas públicas da regra transversal do roadmap (`/`, `/Servicos`, `/Login`, `/CriarConta`,
  `/EsqueciSenha`, `/agendamento`, `/meus-servicos`) continuam acessíveis a visitante/cliente sem
  mudança.

## References
- PRD: `barbearia-backend/SDD/PRD/2026-07-31-agenda-diaria-calendario.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-07-31-agenda-diaria-calendario.md`
- Key code references:
  - `barbearia-backend/src/routes/businessHours.routes.ts:9` — rota `GET` a expandir.
  - `barbearia-backend/src/routes/holiday.routes.ts:9` — rota `GET` a expandir.
  - `barbearia-backend/src/services/appointmentService.ts:135` — `listAll` (filtro `date`
    reutilizado sem alteração).
  - `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` — padrão de hook de referência.
  - `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx` — onde
    adicionar o novo link.
  - `barbearia-shelby-frontend/src/app/barber/configuracoes/page.tsx` — padrão de página nova sob
    `/barber` sem layout próprio.

---

## Phase 1: Backend — leitura de horário de funcionamento e feriados liberada para barbeiro

### Tasks
- [x] Em `barbearia-backend/src/routes/businessHours.routes.ts`, alterar a linha da rota `GET /`
      de `requireRole('DONO', 'ADMIN')` para `requireRole('BARBEIRO', 'DONO', 'ADMIN')`. A rota
      `PUT /` permanece `requireRole('DONO', 'ADMIN')`, inalterada.
- [x] Em `barbearia-backend/src/routes/holiday.routes.ts`, alterar a linha da rota `GET /` de
      `requireRole('DONO', 'ADMIN')` para `requireRole('BARBEIRO', 'DONO', 'ADMIN')`. As rotas
      `POST /` e `DELETE /:id` permanecem `requireRole('DONO', 'ADMIN')`, inalteradas.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — compila sem erros de TypeScript.
- [x] Validação funcional via API real (script/cURL, sessão local com `npm run dev`, token dos 4
      papéis via `POST /api/login`): `BARBEIRO`, `DONO` e `ADMIN` recebem `200` em
      `GET /business-hours` e `GET /holidays`; `CLIENTE` e sem token recebem `403`/`401`.
- [x] `PUT /business-hours`, `POST /holidays` e `DELETE /holidays/:id` continuam recebendo `403`
      para `BARBEIRO` (regressão zero nas rotas de escrita).

#### Manual Verification
- [x] Nenhuma pendente além da verificação automatizada acima — mudança é puramente de lista de
      papéis em rotas já existentes, sem novo fluxo de UI nesta fase.

---

## Phase 2: Frontend — hook, grid de agenda diária e navegação

### Tasks
- [x] Criar `barbearia-shelby-frontend/src/hooks/useDailyAgenda.tsx`: busca `barbers`
      (`GET /appointments/barbers`, sem header), `businessHours` (`GET /business-hours`, com
      header, mesclado com os 7 dias default como em `useBusinessSettings`) e `holidays`
      (`GET /holidays`, com header) uma vez; busca `appointments` (`GET /appointments?date=`,
      com header) toda vez que `dateKey` (parâmetro do hook) muda. Expõe
      `{ barbers, businessHours, holidays, appointments, loading, error, refetch }`.
- [x] Criar `barbearia-shelby-frontend/src/app/barber/agenda/page.tsx`: `'use client'`; estado
      `dateKey` (string `YYYY-MM-DD`, construído a partir de campos locais de `Date`, não de
      `toISOString()`) inicializado em hoje; estado `selectedBarberId`; navegação
      anterior/próximo/hoje (aritmética local de dias) + `<input type="date">` para pulo direto;
      `<select>` de barbeiro (populado por `barbers` do hook, pré-selecionando o próprio usuário
      se `auth.user?.userType === 'barbeiro'`); filtra `appointments` do hook pelo
      `admin.id === selectedBarberId` e repassa para `AgendaGrid`.
- [x] Criar `barbearia-shelby-frontend/src/app/barber/agenda/AgendaGrid.tsx`: componente
      apresentacional — recebe o dia da semana selecionado, a entrada de `BusinessHours`
      correspondente, se a data é feriado, e a lista de agendamentos já filtrada por barbeiro;
      desenha o grid de horas (linhas de hora, área fora do expediente sombreada, banner de
      "fechado" quando `isClosed`/feriado) e os blocos de agendamento posicionados por
      horário/duração reais, coloridos por status; clique num bloco abre/fecha um painel de
      detalhes somente leitura (sem ações de mutação).
- [x] Criar `barbearia-shelby-frontend/src/app/barber/agenda/Agenda.module.scss`, reaproveitando
      os tokens de cor de `BarberDashboard/styles.module.scss`
      (`$brand-color:#f67366; $card-bg:#1e1e1e; $border-color:#3a3a3a; $text-color:#f0f0f0;
      $text-muted:#a0a0a0; $confirmed-color:#0d6efd; $success-color:#28a745;
      $cancelled-color:#dc3545`).
- [x] Em `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`,
      adicionar `<Link href="/barber/agenda">` com botão "Agenda", visível para os 3 papéis (sem
      condicional, mesmo padrão de "Novo Agendamento"/"Faturamento"), posicionado antes desses
      dois links.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-shelby-frontend && npm run build` — build de produção limpo.
- [x] `npx eslint src` — limpo (equivalente ao `npm run lint`, quebrado no Next 16
      independentemente desta mudança, achado já documentado nos epics anteriores).
- [x] `npm test` — sem suítes Jest relevantes no projeto hoje (esperado "No tests found", mesmo
      comportamento dos epics anteriores).

#### Manual Verification
- [x] Login como `barbeiro`: acessar `/barber/agenda` via link no header; confirmar que o próprio
      usuário aparece pré-selecionado no seletor de barbeiro e que os agendamentos do dia atual
      aparecem como blocos no horário correto.
- [x] Login como `dono`/`admin`: confirmar acesso, troca de barbeiro no seletor atualizando os
      blocos exibidos.
- [x] Navegar para o dia anterior/seguinte e confirmar que os agendamentos exibidos mudam de
      acordo (criar/usar agendamentos de teste em datas distintas para confirmar visualmente).
- [x] Configurar (via `/barber/configuracoes`, dono) um dia da semana como fechado (`isClosed`) ou
      cadastrar um feriado na data visualizada e confirmar que a agenda mostra o aviso de
      "fechado" nessa data.
- [x] Confirmar que o período fora do expediente configurado aparece sombreado/distinto do
      período de expediente.
- [x] Clicar num bloco de agendamento e confirmar que o painel de detalhes mostra
      cliente/serviço/horário/status/notas corretos, sem nenhum botão de ação (editar/cancelar).
- [x] Login como `cliente` e sem login (visitante): confirmar que `/barber/agenda` redireciona
      para `/Login` (mesmo comportamento de todo `/barber/*` hoje) e que o link "Agenda" não
      aparece renderizado fora do contexto autorizado (a página inteira é protegida pelo guard
      existente de `barber/layout.tsx`).
- [x] Confirmar que `/barber` (dashboard), `/barber/billing`, `/barber/configuracoes`,
      `/barber/usuarios`, `/barber/metricas` continuam funcionando sem regressão.
- [x] Confirmar a regra transversal do roadmap: `/`, `/Servicos`, `/Login`, `/CriarConta`,
      `/EsqueciSenha`, `/agendamento` retornam 200 para visitante; `/meus-servicos` mantém o
      comportamento pré-existente (redirect para `/Login` se não logado).

---

## Testing Notes
- Unit tests: não há suíte Jest cobrindo `/barber` ou hooks de dados hoje; nenhuma nova suíte
  automatizada é criada por este plan (consistente com o estado atual do projeto, sem regressão de
  cobertura).
- Integration tests: validação via chamadas HTTP reais (cURL/script Node) contra o backend local,
  cobrindo os 4 papéis nas rotas de `business-hours`/`holidays`.
- Manual steps: 1) subir backend (`npm run dev`) e frontend (`npm run dev`); 2) logar como cada
  papel via `/Login`; 3) navegar/testar conforme os itens de Manual Verification acima, incluindo
  criação de agendamentos de teste em horários/dias variados via `/agendamento` ou diretamente no
  banco para popular a agenda visualmente.

## Migration Notes
Não aplicável — este epic não altera `prisma/schema.prisma`. Todos os dados necessários
(`Appointment.date/endDate/durationMinutes/status/adminId`, `BusinessHours`, `Holiday`) já existem.
Nenhuma migration Prisma é executada por este plan.

## Rollout Notes
- Mudança aditiva: nova página, novo hook, novo link condicional-livre no header, e expansão de
  permissão de leitura (`BARBEIRO` em duas rotas `GET` já existentes). Nenhum comportamento
  existente para `DONO`/`ADMIN`/`CLIENTE`/visitante é alterado.

---
