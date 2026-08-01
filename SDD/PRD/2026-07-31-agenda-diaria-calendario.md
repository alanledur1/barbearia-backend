# PRD — Página de agenda diária estilo Google Calendar/Outlook consumindo agendamentos, horário de funcionamento e feriados

## 1) Objetivo
- Entregar uma página de agenda com visão diária dos agendamentos, no estilo calendário
  (colunas de horário, blocos de agendamento, navegação entre dias), sob `/barber`.
- Hoje o único jeito de ver os agendamentos é a lista plana de `BarberDashboard`
  (`AppointmentsList`/`AppointmentCard`), sem noção visual de horário/ocupação do dia nem de
  horário de funcionamento/feriados. A agenda diária dá a barbeiro/dono/admin uma visão rápida de
  "o que tenho hoje" e "quando estou livre/ocupado/fechado", como um Google Calendar/Outlook.

## 2) Escopo
**Inclui**
- Nova página `/barber/agenda` (barbeiro, dono, admin — mesmo público de `/barber`).
- Grid vertical de horário (linhas de hora) para um único dia, com blocos de agendamento
  posicionados proporcionalmente ao horário/duração.
- Navegação entre dias (anterior/próximo/hoje + seleção direta de data).
- Seletor de barbeiro (reaproveita `GET /appointments/barbers`, já público). Barbeiro logado vê a
  si mesmo pré-selecionado; dono/admin veem o primeiro barbeiro da lista por padrão.
- Uso do horário de funcionamento (`BusinessHours`) e feriados (`Holiday`) reais (já existentes
  desde o Epic 2) para sombrear/bloquear visualmente períodos fora do expediente e dias fechados —
  substituindo qualquer geração hardcoded de horário nesta tela nova (diferente do wizard de
  `/agendamento`, que mantém sua lógica própria e não é tocado aqui).
- Clique num bloco de agendamento abre um popover/painel somente leitura com detalhes (cliente,
  serviço, horário, status, notas).
- Ajuste de permissão no backend: `GET /api/business-hours` e `GET /api/holidays` passam a aceitar
  também o papel `BARBEIRO` (hoje só `DONO`/`ADMIN`), pois a página precisa ser acessível a
  barbeiro e ele hoje não consegue ler essas duas rotas.

**Não inclui (fora de escopo)**
- Criar, editar, concluir ou cancelar agendamento a partir da agenda (isso já existe via
  `BarberDashboard`/`AppointmentCard`, que não é alterado). O popover de detalhes é somente
  leitura.
- Visão semanal/mensal — só diária, conforme o epic.
- Alterar `PUT /business-hours`, `POST/DELETE /holidays` (continuam `DONO`/`ADMIN`-only) ou
  qualquer regra de negócio de criação de agendamento (`AppointmentService`).
- Alterar o wizard público `/agendamento` ou sua lógica de geração de horários
  (`generateTimeSlotsForDate`) — decisão de escopo já tomada no Epic 2 e mantida aqui.
- Novo endpoint de leitura no backend: o formato atual (`GET /appointments?date=`, já suportado
  por `AppointmentService.listAll`, mais `GET /appointments/barbers`) é suficiente; filtragem por
  barbeiro é feita no cliente (client-side), já que o payload de `listAll` inclui `admin.id`.

## 3) Fluxo atual (como funciona hoje)
- `/barber` (`BarberDashboard.tsx`) lista **todos** os agendamentos (sem filtro por data nem por
  barbeiro) via `useBarberData` → `GET /appointments` (sem query params), numa lista paginada
  (`PaginatedAppointmentsView.tsx`) com cards (`AppointmentCard.tsx`), sem nenhuma visão de
  calendário/horário.
- `GET /appointments` (`appointment.routes.ts:12`) é protegida só por `authMiddleware` (sem
  `requireRole`) — qualquer papel autenticado (inclusive `BARBEIRO`) já pode listar todos os
  agendamentos hoje. `AppointmentService.listAll` (`appointmentService.ts:135`) aceita filtros
  `date` (string `YYYY-MM-DD`, comparando por dia UTC) e `clientId`, mas **não** filtra por
  `adminId`; o `select` já inclui `admin: { id, name, email }` em cada resultado
  (`appointmentService.ts:164`).
- `GET /appointments/barbers` e `GET /appointments/availability?date=&adminId=` são públicas
  (sem `authMiddleware`), usadas hoje só pelo wizard `/agendamento` (Epic 1).
- `GET /business-hours` e `GET /holidays` (`businessHours.routes.ts`, `holiday.routes.ts`) exigem
  `authMiddleware` + `requireRole('DONO','ADMIN')` — **`BARBEIRO` recebe 403 hoje**. Só a página
  `/barber/configuracoes` (dono/admin-only) consome essas rotas hoje, via `useBusinessSettings`.
- `AppointmentService.validateBusinessHours`/`validateNotHoliday` (`appointmentService.ts:40,73`)
  já usam `BusinessHours`/`Holiday` no backend para *validar* criação de agendamento, mas nenhuma
  tela hoje *visualiza* esses dados junto com os agendamentos do dia.
