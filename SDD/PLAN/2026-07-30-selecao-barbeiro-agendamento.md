PLAN PATH: barbearia-backend/SDD/PLAN/2026-07-30-selecao-barbeiro-agendamento.md

# Seleção de barbeiro no fluxo de agendamento com checagem de disponibilidade por profissional — Implementation Plan

## Overview
Hoje `AppointmentService.checkAvailability` checa sobreposição de horário globalmente, sem considerar qual profissional (`adminId`) está sendo agendado — um horário ocupado por qualquer barbeiro bloqueia todos os outros. O frontend de `/agendamento` espelha o mesmo problema (busca todos os agendamentos do dia, ignora o profissional) e nem sequer tem um passo para o cliente escolher o barbeiro. Vamos: (1) tornar a checagem de disponibilidade sensível ao barbeiro no backend, (2) expor dois endpoints públicos novos e mínimos (lista de barbeiros; horários ocupados de um barbeiro numa data) sem vazar dados de clientes, e (3) adicionar o passo de escolha de barbeiro no wizard do frontend, enviando `adminId` em todos os fluxos de criação de agendamento (visitante, cliente logado, staff).

Como efeito colateral necessário: a chamada atual do frontend a `GET /api/appointments?date=` (rota protegida por `authMiddleware` desde o Epic 0) é feita sem token por um visitante — hoje isso retorna 401 e quebra silenciosamente a exibição de horários para quem não está logado. Os novos endpoints públicos substituem essa chamada no fluxo de agendamento e corrigem esse problema como parte da mesma mudança.

## Scope
### In Scope
- `AppointmentService.checkAvailability`, `createAppointment`, `update` — filtro por `adminId`.
- Dois métodos novos em `AppointmentService`: `listBookableBarbers`, `getAvailabilityByBarber`.
- Dois endpoints novos e públicos em `appointment.routes.ts`/`appointment.controller.ts`: `GET /appointments/barbers`, `GET /appointments/availability`.
- Validação server-side do `adminId` recebido em `POST /appointments` (deve ser um usuário existente com `role !== 'CLIENTE'`).
- Novo passo "Escolha o Barbeiro" no wizard de `/agendamento` (frontend), incluindo o caso de staff logado (pula o passo, auto-seleciona a si mesmo, como já acontece implicitamente hoje).
- Envio de `adminId` no payload de criação de agendamento em todos os fluxos (visitante, cliente, staff).

### Out of Scope
- Horário de funcionamento configurável / feriados (Epic 2) — mantém `validateBusinessHours` hardcoded (9h–20h BRT) como fallback.
- Agenda diária tipo calendário (Epic 3).
- CRUD de usuários/barbeiros (Epic 4) — endpoints novos são somente leitura.
- `GET /api/appointments` (listagem protegida existente), `useBarberData.tsx`, `useClientData.tsx`, dashboards e billing.
- Qualquer migration de schema (não é necessária).

