SPEC PATH: barbearia-backend/SDD/SPEC/2026-07-30-selecao-barbeiro-agendamento.md

# Spec — Seleção de barbeiro no fluxo de agendamento com checagem de disponibilidade por profissional

## Objective
- Filtrar a checagem de disponibilidade de horário por `adminId` (barbeiro), em vez de globalmente.
- Expor dois endpoints públicos novos necessários para o fluxo de agendamento sem login: listar barbeiros e consultar horários ocupados de um barbeiro numa data.
- Adicionar passo de seleção de barbeiro no wizard de `/agendamento` e enviar `adminId` no payload em todos os fluxos (visitante, cliente logado, staff).
- Corrigir, como efeito colateral necessário desta mudança, a chamada do frontend que hoje bate em `GET /api/appointments` (rota protegida por `authMiddleware` desde o Epic 0) sem enviar token — o que hoje retorna 401 para visitante/cliente e impede a exibição de horários. A correção é usar os dois novos endpoints públicos em vez da rota protegida.

## Scope
**In**
- `barbearia-backend/src/services/appointmentService.ts`
- `barbearia-backend/src/controllers/appointment.controller.ts`
- `barbearia-backend/src/routes/appointment.routes.ts`
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx`

**Out**
- Horário de funcionamento configurável / feriados (Epic 2).
- Agenda diária (Epic 3).
- Qualquer mudança em `GET /api/appointments` (listagem protegida existente), `useBarberData.tsx`, `useClientData.tsx`, `BarberDashboard`, `billing.controller.ts`.
- CRUD de barbeiros (Epic 4) — endpoints novos são somente leitura.
- Migração de schema — nenhuma mudança de schema é necessária (campo `Appointment.adminId` e enum `UserRole.BARBEIRO` já existem).

## Files to Modify

### `barbearia-backend/src/services/appointmentService.ts`
- Changes:
  - `checkAvailability(startDateTime, endDateTime, adminId, excludeAppointmentId?)`: adicionar parâmetro obrigatório `adminId: number | null | undefined` (posição 3, antes de `excludeAppointmentId`). Adicionar `adminId` ao `where` do `prisma.appointment.count` **somente quando `adminId` for truthy** (`...(adminId ? { adminId } : {})`), preservando o comportamento atual (sem filtro) apenas no caso defensivo de um agendamento legado sem `adminId`.
  - `createAppointment`: reordenar a resolução do profissional (`assignedAdminId`) para **antes** da pré-checagem de disponibilidade:
    1. Buscar `service`, calcular `endDateTime`, `validateBusinessHours` (like today).
    2. Resolver `assignedAdminId`:
       - Se `adminId` foi enviado no payload: `parseInt` já feito no controller; validar no service que existe um `User` com esse `id` e `role !== 'CLIENTE'` (`prisma.user.findUnique({ where: { id: adminId } })`). Se não existir ou for `CLIENTE`, `throw new CustomError('Profissional selecionado inválido.', 400)`.
       - Se `adminId` não foi enviado: `defaultAdmin = await prisma.user.findFirst({ where: { role: 'BARBEIRO' } })`; se não houver nenhum `BARBEIRO`, fazer fallback para `prisma.user.findFirst({ where: { role: { not: 'CLIENTE' } } })`; se ainda assim nada for encontrado, `throw new CustomError('Nenhum profissional configurado.', 500)` (mesma mensagem/status de hoje).
    3. Chamar `checkAvailability(requestedDateTime, endDateTime, assignedAdminId)` (pré-checagem, fora da transação) — igual ao fluxo atual, mas agora com `adminId`.
    4. Montar `appointmentData` (igual a hoje) e conectar `admin: { connect: { id: assignedAdminId } }` (já usa `assignedAdminId`, sem mudança de valor, só de timing).
    5. Lógica de cliente (`clientId`/`clientData`) inalterada.
    6. Dentro da `prisma.$transaction`: o `overlapping` count deve incluir `adminId: assignedAdminId` no `where`, junto de `status: 'CONFIRMED'` e o `AND` de sobreposição de datas (fix do bug da checagem duplicada que hoje ignora `adminId`).
  - `update(id, dataToUpdate)`: no bloco `isRescheduling`, ao chamar `checkAvailability(newStartDate, newEndDate, id)`, passar o `adminId` do agendamento existente: `checkAvailability(newStartDate, newEndDate, existing.adminId, id)` (mudança de posição de argumento — `id` de exclusão passa a ser o 4º parâmetro).
  - Adicionar dois novos métodos públicos na classe `AppointmentService`, reaproveitando o padrão de range de data já usado em `listAll` ([appointmentService.ts:79-85](../../src/services/appointmentService.ts)):
    - `async listBookableBarbers()`: retorna `prisma.user.findMany({ where: { role: 'BARBEIRO' }, select: { id: true, name: true }, orderBy: { name: 'asc' } })`.
    - `async getAvailabilityByBarber(adminId: number, date: string)`: replica o cálculo de `startDate`/`endDate` (UTC, dia inteiro) de `listAll`, e retorna `prisma.appointment.findMany({ where: { adminId, status: 'CONFIRMED', date: { gte: startDate, lt: endDate } }, select: { date: true, durationMinutes: true }, orderBy: { date: 'asc' } })`. **Não** selecionar `client`, `guestName`, `guestEmail`, `guestPhone` nem `notes` (endpoint público, sem PII).
- Notes/Constraints:
  - Nenhuma migration necessária.
  - Manter mensagens de erro em português, no mesmo estilo das já existentes (`CustomError`).
  - Não alterar `validateBusinessHours` (fallback hardcoded mantido, conforme escopo do epic).
- Reuse:
  - `CustomError` (já importado no arquivo).
  - Padrão de cálculo de range de data por dia, já existente em `listAll`.

### `barbearia-backend/src/controllers/appointment.controller.ts`
- Changes:
  - Adicionar método `listBarbers(req, res)`: chama `new AppointmentService().listBookableBarbers()`, retorna `200` com o array. Try/catch com `500` e log, no mesmo padrão de `listAll`.
  - Adicionar método `getAvailability(req, res)`: lê `date` e `adminId` de `req.query`; validar que ambos existem (`400` se faltar algum: `'date e adminId são obrigatórios.'`); `parseInt(adminId)`, `400` se `NaN` (`'adminId inválido.'`); chama `new AppointmentService().getAvailabilityByBarber(adminIntId, date as string)`; retorna `200` com o array. Try/catch com `500` e log, mesmo padrão de `listAll`.
  - Nenhuma outra mudança nos métodos existentes (`create` continua repassando `adminId` do body como já faz hoje).
- Notes/Constraints:
  - Seguir exatamente o estilo de try/catch e mensagens de erro já usado nos outros métodos do arquivo (`return res.status(...).json({ error: ... })`).
- Reuse:
  - Padrão de validação/parsing de query params já usado em `listAll` (`date`/`clientId`) e `getById` (`parseInt` + `isNaN`).

### `barbearia-backend/src/routes/appointment.routes.ts`
- Changes:
  - Adicionar, **antes** de `router.get("/:id", ...)`, duas novas rotas públicas (sem `authMiddleware`):
    ```
    router.get("/barbers", appointmentController.listBarbers);
    router.get("/availability", appointmentController.getAvailability);
    ```
  - Posição exata: logo após `router.get("/", authMiddleware, appointmentController.listAll);` e antes de `router.get("/:id", ...)`, para não serem capturadas pelo parâmetro `:id`.
- Notes/Constraints:
  - Rotas públicas intencionalmente (visitante precisa acessar sem login, mesmo padrão de `GET /services` em `service.routes.ts:11-12`).
  - Não remover/alterar `authMiddleware` de `GET /` (listagem completa com PII permanece protegida, comportamento do Epic 0 preservado).
- Reuse:
  - Mesmo padrão de rota pública já usado em `service.routes.ts` para `GET /`.

### `barbearia-shelby-frontend/src/app/agendamento/page.tsx`
- Changes:
  - Tipos:
    - Adicionar `type Barber = { id: number; name: string };`.
    - Adicionar `type AvailabilityEntry = { date: string; durationMinutes: number };` — substitui o uso do tipo `Appointment` dentro de `generateTimeSlotsForDate` (o tipo `Appointment` local deixa de ser necessário nesse ponto; pode ser removido se não for usado em outro lugar do arquivo).
    - Atualizar `type Step = 1 | 2 | 3 | 4 | 5;`.
  - Estado novo: `const [barbers, setBarbers] = useState<Barber[]>([]);` e `const [selectedBarber, setSelectedBarber] = useState<Barber | undefined>();`.
  - Novo `useEffect` (mount) para buscar barbeiros: `api.get('/appointments/barbers')` → `setBarbers(response.data)`, com tratamento de erro que reusa o `error` state existente (mensagem: `'Não foi possível carregar os barbeiros. Tente recarregar a página.'`).
  - Variável derivada `const isStaffBooking = !!(auth.isAuthenticated && auth.user && ['barbeiro', 'dono', 'admin'].includes(auth.user.userType));` — calculada no corpo do componente (reaproveita a mesma checagem já usada em `handleBookingSubmit`, hoje inline em `page.tsx:198`).
  - `handleServiceSelect(service)`:
    - `setSelectedService(service); setError(null);`
    - Se `isStaffBooking`: `setSelectedBarber({ id: auth.user!.id, name: auth.user!.name ?? 'Você' }); setStep(3);` (pula a seleção manual de barbeiro).
    - Senão: `setStep(2);`
  - Novo handler `handleBarberSelect(barber: Barber)`: `setSelectedBarber(barber); setError(null); setStep(3);`.
  - `generateTimeSlotsForDate(date: Date, service: Service, barber: Barber)`:
    - Assinatura ganha o parâmetro `barber`.
    - Trocar a chamada de `api.get<Appointment[]>(\`/appointments?date=${dateString}\`)` por `api.get<AvailabilityEntry[]>(\`/appointments/availability?date=${dateString}&adminId=${barber.id}\`)`.
    - Remover o `.filter((app) => app.status === 'CONFIRMED')` (o endpoint novo já retorna só `CONFIRMED`).
    - Resto da função (geração de `allSlots`, regras de dia da semana, cálculo de `bookedSlots`, `slotsWithAvailability`) permanece **idêntico** — só o campo `app.date`/`app.durationMinutes` já existe no novo tipo `AvailabilityEntry`.
  - `handleDateSelect(date)`: guard passa a exigir `selectedBarber` também: `if (!date || !selectedService || !selectedBarber) return;`; chamada vira `generateTimeSlotsForDate(date, selectedService, selectedBarber);`.
  - `handleSlotSelect`: sem mudança de lógica, só ajustar `setStep(3)` → `setStep(4)` (novo número do step "Dados").
  - `handleBookingSubmit`: os três ramos (`staff`, `cliente logado`, `visitante`) passam a incluir `adminId: selectedBarber?.id` no payload (hoje só o ramo staff inclui). Tipo `BookingPayload` já tem `adminId?: number`, sem mudança de tipo necessária.
  - `resetFlow`: adicionar `setSelectedBarber(undefined);` e manter `setStep(1)`.
  - JSX:
    - Stepper (bloco `step < 4` vira `step < 5`): adicionar um item `<div className={... step >= 2 ...}>Barbeiro</div>` entre "Serviço" e "Data & Hora"; renumerar os `step >=` de cada item (`Serviço`→1, `Barbeiro`→2, `Data & Hora`→3, `Seus Dados`→4).
    - Novo bloco `{step === 2 && (...)}`: título "2. Escolha o Barbeiro", grid reaproveitando `styles.serviceGrid`/`styles.serviceCard` (mesmo padrão visual do step de serviços), um card por `barbers.map(barber => ...)` chamando `handleBarberSelect(barber)`; exibir mensagem se `barbers.length === 0` (`'Nenhum barbeiro disponível no momento.'`); botão `Voltar para Serviços` (`setStep(1)`).
    - Bloco antigo `step === 2` (Data & Hora) vira `step === 3`; botão "Voltar" desse bloco passa a `setStep(isStaffBooking ? 1 : 2)`.
    - Bloco antigo `step === 3` (Dados) vira `step === 4`; botão "Voltar" passa a `setStep(3)`; adicionar no `.summary` uma linha `{selectedBarber && <p><strong>Barbeiro:</strong> {selectedBarber.name}</p>}` (entre a linha de Serviço e a de Data, mesmo padrão dos `<p><strong>`).
    - Bloco antigo `step === 4` (Confirmação) vira `step === 5`.
- Notes/Constraints:
  - Não existe `.interface-design/system.md` no repositório — seguir os tokens/estilos já definidos em `agendamento-moderno.module.scss` (reuso de `.serviceGrid`/`.serviceCard`, sem novas classes).
  - Para `isStaffBooking`, `auth.user!.id`/`auth.user!.name` são seguros de usar sem `?.` porque `isStaffBooking` já garante `auth.user` truthy — mas manter o padrão de nullish-safety do arquivo (`auth.user?.id` com fallback) se preferir mais defensivo; qualquer uma das duas formas é aceitável desde que não quebre o build TypeScript.
- Reuse:
  - `styles.serviceGrid` / `styles.serviceCard` (grid de cards clicáveis) do próprio arquivo/SCSS.
  - `styles.backButton` / `styles.stepTitle` / `styles.summary` já existentes.

## Files to Create
Nenhum arquivo novo é necessário — todas as mudanças são em arquivos existentes.

## Implementation Order (recommended)
1. `appointmentService.ts` — `checkAvailability` + `createAppointment` (reordenação + fix da checagem duplicada) + `update` + os 2 métodos novos.
2. `appointment.controller.ts` — `listBarbers` + `getAvailability`.
3. `appointment.routes.ts` — as 2 novas rotas públicas.
4. `barbearia-backend`: `npm run build` (validação de tipos/compilação).
5. `agendamento/page.tsx` — todas as mudanças de frontend descritas acima, numa passada.
6. `barbearia-shelby-frontend`: `npm run build` e `npm run lint`.
7. Walkthrough manual no navegador (visitante, cliente logado, staff logado) cobrindo o fluxo completo de agendamento com dois barbeiros distintos tendo agendamentos no mesmo horário.

## Validation (commands / checks)
- `barbearia-backend`: `npm run build`.
- `barbearia-shelby-frontend`: `npm run build`, `npm run lint`.
- Sem testes automatizados existentes para este fluxo em nenhum dos repos (confirmado na pesquisa) — validação funcional é manual via navegador.

## Notes
- O fallback de horário de funcionamento (`validateBusinessHours`, 9h–20h BRT hardcoded) não é alterado por este epic, conforme instrução explícita do escopo (Epic 2 cobre horário configurável).
- Mudança de contrato de API: 2 endpoints novos, aditivos, públicos (`GET /api/appointments/barbers`, `GET /api/appointments/availability`). Nenhum endpoint existente muda de formato de request/response; `POST /api/appointments` continua aceitando `adminId` opcional exatamente como hoje (agora validado no service).