- O wizard `/agendamento` (`agendamento/page.tsx:69`, `generateTimeSlotsForDate`) gera uma lista
  hardcoded de slots de 30 min (09:00–19:30, com regras especiais para sexta/sábado) e cruza com
  `GET /appointments/availability` — **não** usa `BusinessHours`/`Holiday` (achado documentado no
  Epic 2, decisão de escopo já tomada de não integrar o wizard).

## 4) Fluxo desejado (comportamento esperado)
- Em `/barber/agenda`, o usuário (barbeiro/dono/admin) vê um grid vertical de horas para o dia
  selecionado (hoje por padrão), com um seletor de barbeiro e navegação anterior/próximo/hoje/data
  específica.
- O grid é desenhado a partir do `BusinessHours` do dia da semana selecionado (`openTime`/
  `closeTime`/`isClosed`) e do `Holiday` da data (se houver): período fora do expediente aparece
  sombreado/bloqueado; dia inteiro fechado (feriado ou `isClosed`) mostra um aviso "Fechado" sobre
  o grid.
- Os agendamentos (`CONFIRMED`/`COMPLETED`/`CANCELLED`) do barbeiro selecionado naquele dia
  aparecem como blocos posicionados pelo horário/duração real (`date`/`durationMinutes`), com cor
  por status (mesma linguagem visual de `AppointmentCard`: confirmado/concluído/cancelado).
  Clicar no bloco abre um painel com os detalhes (somente leitura).
- Trocar de barbeiro ou de dia recarrega os agendamentos exibidos sem sair da página.

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `barbearia-shelby-frontend/src/app/barber/layout.tsx` — guard atual de `/barber/*`:
  `ProtectedRoute allowedUserType={['barbeiro','dono','admin']}`. Como a nova página tem
  exatamente esse público, **não precisa** de um `layout.tsx` aninhado próprio (diferente de
  `configuracoes`/`usuarios`/`metricas`, que restringem a um subconjunto).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx` — nav
  com os links existentes (`Novo Agendamento`, `Faturamento`, `Métricas`, `Configurações`,
  `Usuários`); precisa ganhar o link "Agenda".
- `barbearia-backend/src/routes/appointment.routes.ts` — `GET /` (linha 12, `listAll`, autenticada
  sem role específico) e `GET /barbers` (linha 14, pública) já servem a feature, sem alteração.
- `barbearia-backend/src/routes/businessHours.routes.ts:9` e
  `barbearia-backend/src/routes/holiday.routes.ts:9` — `GET /` de cada uma precisa passar a
  aceitar `BARBEIRO` além de `DONO`/`ADMIN`.

### 5.2 Domínio / Regras / Serviços
- `barbearia-backend/src/services/appointmentService.ts::listAll` (linha 135) — já suporta filtro
  por `date`; não precisa mudar (filtragem por barbeiro fica no cliente, usando o `admin.id` já
  retornado).
- `barbearia-backend/src/services/businessHoursService.ts::listAll` /
  `barbearia-backend/src/services/holidayService.ts::listAll` — inalterados, só a rota que os
  expõe muda de permissão.

### 5.3 Persistência / Modelos / Migrações
- `barbearia-backend/prisma/schema.prisma` — `Appointment` (`date`, `endDate`, `durationMinutes`,
  `status`, `adminId`, `clientId`/`guestName` etc.), `BusinessHours` (`dayOfWeek`, `openTime`,
  `closeTime`, `isClosed`), `Holiday` (`date`, `reason`). Nenhuma migration necessária — feature é
  100% leitura de dados já existentes.

### 5.4 Integrações externas (clients/adapters/providers)
- Nenhuma integração externa nova. `date-fns` (`^4.1.0`, já em `package.json`) disponível para
  formatação/soma de datas no frontend.

### 5.5 UI / Componentes (se aplicável)
- `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` — padrão de hook a seguir
  (fetch com header `Authorization`, tratamento de erro via `extractErrorMessage`), mas não é
  reaproveitado diretamente (ele também expõe ações de escrita que a agenda não precisa); serve de
  referência de estilo para um novo hook dedicado.
- `barbearia-shelby-frontend/src/hooks/useBarberMetrics.tsx` — mesmo padrão de hook simples
  read-only com `getHeaders`/`fetchAll`, mais próximo do que a agenda precisa.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/AppointmentCard.tsx` —
  referência de nomenclatura de status (`status`, `statusCONFIRMED/COMPLETED/CANCELLED`) e formato
  de data (`toLocaleString('pt-BR', {...})`).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/styles.module.scss:5-14` —
  paleta de cores do painel do barbeiro (`$brand-color:#f67366`, `$card-bg:#1e1e1e`,
  `$confirmed-color:#0d6efd`, `$success-color:#28a745`, `$cancelled-color:#dc3545`, etc.) — reusar
  os mesmos tons na nova página para consistência visual.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/page.tsx` e `.module.scss` — referência
  de estrutura de página nova sob `/barber` (sem layout próprio quando não muda o público, form
  simples, tratamento de loading/error).
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx:69-153`
  (`generateTimeSlotsForDate`) — mostra o padrão já usado no projeto para cruzar
  `GET /appointments/availability` com uma data; **não** é reaproveitado diretamente (a agenda usa
  `GET /appointments?date=` + `BusinessHours`/`Holiday` reais, não a lista hardcoded do wizard).