## Current State (from codebase)
- `barbearia-backend/src/services/appointmentService.ts:52-70` — `checkAvailability` sem filtro por `adminId`.
- `barbearia-backend/src/services/appointmentService.ts:130-181` — `createAppointment` chama `checkAvailability` **antes** de resolver `assignedAdminId` (linha 131, antes do bloco de resolução de admin em 144-150); checagem duplicada dentro da transação (168-181) também sem `adminId`.
- `barbearia-backend/src/services/appointmentService.ts:207-221` — `update` (reagendamento) chama `checkAvailability` sem `adminId`, mesmo já tendo `existing.adminId` disponível.
- `barbearia-backend/src/services/appointmentService.ts:31-50` — `validateBusinessHours` hardcoded (9h–20h BRT), fora de escopo, mantém como está.
- `barbearia-backend/src/routes/appointment.routes.ts:11-15` — `POST /` público; `GET /`, `GET /:id`, `PATCH /:id` exigem `authMiddleware`.
- `barbearia-backend/src/routes/admin.routes.ts:14` — listagem de staff (`GET /api/admin`) restrita a `DONO`/`ADMIN`, não utilizável pelo fluxo público de agendamento.
- `barbearia-backend/prisma/schema.prisma:8-27,38-54` — `UserRole` já tem `BARBEIRO`; `Appointment.adminId` já existe e é opcional; nenhuma migration necessária.
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx:53-139` — `generateTimeSlotsForDate` busca `GET /appointments?date=` (rota protegida) **sem enviar token** — 401 para visitante hoje; ignora qual barbeiro está ocupado.
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx:170-247` — `handleBookingSubmit` só inclui `adminId` no ramo de staff logado (linha ~202); visitante e cliente nunca enviam `adminId`.
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx:264-386` — wizard de 4 steps (`Step = 1|2|3|4`), sem passo de seleção de barbeiro.
- `barbearia-shelby-frontend/src/app/agendamento/agendamento-moderno.module.scss:73-105` — `.serviceGrid`/`.serviceCard` já é o padrão visual reutilizável para grids de cards clicáveis.
- Não há testes automatizados (`*.test.ts`, `*.spec.ts`, `*.cy.*`) cobrindo agendamento em nenhum dos dois repos.

## Desired End State
- Dois barbeiros podem ter agendamentos `CONFIRMED` no mesmo horário sem conflito; o mesmo barbeiro não pode ter dois agendamentos `CONFIRMED` sobrepostos.
- No `/agendamento`, visitante/cliente escolhe: Serviço → Barbeiro → Data & Hora (já filtrada pelo barbeiro escolhido) → Dados → Confirmação. Staff logado pula a escolha de barbeiro (comportamento atual preservado: agenda como si mesmo).
- Visitante consegue completar o fluxo de ponta a ponta sem 401 (bug de auth corrigido como parte da mudança).
- Verificação: `npm run build` limpo nos dois repos; `npm run lint` limpo no frontend; walkthrough manual no navegador cobrindo visitante, cliente logado e staff logado, incluindo dois barbeiros com o mesmo horário ocupado por um e livre pelo outro.

## References
- PRD: `barbearia-backend/SDD/PRD/2026-07-30-selecao-barbeiro-agendamento.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-07-30-selecao-barbeiro-agendamento.md`
- Key code references:
  - `barbearia-backend/src/services/appointmentService.ts:52-70,115-189,191-227`
  - `barbearia-backend/src/controllers/appointment.controller.ts:8-58`
  - `barbearia-backend/src/routes/appointment.routes.ts:1-17`
  - `barbearia-shelby-frontend/src/app/agendamento/page.tsx:1-387`

---

## Phase 1: Backend — disponibilidade por barbeiro
### Tasks
- [x] `checkAvailability` ganha parâmetro `adminId` e filtra o `where` do count por ele quando presente.
- [x] `createAppointment`: mover a resolução de `assignedAdminId` (incl. validação de `adminId` recebido e fallback por `BARBEIRO`) para antes da pré-checagem de disponibilidade; passar `assignedAdminId` para `checkAvailability`.
- [x] `createAppointment`: incluir `adminId: assignedAdminId` no `where` do count de sobreposição feito dentro da `prisma.$transaction`.
- [x] `update`: passar `existing.adminId` para `checkAvailability` no fluxo de reagendamento.
- [x] Adicionar `listBookableBarbers()` e `getAvailabilityByBarber(adminId, date)` em `AppointmentService`.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [x] Criar dois usuários `BARBEIRO`; confirmado via chamadas reais a `POST /api/appointments` no servidor local que dois agendamentos no mesmo horário com `adminId` diferentes são ambos aceitos (HTTP 201), e que o mesmo `adminId` no mesmo horário é rejeitado (mensagem "Horário selecionado não está disponível."). Nota: o status HTTP retornado nesse caso é 400, não 409 — bug pré-existente no catch-all de `appointment.controller.ts::create` (sempre retorna 400, ignora `CustomError.statusCode`), não introduzido por esta mudança e fora do escopo desta Spec (frontend não depende do status code, só da mensagem).

---

## Phase 2: Backend — endpoints públicos de leitura
### Tasks
- [x] `AppointmentController`: métodos `listBarbers` e `getAvailability` (validação de query params, mesmo padrão de erro dos métodos existentes).
- [x] `appointment.routes.ts`: rotas públicas `GET /barbers` e `GET /availability`, posicionadas antes de `GET /:id`.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — compila sem erros.

#### Manual Verification
- [x] Com o servidor local rodando, `GET http://localhost:3001/api/appointments/barbers` sem header de auth retorna 200 com a lista de barbeiros.
- [x] `GET http://localhost:3001/api/appointments/availability?date=YYYY-MM-DD&adminId=<id>` sem header de auth retorna 200 com array de `{date, durationMinutes}`, sem dados de cliente. Confirmado que cada barbeiro só vê seus próprios horários ocupados.

---

## Phase 3: Frontend — passo de seleção de barbeiro
### Tasks
- [x] Novo estado (`barbers`, `selectedBarber`), fetch de `GET /appointments/barbers` no mount.
- [x] Renumerar `Step` para `1..5`, inserir novo passo "Barbeiro" (step 2), ajustar stepper visual.
- [x] `handleServiceSelect` pula o passo de barbeiro e auto-seleciona quando staff logado; caso contrário vai para o novo step 2.
- [x] `generateTimeSlotsForDate` passa a consumir `GET /appointments/availability?date=&adminId=` em vez de `GET /appointments?date=`.
- [x] `handleBookingSubmit` envia `adminId: selectedBarber?.id` nos três ramos (staff, cliente, visitante).
- [x] `resetFlow` limpa `selectedBarber`.
- [x] Resumo do step "Dados" mostra o barbeiro escolhido.
- [x] Desvio necessário (achado durante o walkthrough, fora da lista original mas dentro do escopo da fase): `handleBarberSelect` agora recalcula os horários (`generateTimeSlotsForDate`) quando o usuário já tinha uma data selecionada e volta para trocar de barbeiro — sem isso, os horários ficavam com dados do barbeiro anterior.