- Não existe `.interface-design/system.md` neste repositório (confirmado via busca) — a instrução
  do `implementar.md` de consultar esse arquivo antes de UI não se aplica.

### 5.6 Testes / Fixtures (se existirem)
- Não há suíte Jest/Cypress cobrindo `/barber` ou agendamentos hoje (confirmado nos epics
  anteriores — `npm test` não encontra suítes). Validação desta feature será via build+lint+E2E
  manual/navegador, mesmo padrão dos epics 1–7.

## 6) Padrões existentes para reuso (evitar duplicação)
- `barbearia-shelby-frontend/src/hooks/useBarberMetrics.tsx` — padrão de hook read-only
  (`getHeaders` via `useAuth().token`, `fetchAll` em `useEffect`, `loading`/`error`) a replicar
  para o novo hook da agenda.
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` — guard já usado
  em todo `/barber/*`; a página nova roda dentro do guard existente de `app/barber/layout.tsx`,
  sem precisar de um novo.
- `barbearia-backend/src/middlewares/requireRole.middleware.ts` — `requireRole(...roles)` aceita
  lista; basta adicionar `'BARBEIRO'` às duas rotas de leitura mencionadas.
- Paleta de cores/status de `BarberDashboard/styles.module.scss` e nomenclatura de
  `AppointmentCard.tsx` — reusar para os blocos de agendamento da agenda (consistência visual).

## 7) Documentação externa (via Context7)
Não foi necessário consultar bibliotecas novas — a feature usa apenas React/Next.js (App Router),
`date-fns` e CSS/SCSS já presentes no projeto, todos já em uso nos mesmos padrões em código
existente (`agendamento/page.tsx`, `useBusinessSettings.tsx`). Nenhuma API nova de terceiros é
introduzida.

### Consultas realizadas
Nenhuma — sem lib nova, sem necessidade de doc externa para este epic.

## 8) Impactos prováveis (áreas afetadas)
- Backend: `businessHours.routes.ts` e `holiday.routes.ts` — expandir `GET /` para aceitar
  `BARBEIRO` (mudança de 1 linha em cada arquivo, sem tocar em controller/service).
- Frontend: nova página `/barber/agenda` (page + module.scss + hook dedicado), link novo em
  `BarberHeader.tsx`.
- Nenhum impacto em schema/migrations, nenhum impacto em `/agendamento` público, nenhum impacto na
  regra transversal (visitante/cliente continuam com acesso às mesmas páginas de sempre — esta
  feature é 100% dentro de `/barber`, já protegida).

## 9) Critérios de aceitação
- [ ] `/barber/agenda` acessível para `barbeiro`, `dono` e `admin` logados; redireciona para
      `/Login` para visitante e para `cliente` (mesmo comportamento do guard de `/barber`).
- [ ] Grid diário mostra as horas do expediente (`BusinessHours` do dia da semana), com período
      fora do expediente visualmente distinto (bloqueado/sombreado).
- [ ] Dia marcado como `isClosed` ou presente em `Holiday` mostra aviso de "fechado" e não sugere
      horários livres.
- [ ] Agendamentos do barbeiro selecionado no dia selecionado aparecem como blocos posicionados
      pelo horário real (`date`) e duração (`durationMinutes`), com cor distinguindo
      `CONFIRMED`/`COMPLETED`/`CANCELLED`.
- [ ] Clicar num bloco mostra os detalhes do agendamento (cliente/convidado, serviço, horário,
      status, notas) sem permitir edição nesta tela.
- [ ] Navegação anterior/próximo dia e "Hoje" funcionam e recarregam os agendamentos exibidos.
- [ ] Seletor de barbeiro troca o conjunto de agendamentos exibidos sem recarregar a página
      inteira; barbeiro logado começa com si mesmo selecionado.
- [ ] `GET /api/business-hours` e `GET /api/holidays` respondem `200` para `BARBEIRO` (antes:
      `403`); `PUT /business-hours`, `POST/DELETE /holidays` continuam rejeitando `BARBEIRO`
      (`403`).
- [ ] Link "Agenda" visível no `BarberHeader` para os 3 papéis.
- [ ] Regra transversal do roadmap intacta: `/`, `/Servicos`, `/Login`, `/CriarConta`,
      `/EsqueciSenha`, `/agendamento`, `/meus-servicos` continuam acessíveis a visitante/cliente
      exatamente como antes.

## 10) Open Questions (bloqueios / dúvidas)
Nenhuma — todas as decisões de escopo/design foram resolvidas com evidência do codebase (ver
seções 3–6): reuso de `GET /appointments?date=` + `GET /appointments/barbers` existentes,
expansão mínima de permissão de `BARBEIRO` nas duas rotas de leitura de configuração, e escopo
somente-leitura para os blocos de agendamento (edição continua exclusiva de `BarberDashboard`).