### Success Criteria
#### Automated Verification
- [x] `cd barbearia-shelby-frontend && npm run build` — build de produção sem erros.
- [x] `npx eslint src` — sem erros (o script `npm run lint` do repo está quebrado independentemente desta mudança: `next lint` foi removido no Next.js 16; ver nota abaixo).

#### Manual Verification
- [x] Fluxo completo como visitante (sem login): serviço → barbeiro → horários carregam sem erro 401 → dados → confirmação. Testado via navegador real (chrome-devtools), agendamento criado e confirmado via API.
- [x] Fluxo completo como cliente logado: mesmo caminho, `clientId` + `adminId` enviados. Confirmado via API (`clientId: 7`, `adminId: 4`) e visível em `/meus-servicos`.
- [x] Fluxo completo como staff logado (barbeiro/dono/admin): passo de escolha de barbeiro não aparece, segue direto para Data & Hora; botão "Voltar" retorna ao step 1. Confirmado via navegador.
- [x] Com dois barbeiros de teste e um horário ocupado por um deles: o outro barbeiro mostra esse mesmo horário como disponível. Confirmado via navegador (14:00 indisponível para "Barbeiro Exemplo", disponível para "Barbeiro Dois Teste" no mesmo dia).

---

## Phase 4: Verificação E2E e critério transversal
### Tasks
- [x] Rodar build/lint finais dos dois repos.
- [x] Subir backend e frontend localmente; percorrer o fluxo principal da feature no navegador (visitante, cliente, staff).
- [x] Confirmar que `/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`, `/meus-servicos` continuam acessíveis para visitante/cliente sem restrição nova (regra transversal do `ROADMAP_V2.md`).

### Success Criteria
#### Automated Verification
- [x] `barbearia-backend`: `npm run build` — limpo.
- [x] `barbearia-shelby-frontend`: `npm run build` — limpo; `npx eslint src` — limpo (ver nota sobre `npm run lint` acima).

#### Manual Verification
- [x] Walkthrough real no navegador cobrindo os 3 perfis (visitante, cliente, staff) e o cenário de dois barbeiros com disponibilidade independente. Concluído via chrome-devtools MCP, sem erros de console.
- [x] Navegação livre confirmada nas 7 rotas da regra transversal (`/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`, `/meus-servicos`), tanto anônimo quanto logado como cliente.

**Nota sobre tooling pré-existente (fora do escopo desta feature):** `npm run lint` (`next lint`) está quebrado no frontend independentemente desta mudança — o comando `next lint` foi removido no Next.js 16 (`next --help` não lista mais `lint` entre os comandos). Usei `npx eslint src` como equivalente funcional (mesma config `eslint.config.mjs`, resultado limpo). Não fiz a migração de tooling por estar fora do escopo do epic.

**Achado extra corrigido durante a execução (fora do escopo original):** o catch-all de `POST /appointments` em `appointment.controller.ts::create` sempre retorna HTTP 400, ignorando `CustomError.statusCode` — confirmado via teste real que um conflito de horário (que deveria ser 409) retorna 400 com a mensagem correta. Isso já existia antes desta mudança e não impacta o frontend (que só lê a mensagem, não o status code); não foi corrigido por estar fora do escopo da Spec.

---

## Testing Notes
- Unit tests: não há suíte de testes de backend hoje (nenhum `*.test.ts` no repo) — não introduzida por este plano (fora de escopo pedido).
- Integration tests: idem, não há suíte de integração hoje.
- Manual steps: 1) rodar `npm run dev` no backend; 2) rodar `npm run dev` no frontend; 3) usar dois usuários `BARBEIRO` (seed já cria um; criar um segundo via `POST /api/auth/register` autenticado como dono/admin, se necessário) para validar disponibilidade independente; 4) percorrer `/agendamento` como visitante, como cliente logado e como staff logado.

## Migration Notes
- Não aplicável — nenhuma mudança de schema Prisma é necessária nesta feature (`UserRole.BARBEIRO` e `Appointment.adminId` já existem).

## Rollout Notes
- Mudança de contrato de API aditiva (2 endpoints novos, públicos). Nenhum endpoint existente muda de formato. Sinalizar ao usuário que o frontend agora depende desses 2 endpoints novos existirem no backend implantado (deploy dos dois repos deve ser coordenado, ou o frontend quebra o fluxo de agendamento contra um backend antigo).
