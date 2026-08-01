SPEC PATH: barbearia-backend/SDD/SPEC/2026-07-31-planos-mensais-corte.md

# Spec — Planos mensais de corte configuráveis pelo dono, com assinatura e consumo por ciclo pelo cliente

## Objective
- Adicionar `Plan` (catálogo) e `ClientSubscription` (assinatura + estado do ciclo) ao schema, mais
  `Appointment.subscriptionId` opcional.
- Expor CRUD de planos (`GET /plans` público-ativos, `GET /plans/all`+`POST`+`PUT` `DONO`/`ADMIN`) e
  de assinatura (`POST /subscriptions`, `GET /subscriptions/me`, `PATCH /subscriptions/me/cancel`,
  todas `CLIENTE`-only).
- Integrar consumo de 1 corte por ciclo em `AppointmentService.createAppointment` via `usePlan?:
  boolean`, atomicamente, dentro da transação já existente.
- Criar `/barber/planos` (gestão, DONO/ADMIN) e a seção "Meu Plano" em `/meus-servicos` (cliente), e
  o toggle "Usar meu plano" no wizard `/agendamento`.

## Scope
**In**
- `barbearia-backend/prisma/schema.prisma`
- `barbearia-backend/src/utils/subscriptionCycle.ts` (novo)
- `barbearia-backend/src/services/planService.ts` (novo)
- `barbearia-backend/src/controllers/plan.controller.ts` (novo)
- `barbearia-backend/src/routes/plan.routes.ts` (novo)
- `barbearia-backend/src/services/subscriptionService.ts` (novo)
- `barbearia-backend/src/controllers/subscription.controller.ts` (novo)
- `barbearia-backend/src/routes/subscription.routes.ts` (novo)
- `barbearia-backend/src/routes/index.ts`
- `barbearia-backend/src/services/appointmentService.ts`
- `barbearia-backend/src/controllers/appointment.controller.ts`
- `barbearia-shelby-frontend/src/hooks/usePlans.tsx` (novo)
- `barbearia-shelby-frontend/src/app/barber/planos/layout.tsx` (novo)
- `barbearia-shelby-frontend/src/app/barber/planos/PlanFormModal.tsx` (novo)
- `barbearia-shelby-frontend/src/app/barber/planos/page.tsx` (novo)
- `barbearia-shelby-frontend/src/app/barber/planos/Planos.module.scss` (novo)
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`
- `barbearia-shelby-frontend/src/hooks/useSubscription.tsx` (novo)
- `barbearia-shelby-frontend/src/app/meus-servicos/components/MySubscription.tsx` (novo)
- `barbearia-shelby-frontend/src/app/meus-servicos/components/MySubscription.module.scss` (novo)
- `barbearia-shelby-frontend/src/app/meus-servicos/components/ClientDashboard.tsx`
- `barbearia-shelby-frontend/src/hooks/useClientData.tsx`
- `barbearia-shelby-frontend/src/app/meus-servicos/components/ClientAppointmentCard.tsx`
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx`
- `barbearia-shelby-frontend/src/app/agendamento/agendamento-moderno.module.scss`

**Out**
- `src/controllers/billing.controller.ts` e demais dashboards de faturamento — não alterados.
- Qualquer gateway de pagamento — não introduzido.
- `src/prisma/seed.ts` — não alterado (planos são cadastrados via UI/API pelo dono, não seedados,
  mesmo padrão de `Service`).
- `barbearia-backend/src/prisma/schema.prisma` (arquivo órfão, não usado pelo `prisma.config.ts`) —
  não tocado.

## Files to Modify

### `barbearia-backend/prisma/schema.prisma`
- Changes:
  - Adicionar ao final do arquivo (após `model Holiday`):
    ```prisma
    enum SubscriptionStatus {
      ACTIVE
      CANCELLED
    }

    model Plan {
      id           Int      @id @default(autoincrement())
      name         String
      description  String?
      cutsPerCycle Int
      price        Float
      benefits     String?
      active       Boolean  @default(true)
      createdAt    DateTime @default(now())
      updatedAt    DateTime @updatedAt

      subscriptions ClientSubscription[]
    }

    model ClientSubscription {
      id                Int                @id @default(autoincrement())
      clientId          Int
      planId            Int
      status            SubscriptionStatus @default(ACTIVE)
      startDate         DateTime           @default(now())
      currentCycleStart DateTime           @default(now())
      cutsUsedInCycle   Int                @default(0)
      createdAt         DateTime           @default(now())
      updatedAt         DateTime           @updatedAt

      client       User          @relation("ClientSubscriptions", fields: [clientId], references: [id])
      plan         Plan          @relation(fields: [planId], references: [id])
      appointments Appointment[]
    }
    ```
  - No `model User`, adicionar ao final do bloco de relações (após `appointmentsAsStaff`):
    ```prisma
      subscriptions ClientSubscription[] @relation("ClientSubscriptions")
    ```
  - No `model Appointment`, adicionar `subscriptionId`/`subscription` (após `notes`, antes de
    `admin`):
    ```prisma
      subscriptionId  Int?
      subscription    ClientSubscription? @relation(fields: [subscriptionId], references: [id])
    ```
- Notes/Constraints:
  - Todas as colunas novas são opcionais ou têm `@default(...)` — sem `NOT NULL` sem default em
    coluna existente com dados.
  - Relação `Appointment.subscription` é opcional (`Int?`) — referential action padrão do Prisma
    para relação opcional é `SetNull` (mesmo comportamento já observado em `clientId`/`adminId`),
    não precisa declarar `onDelete` explicitamente.
  - Nome da relação `User`↔`ClientSubscription` precisa ser nomeado (`"ClientSubscriptions"`) porque
    `User` já tem duas outras relações com `Appointment` nomeadas — sem ambiguidade, mas o Prisma
    exige nome explícito só quando há mais de uma relação entre os mesmos dois models; aqui é a
    única relação `User`↔`ClientSubscription`, então o nome é opcional, mas mantenha por clareza e
    consistência com o padrão já usado (`"AppointmentClient"`, `"AppointmentStaff"`).
- Reuse:
  - Convenções já usadas no schema (`camelCase`, `@default(now())`, `@updatedAt`).

### `barbearia-backend/src/routes/index.ts`
- Changes:
  - Importar os novos routers:
    ```ts
    import planRoutes from './plan.routes';
    import subscriptionRoutes from './subscription.routes';
    ```
  - Montar, junto aos outros `router.use(...)`:
    ```ts
    router.use('/plans', planRoutes);
    router.use('/subscriptions', subscriptionRoutes);
    ```
- Notes/Constraints:
  - Seguir a ordem/estilo já usado para `business-hours`/`holidays`/`users`.
- Reuse:
  - Padrão de `router.use('/<área>', <router>)` já existente no arquivo.

### `barbearia-backend/src/services/appointmentService.ts`
- Changes:
  - Importar o novo utilitário:
    ```ts
    import { resolveCurrentCycle } from '../utils/subscriptionCycle';
    ```
  - Em `CreateAppointmentPayload`, adicionar:
    ```ts
    usePlan?: boolean;
    ```
  - Em `createAppointment`, incluir `usePlan` na desestruturação:
    ```ts
    const { clientId, clientData, serviceId, requestedDateTime, adminId, notes, usePlan } = payload;
    ```
  - Dentro do `prisma.$transaction(async (tx: any) => { ... })`, logo após o bloco que lança
    `CustomError` de sobreposição e antes do `return tx.appointment.create(...)`, inserir a lógica de
    consumo e ajustar o `create` final:
    ```ts
    let subscriptionId: number | undefined;
    if (usePlan) {
        if (!clientId) {
            throw new CustomError('Usar o plano requer estar logado como cliente.', 400);
        }

        const subscription = await tx.clientSubscription.findFirst({
            where: { clientId, status: 'ACTIVE' },
            include: { plan: true },
        });

        if (!subscription || !subscription.plan.active) {
            throw new CustomError('Você não possui uma assinatura ativa.', 400);
        }

        const { cycleStart, cutsUsed } = resolveCurrentCycle(
            subscription.currentCycleStart,
            subscription.cutsUsedInCycle
        );

        if (cutsUsed >= subscription.plan.cutsPerCycle) {
            throw new CustomError(
                'Você já utilizou todos os cortes do seu plano neste ciclo. Prossiga com pagamento avulso.',
                400
            );
        }

        await tx.clientSubscription.update({
            where: { id: subscription.id },
            data: { currentCycleStart: cycleStart, cutsUsedInCycle: cutsUsed + 1 },
        });
        subscriptionId = subscription.id;
    }

    return tx.appointment.create({
        data: {
            ...appointmentData,
            ...(subscriptionId ? { subscription: { connect: { id: subscriptionId } } } : {}),
        },
        include: {
            client: true,
            service: true,
            admin: true,
            subscription: { include: { plan: true } },
        },
    });
    ```
    (Substitui o `return tx.appointment.create({ data: appointmentData, include: { client: true,
    service: true, admin: true } });` atual — mesma posição, mesmo bloco.)
  - Em `listAll`, no objeto passado a `select`, adicionar:
    ```ts
    subscription: { select: { id: true, plan: { select: { id: true, name: true } } } },
    ```
    (logo após a linha `admin: { select: { id: true, name: true, email: true } }`).
  - Em `findById`, no `include`, adicionar `subscription: { include: { plan: true } }`:
    ```ts
    include: { client: true, service: true, admin: true, subscription: { include: { plan: true } } },
    ```
- Notes/Constraints:
  - A checagem de cortes disponíveis e o `update` do contador ficam **dentro** da mesma transação
    que já re-checa disponibilidade de horário — mesmo padrão de atomicidade já usado no arquivo,
    evita corrida entre duas requisições concorrentes do mesmo cliente.
  - Se `usePlan` for omitido/`false`, nenhum código novo é executado — `subscriptionId` permanece
    `undefined` e o `create` não inclui `subscription` — comportamento 100% idêntico ao atual.
  - `resolveCurrentCycle` não persiste nada — só a chamada dentro da transação persiste (via
    `tx.clientSubscription.update`).
- Reuse:
  - `CustomError`, já usado no mesmo padrão no restante do arquivo.
  - Padrão "checar de novo dentro da transação antes de gravar" já usado para `overlapping`.

### `barbearia-backend/src/controllers/appointment.controller.ts`
- Changes:
  - Em `create`, incluir `usePlan` na desestruturação do body e repassar ao service:
    ```ts
    const { clientId, client, serviceId, date, notes, adminId, usePlan } = req.body;
    ```
    ```ts
    const newAppointment = await appointmentService.createAppointment({
        clientId: clientIntId,
        clientData: client,
        serviceId: serviceIntId,
        requestedDateTime: appointmentDate,
        notes: notes,
        adminId: adminIntId,
        usePlan: usePlan === true,
    });
    ```
- Notes/Constraints:
  - `usePlan === true` normaliza qualquer valor não-`true` (undefined, string, etc.) para `false`,
    evitando truthiness inesperada vinda de um body mal formado.
- Reuse:
  - Estrutura de `try/catch` já existente no método, inalterada.

### `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`
- Changes:
  - No bloco já existente que renderiza o link condicional de "Usuários" (`dono`/`admin`), adicionar
    logo abaixo um novo link:
    ```tsx
    {(auth.user?.userType === 'dono' || auth.user?.userType === 'admin') && (
      <Link href="/barber/planos">
        <button className={styles.refreshButton} style={{ marginRight: '1rem' }}>Planos</button>
      </Link>
    )}
    ```
- Notes/Constraints:
  - Mesmo padrão visual/estrutural dos links já existentes (`Métricas`, `Configurações`,
    `Usuários`).
- Reuse:
  - `styles.refreshButton`, `next/link` e `auth` já disponíveis no arquivo.

### `barbearia-shelby-frontend/src/app/meus-servicos/components/ClientDashboard.tsx`
- Changes:
  - Importar o novo componente:
    ```tsx
    import MySubscription from './MySubscription';
    ```
  - Renderizar `<MySubscription />` logo após a abertura de `<div className={styles.container}>` e
    `<h1>Meus Agendamentos</h1>`, antes da primeira `<section>` ("Próximos Agendamentos"):
    ```tsx
    <h1>Meus Agendamentos</h1>
    <MySubscription />
    <section className={styles.section}>
    ```
- Notes/Constraints:
  - Não altera nenhuma lógica existente de paginação/listagem de agendamentos.
- Reuse:
  - `styles.container`/`styles.section` do próprio `ClientDashboard.module.scss`, inalterados.

### `barbearia-shelby-frontend/src/hooks/useClientData.tsx`
- Changes:
  - No tipo `Appointment`, adicionar:
    ```ts
    subscription?: { id: number; plan: { id: number; name: string } } | null;
    ```
- Notes/Constraints:
  - Puramente aditivo — nenhum outro campo/lógica do hook muda.
- Reuse:
  - N/A.

### `barbearia-shelby-frontend/src/app/meus-servicos/components/ClientAppointmentCard.tsx`
- Changes:
  - Dentro de `<div className={styles.cardBody}>`, logo após a linha de `notes`, adicionar:
    ```tsx
    {appointment.subscription && (
      <p><strong>Pago com:</strong> Plano {appointment.subscription.plan.name}</p>
    )}
    ```
- Notes/Constraints:
  - Reaproveita o estilo já existente de `p`/`strong` dentro de `.cardBody`
    (`ClientAppointmentCard.module.scss`) — nenhuma classe CSS nova necessária.
- Reuse:
  - Estrutura/estilo já existente do componente.

### `barbearia-shelby-frontend/src/app/agendamento/page.tsx`
- Changes:
  - Importar o hook:
    ```tsx
    import { useSubscription } from '@/hooks/useSubscription';
    ```
  - No corpo do componente, junto aos outros hooks/estados:
    ```tsx
    const { subscription } = useSubscription();
    const [usePlanToggle, setUsePlanToggle] = useState(true);
    ```
  - No tipo local `BookingPayload` (dentro de `handleBookingSubmit`), adicionar:
    ```ts
    usePlan?: boolean;
    ```
  - No ramo `else` (cliente logado, não-staff) da montagem de `appointmentPayload` dentro de
    `handleBookingSubmit`, incluir `usePlan` condicionalmente:
    ```tsx
    } else {
      appointmentPayload = {
        serviceId: selectedService.id,
        date: appointmentDateString,
        clientId: auth.user.id,
        adminId: selectedBarber?.id,
        notes: data.notes,
        ...(subscription && subscription.cutsRemaining > 0 && usePlanToggle ? { usePlan: true } : {}),
      };
    }
    ```
  - No passo 4 (`step === 4`), dentro do bloco `<div className={styles.summary}>...</div>`, logo
    depois dele e antes de `<AgendamentoForm ... />`, adicionar o toggle condicional:
    ```tsx
    {subscription && subscription.cutsRemaining > 0 && (
      <label className={styles.planToggle}>
        <input
          type="checkbox"
          checked={usePlanToggle}
          onChange={(e) => setUsePlanToggle(e.target.checked)}
        />
        Usar meu plano ({subscription.cutsRemaining} corte{subscription.cutsRemaining > 1 ? 's' : ''} restante{subscription.cutsRemaining > 1 ? 's' : ''} neste ciclo)
      </label>
    )}
    ```
- Notes/Constraints:
  - `useSubscription()` já internamente só busca dados quando `auth.user?.userType === 'cliente'` —
    não precisa de nenhuma checagem adicional de `isStaffBooking` aqui; para staff/convidado,
    `subscription` permanece `null` e o toggle nunca renderiza.
  - O ramo `if (isStaffBooking) { ... }` (staff logado reservando, possivelmente para um convidado)
    **não é alterado** — plano nunca se aplica a esse fluxo.
  - O ramo de convidado não-autenticado (`else` mais externo) também não é alterado.
- Reuse:
  - Hook `useSubscription` (novo, mas já desenhado para ser genérico o suficiente para esta reutilização
    — mesma instância de dados já usada em `/meus-servicos`).

### `barbearia-shelby-frontend/src/app/agendamento/agendamento-moderno.module.scss`
- Changes:
  - Adicionar ao final do arquivo:
    ```scss
    .planToggle {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin: 1rem 0;
      font-size: 0.95rem;
      cursor: pointer;

      input[type='checkbox'] {
        width: 1.1rem;
        height: 1.1rem;
        cursor: pointer;
      }
    }
    ```
- Notes/Constraints:
  - Classe nova, isolada — não altera nenhuma regra existente no arquivo.
- Reuse:
  - N/A (arquivo não lido por completo nesta Spec; a nova classe é adicionada ao final, sem
    depender de nenhum seletor pré-existente).

## Files to Create

### `barbearia-backend/src/utils/subscriptionCycle.ts`
- Purpose:
  - Função pura que calcula o ciclo mensal "vigente" de uma assinatura a partir do último ciclo
    conhecido, sem side effects — reaproveitada tanto na leitura (`subscriptionService.getMine`,
    sem persistir) quanto no consumo (`appointmentService.createAppointment`, que persiste o
    resultado dentro da transação).
- Contents:
  ```ts
  import { addMonths } from 'date-fns';

  export type CycleState = {
      cycleStart: Date;
      cycleEnd: Date;
      cutsUsed: number;
  };

  // Ciclo mensal "flutuante": reinicia sempre na mesma data do ciclo anterior (ex.: assinou dia 15,
  // ciclo sempre vira no dia 15 do mês seguinte), não no dia 1. Cortes não usados não acumulam para
  // o próximo ciclo — cada virada zera o contador.
  export function resolveCurrentCycle(
      lastKnownCycleStart: Date,
      cutsUsedInLastKnownCycle: number,
      now: Date = new Date()
  ): CycleState {
      let cycleStart = lastKnownCycleStart;
      let cutsUsed = cutsUsedInLastKnownCycle;
      let cycleEnd = addMonths(cycleStart, 1);

      while (cycleEnd <= now) {
          cycleStart = cycleEnd;
          cutsUsed = 0;
          cycleEnd = addMonths(cycleStart, 1);
      }

      return { cycleStart, cycleEnd, cutsUsed };
  }
  ```
- Integration points:
  - Consumido por `subscriptionService.ts` e `appointmentService.ts`.

### `barbearia-backend/src/services/planService.ts`
- Purpose:
  - Regras de negócio do catálogo `Plan`, mesmo espírito de `userService.ts` (toggle `active`, sem
    hard delete).
- Contents:
  ```ts
  import { CustomError } from '../utils/customErrors';
  import { prisma } from './prisma.service';
  import { Prisma } from '@prisma/client';

  export type CreatePlanData = {
      name: string;
      description?: string;
      cutsPerCycle: number;
      price: number;
      benefits?: string;
  };

  export type UpdatePlanData = Partial<{
      name: string;
      description: string;
      cutsPerCycle: number;
      price: number;
      benefits: string;
      active: boolean;
  }>;

  function validateCutsAndPrice(cutsPerCycle: unknown, price: unknown) {
      if (typeof cutsPerCycle !== 'number' || !Number.isInteger(cutsPerCycle) || cutsPerCycle <= 0) {
          throw new CustomError('Cortes por ciclo deve ser um número inteiro maior que zero.', 400);
      }
      if (typeof price !== 'number' || price < 0) {
          throw new CustomError('Preço inválido.', 400);
      }
  }

  export class PlanService {
      // Lista pública — só planos ativos, para quem pode assinar.
      async listActive() {
          return prisma.plan.findMany({ where: { active: true }, orderBy: { price: 'asc' } });
      }

      // Lista completa (inclui inativos) — para a página de gestão (DONO/ADMIN).
      async listAll() {
          return prisma.plan.findMany({ orderBy: { createdAt: 'desc' } });
      }

      async findById(id: number) {
          const plan = await prisma.plan.findUnique({ where: { id } });
          if (!plan) throw new CustomError('Plano não encontrado.', 404);
          return plan;
      }

      async create(data: CreatePlanData) {
          if (!data.name) {
              throw new CustomError('Nome do plano é obrigatório.', 400);
          }
          validateCutsAndPrice(data.cutsPerCycle, data.price);

          return prisma.plan.create({
              data: {
                  name: data.name,
                  description: data.description,
                  cutsPerCycle: data.cutsPerCycle,
                  price: data.price,
                  benefits: data.benefits,
              },
          });
      }

      async update(id: number, data: UpdatePlanData) {
          const existing = await prisma.plan.findUnique({ where: { id } });
          if (!existing) {
              throw new CustomError('Plano não encontrado.', 404);
          }

          if (data.cutsPerCycle !== undefined || data.price !== undefined) {
              validateCutsAndPrice(
                  data.cutsPerCycle !== undefined ? data.cutsPerCycle : existing.cutsPerCycle,
                  data.price !== undefined ? data.price : existing.price
              );
          }

          const updateData: Prisma.PlanUpdateInput = {};
          if (data.name !== undefined) updateData.name = data.name;
          if (data.description !== undefined) updateData.description = data.description;
          if (data.cutsPerCycle !== undefined) updateData.cutsPerCycle = data.cutsPerCycle;
          if (data.price !== undefined) updateData.price = data.price;
          if (data.benefits !== undefined) updateData.benefits = data.benefits;
          if (data.active !== undefined) updateData.active = data.active;

          return prisma.plan.update({ where: { id }, data: updateData });
      }
  }
  ```
- Integration points:
  - Consumido por `plan.controller.ts`.

### `barbearia-backend/src/controllers/plan.controller.ts`
- Purpose:
  - Handlers HTTP de `Plan`, mesmo padrão try/catch de `user.controller.ts`/`holiday.controller.ts`.
- Contents:
  ```ts
  import { Request, Response } from 'express';
  import { PlanService } from '../services/planService';
  import { CustomError } from '../utils/customErrors';

  export class PlanController {
      private service = new PlanService();

      listActive = async (_req: Request, res: Response) => {
          try {
              const plans = await this.service.listActive();
              return res.status(200).json(plans);
          } catch (err: any) {
              console.error('Error listing plans:', err);
              return res.status(500).json({ error: 'Failed to list plans.' });
          }
      };

      listAll = async (_req: Request, res: Response) => {
          try {
              const plans = await this.service.listAll();
              return res.status(200).json(plans);
          } catch (err: any) {
              console.error('Error listing all plans:', err);
              return res.status(500).json({ error: 'Failed to list plans.' });
          }
      };

      getById = async (req: Request, res: Response) => {
          try {
              const id = parseInt(req.params.id as string, 10);
              if (isNaN(id)) {
                  return res.status(400).json({ error: 'ID de plano inválido.' });
              }
              const plan = await this.service.findById(id);
              return res.status(200).json(plan);
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error getting plan:', err);
              return res.status(500).json({ error: 'Failed to get plan.' });
          }
      };

      create = async (req: Request, res: Response) => {
          try {
              const { name, description, cutsPerCycle, price, benefits } = req.body;
              const plan = await this.service.create({ name, description, cutsPerCycle, price, benefits });
              return res.status(201).json(plan);
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error creating plan:', err);
              return res.status(500).json({ error: 'Failed to create plan.' });
          }
      };

      update = async (req: Request, res: Response) => {
          try {
              const id = parseInt(req.params.id as string, 10);
              if (isNaN(id)) {
                  return res.status(400).json({ error: 'ID de plano inválido.' });
              }
              const plan = await this.service.update(id, req.body);
              return res.status(200).json(plan);
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error updating plan:', err);
              return res.status(500).json({ error: 'Failed to update plan.' });
          }
      };
  }
  ```
- Integration points:
  - Consumido por `plan.routes.ts`.

### `barbearia-backend/src/routes/plan.routes.ts`
- Purpose:
  - Rotas de `Plan`: leitura pública (catálogo ativo, e detalhe por id), escrita restrita a
    `DONO`/`ADMIN`.
- Contents:
  ```ts
  import { Router } from 'express';
  import { PlanController } from '../controllers/plan.controller';
  import authMiddleware from '../middlewares/auth.middleware';
  import requireRole from '../middlewares/requireRole.middleware';

  const router = Router();
  const controller = new PlanController();

  // Leitura pública: só planos ativos (catálogo para quem pode assinar).
  router.get('/', controller.listActive);
  // Gestão (DONO/ADMIN): todos os planos, inclusive inativos. Precisa vir antes de "/:id".
  router.get('/all', authMiddleware, requireRole('DONO', 'ADMIN'), controller.listAll);
  router.get('/:id', controller.getById);
  router.post('/', authMiddleware, requireRole('DONO', 'ADMIN'), controller.create);
  router.put('/:id', authMiddleware, requireRole('DONO', 'ADMIN'), controller.update);

  export default router;
  ```
- Integration points:
  - Montado em `routes/index.ts` como `/plans`.

### `barbearia-backend/src/services/subscriptionService.ts`
- Purpose:
  - Regras de negócio de `ClientSubscription`: assinar, ver a própria assinatura (com estado do
    ciclo vigente computado), cancelar.
- Contents:
  ```ts
  import { CustomError } from '../utils/customErrors';
  import { prisma } from './prisma.service';
  import { resolveCurrentCycle } from '../utils/subscriptionCycle';

  type SubscriptionWithPlan = {
      id: number;
      status: string;
      startDate: Date;
      currentCycleStart: Date;
      cutsUsedInCycle: number;
      plan: {
          id: number;
          name: string;
          description: string | null;
          cutsPerCycle: number;
          price: number;
          benefits: string | null;
          active: boolean;
      };
  };

  export class SubscriptionService {
      async subscribe(clientId: number, planId: number) {
          const plan = await prisma.plan.findUnique({ where: { id: planId } });
          if (!plan || !plan.active) {
              throw new CustomError('Plano não encontrado ou indisponível.', 404);
          }

          const existingActive = await prisma.clientSubscription.findFirst({
              where: { clientId, status: 'ACTIVE' },
          });
          if (existingActive) {
              throw new CustomError(
                  'Você já possui uma assinatura ativa. Cancele-a antes de assinar outro plano.',
                  409
              );
          }

          const now = new Date();
          const subscription = await prisma.clientSubscription.create({
              data: {
                  clientId,
                  planId,
                  status: 'ACTIVE',
                  startDate: now,
                  currentCycleStart: now,
                  cutsUsedInCycle: 0,
              },
              include: { plan: true },
          });

          return this.toSummary(subscription, now);
      }

      async getMine(clientId: number) {
          const subscription = await prisma.clientSubscription.findFirst({
              where: { clientId, status: 'ACTIVE' },
              include: { plan: true },
              orderBy: { createdAt: 'desc' },
          });
          if (!subscription) return null;

          return this.toSummary(subscription, new Date());
      }

      async cancelMine(clientId: number) {
          const subscription = await prisma.clientSubscription.findFirst({
              where: { clientId, status: 'ACTIVE' },
          });
          if (!subscription) {
              throw new CustomError('Você não possui uma assinatura ativa.', 404);
          }
          return prisma.clientSubscription.update({
              where: { id: subscription.id },
              data: { status: 'CANCELLED' },
          });
      }

      // Monta um resumo com o estado do ciclo vigente (sem persistir — a persistência do rollover
      // só acontece no momento de um consumo real, em AppointmentService.createAppointment).
      private toSummary(subscription: SubscriptionWithPlan, now: Date) {
          const { cycleStart, cycleEnd, cutsUsed } = resolveCurrentCycle(
              subscription.currentCycleStart,
              subscription.cutsUsedInCycle,
              now
          );
          return {
              id: subscription.id,
              status: subscription.status,
              startDate: subscription.startDate,
              plan: subscription.plan,
              cycleStart,
              cycleEnd,
              cutsUsed,
              cutsRemaining: Math.max(subscription.plan.cutsPerCycle - cutsUsed, 0),
          };
      }
  }
  ```
- Integration points:
  - Consumido por `subscription.controller.ts`.

### `barbearia-backend/src/controllers/subscription.controller.ts`
- Purpose:
  - Handlers HTTP de `ClientSubscription`, sempre a partir do `req.user.id` (nunca de um id vindo do
    body/params — só o próprio cliente autenticado).
- Contents:
  ```ts
  import { Request, Response } from 'express';
  import { SubscriptionService } from '../services/subscriptionService';
  import { CustomError } from '../utils/customErrors';

  export class SubscriptionController {
      private service = new SubscriptionService();

      subscribe = async (req: Request, res: Response) => {
          try {
              if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
              const planId = parseInt(req.body.planId, 10);
              if (isNaN(planId)) {
                  return res.status(400).json({ error: 'planId inválido.' });
              }
              const subscription = await this.service.subscribe(req.user.id, planId);
              return res.status(201).json(subscription);
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error subscribing to plan:', err);
              return res.status(500).json({ error: 'Failed to subscribe to plan.' });
          }
      };

      getMine = async (req: Request, res: Response) => {
          try {
              if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
              const subscription = await this.service.getMine(req.user.id);
              return res.status(200).json(subscription);
          } catch (err: any) {
              console.error('Error getting subscription:', err);
              return res.status(500).json({ error: 'Failed to get subscription.' });
          }
      };

      cancelMine = async (req: Request, res: Response) => {
          try {
              if (!req.user) return res.status(401).json({ error: 'Não autenticado.' });
              await this.service.cancelMine(req.user.id);
              return res.status(204).send();
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error cancelling subscription:', err);
              return res.status(500).json({ error: 'Failed to cancel subscription.' });
          }
      };
  }
  ```
- Integration points:
  - Consumido por `subscription.routes.ts`.

### `barbearia-backend/src/routes/subscription.routes.ts`
- Purpose:
  - Rotas de `ClientSubscription`, todas `CLIENTE`-only (dono nunca assina em nome de cliente).
- Contents:
  ```ts
  import { Router } from 'express';
  import { SubscriptionController } from '../controllers/subscription.controller';
  import authMiddleware from '../middlewares/auth.middleware';
  import requireRole from '../middlewares/requireRole.middleware';

  const router = Router();
  const controller = new SubscriptionController();

  router.post('/', authMiddleware, requireRole('CLIENTE'), controller.subscribe);
  router.get('/me', authMiddleware, requireRole('CLIENTE'), controller.getMine);
  router.patch('/me/cancel', authMiddleware, requireRole('CLIENTE'), controller.cancelMine);

  export default router;
  ```
- Integration points:
  - Montado em `routes/index.ts` como `/subscriptions`.

### `barbearia-shelby-frontend/src/hooks/usePlans.tsx`
- Purpose:
  - Hook de dados para `/barber/planos`, mesmo padrão de `useUsers.tsx`.
- Contents:
  ```tsx
  import { useState, useEffect, useCallback } from 'react';
  import api from '@/services/api';
  import { useAuth } from '@/context/AuthContext';

  export type Plan = {
    id: number;
    name: string;
    description: string | null;
    cutsPerCycle: number;
    price: number;
    benefits: string | null;
    active: boolean;
    createdAt: string;
    updatedAt: string;
  };

  export type CreatePlanPayload = {
    name: string;
    description?: string;
    cutsPerCycle: number;
    price: number;
    benefits?: string;
  };

  export type UpdatePlanPayload = Partial<{
    name: string;
    description: string;
    cutsPerCycle: number;
    price: number;
    benefits: string;
    active: boolean;
  }>;

  export function usePlans() {
    const auth = useAuth();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getHeaders = useCallback(() => {
      return auth?.token ? { Authorization: `Bearer ${auth.token}` } : undefined;
    }, [auth?.token]);

    const extractErrorMessage = (err: unknown, fallback: string) => {
      if (typeof err === 'object' && err !== null) {
        const maybeErr = err as { response?: { data?: { error?: string } }; message?: string };
        return maybeErr.response?.data?.error || maybeErr.message || fallback;
      }
      return fallback;
    };

    const fetchAll = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = getHeaders();
        const res = await api.get<Plan[]>('/plans/all', { headers });
        setPlans(res.data);
      } catch (err) {
        setError(extractErrorMessage(err, 'Erro ao carregar planos.'));
      } finally {
        setLoading(false);
      }
    }, [getHeaders]);

    const createPlan = useCallback(
      async (payload: CreatePlanPayload) => {
        setError(null);
        try {
          const headers = getHeaders();
          await api.post('/plans', payload, { headers });
          await fetchAll();
        } catch (err) {
          const message = extractErrorMessage(err, 'Erro ao criar plano.');
          setError(message);
          throw new Error(message);
        }
      },
      [getHeaders, fetchAll]
    );

    const updatePlan = useCallback(
      async (id: number, payload: UpdatePlanPayload) => {
        setError(null);
        try {
          const headers = getHeaders();
          const res = await api.put<Plan>(`/plans/${id}`, payload, { headers });
          setPlans((prev) => prev.map((p) => (p.id === id ? res.data : p)));
        } catch (err) {
          const message = extractErrorMessage(err, 'Erro ao atualizar plano.');
          setError(message);
          throw new Error(message);
        }
      },
      [getHeaders]
    );

    const toggleActive = useCallback(
      async (id: number, active: boolean) => {
        await updatePlan(id, { active });
      },
      [updatePlan]
    );

    useEffect(() => {
      fetchAll();
    }, [fetchAll]);

    return { plans, loading, error, setError, refetch: fetchAll, createPlan, updatePlan, toggleActive };
  }
  ```
- Integration points:
  - Consumido por `app/barber/planos/page.tsx` e `PlanFormModal.tsx` (tipos).

### `barbearia-shelby-frontend/src/app/barber/planos/layout.tsx`
- Purpose:
  - Guarda de rota adicional (`dono`/`admin`-only), idêntica à de `barber/usuarios/layout.tsx`.
- Contents:
  ```tsx
  import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
  import React from 'react';

  export default function PlanosLayout({ children }: { children: React.ReactNode }) {
    return (
      <ProtectedRoute allowedUserType={['dono', 'admin']}>
        {children}
      </ProtectedRoute>
    );
  }
  ```
- Integration points:
  - Envolve `app/barber/planos/page.tsx`; herda o guard de `app/barber/layout.tsx`.

### `barbearia-shelby-frontend/src/app/barber/planos/PlanFormModal.tsx`
- Purpose:
  - Modal único para criar/editar plano.
- Contents:
  ```tsx
  'use client';

  import React, { useState } from 'react';
  import styles from './Planos.module.scss';
  import { Plan, CreatePlanPayload, UpdatePlanPayload } from '@/hooks/usePlans';

  type Props = {
    plan?: Plan | null;
    onClose: () => void;
    onCreate: (data: CreatePlanPayload) => Promise<void>;
    onUpdate: (id: number, data: UpdatePlanPayload) => Promise<void>;
  };

  export default function PlanFormModal({ plan, onClose, onCreate, onUpdate }: Props) {
    const isEditing = !!plan;
    const [name, setName] = useState(plan?.name ?? '');
    const [description, setDescription] = useState(plan?.description ?? '');
    const [cutsPerCycle, setCutsPerCycle] = useState(plan?.cutsPerCycle?.toString() ?? '');
    const [price, setPrice] = useState(plan?.price?.toString() ?? '');
    const [benefits, setBenefits] = useState(plan?.benefits ?? '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      const cuts = parseInt(cutsPerCycle, 10);
      const priceValue = parseFloat(price);

      if (!name.trim()) {
        setFormError('Nome é obrigatório.');
        return;
      }
      if (isNaN(cuts) || cuts <= 0) {
        setFormError('Cortes por ciclo deve ser um número inteiro maior que zero.');
        return;
      }
      if (isNaN(priceValue) || priceValue < 0) {
        setFormError('Preço inválido.');
        return;
      }

      setIsSubmitting(true);
      try {
        if (isEditing && plan) {
          await onUpdate(plan.id, {
            name,
            description: description || undefined,
            cutsPerCycle: cuts,
            price: priceValue,
            benefits: benefits || undefined,
          });
        } else {
          await onCreate({
            name,
            description: description || undefined,
            cutsPerCycle: cuts,
            price: priceValue,
            benefits: benefits || undefined,
          });
        }
        onClose();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Erro ao salvar plano.');
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <h2>{isEditing ? 'Editar Plano' : 'Novo Plano'}</h2>
          {formError && <p className={styles.formError}>{formError}</p>}
          <form onSubmit={handleSubmit}>
            <div className={styles.inputGroup}>
              <label htmlFor="name">Nome</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="description">Descrição (opcional)</label>
              <input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="cutsPerCycle">Cortes por ciclo (mensal)</label>
              <input
                id="cutsPerCycle"
                type="number"
                min={1}
                step={1}
                value={cutsPerCycle}
                onChange={(e) => setCutsPerCycle(e.target.value)}
                required
              />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="price">Preço (R$)</label>
              <input
                id="price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="benefits">Benefícios (opcional)</label>
              <textarea id="benefits" value={benefits} onChange={(e) => setBenefits(e.target.value)} rows={3} />
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={onClose}>Cancelar</button>
              <button type="submit" className={styles.saveButton} disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
  ```
- Integration points:
  - Consumido por `app/barber/planos/page.tsx`; estilizado por `Planos.module.scss`.

### `barbearia-shelby-frontend/src/app/barber/planos/page.tsx`
- Purpose:
  - Página principal: listagem + criar/editar/ativar/desativar.
- Contents:
  ```tsx
  'use client';

  import React, { useState } from 'react';
  import { usePlans, Plan } from '@/hooks/usePlans';
  import PlanFormModal from './PlanFormModal';
  import ConfirmationModal from '../components/BarberDashboard/ConfirmationModal';
  import styles from './Planos.module.scss';

  export default function PlanosPage() {
    const { plans, loading, error, createPlan, updatePlan, toggleActive } = usePlans();
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [creating, setCreating] = useState(false);
    const [pendingToggle, setPendingToggle] = useState<Plan | null>(null);

    const handleConfirmToggle = async () => {
      if (!pendingToggle) return;
      await toggleActive(pendingToggle.id, !pendingToggle.active);
      setPendingToggle(null);
    };

    return (
      <main className={styles.container}>
        <h1>Planos</h1>
        {error && <p className={styles.error}>{error}</p>}
        {loading && <p>Carregando...</p>}

        <div className={styles.toolbar}>
          <div />
          <button className={styles.addButton} onClick={() => setCreating(true)}>Novo Plano</button>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Cortes/ciclo</th>
              <th>Preço</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.cutsPerCycle}</td>
                <td>R$ {p.price.toFixed(2).replace('.', ',')}</td>
                <td>
                  <span className={p.active ? styles.statusActive : styles.statusInactive}>
                    {p.active ? 'Ativo' : 'Desativado'}
                  </span>
                </td>
                <td className={styles.actionsCell}>
                  <button className={styles.editButton} onClick={() => setEditingPlan(p)}>Editar</button>
                  <button
                    className={p.active ? styles.deactivateButton : styles.activateButton}
                    onClick={() => setPendingToggle(p)}
                  >
                    {p.active ? 'Desativar' : 'Reativar'}
                  </button>
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr>
                <td colSpan={5}>Nenhum plano cadastrado.</td>
              </tr>
            )}
          </tbody>
        </table>

        {(creating || editingPlan) && (
          <PlanFormModal
            plan={editingPlan}
            onClose={() => {
              setCreating(false);
              setEditingPlan(null);
            }}
            onCreate={createPlan}
            onUpdate={updatePlan}
          />
        )}

        <ConfirmationModal
          isOpen={!!pendingToggle}
          onClose={() => setPendingToggle(null)}
          onConfirm={handleConfirmToggle}
          title={pendingToggle?.active ? 'Desativar plano' : 'Reativar plano'}
          message={
            pendingToggle
              ? `Tem certeza que deseja ${pendingToggle.active ? 'desativar' : 'reativar'} o plano "${pendingToggle.name}"?`
              : ''
          }
        />
      </main>
    );
  }
  ```
- Integration points:
  - Consome `usePlans`, `PlanFormModal` (novo) e `ConfirmationModal` (já existente, importado de
    `../components/BarberDashboard/ConfirmationModal`, mesmo caminho relativo já usado por
    `barber/usuarios/page.tsx`).

### `barbearia-shelby-frontend/src/app/barber/planos/Planos.module.scss`
- Purpose:
  - Estilos da página e do modal — mesmos tokens de `Usuarios.module.scss`, com `textarea` incluído
    no seletor de `.inputGroup` (benefícios).
- Contents:
  ```scss
  // src/app/barber/planos/Planos.module.scss

  $card-bg: #1e1e1e;
  $modal-bg: #1e1e1e;
  $border-color: #3a3a3a;
  $text-color: #f0f0f0;
  $text-muted: #a0a0a0;
  $brand-color: #f67366;
  $input-bg: #2a2a2a;
  $success-color: #4caf82;
  $danger-color: #e05a4e;

  %button-base {
    padding: 0.6rem 1.25rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease, transform 0.2s ease;

    &:hover {
      transform: translateY(-2px);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
  }

  .container {
    padding: 2rem;
    max-width: 1000px;
    margin: 0 auto;
    font-family: 'Poppins', sans-serif;
    color: $text-color;

    h1 {
      margin-bottom: 2rem;
      text-align: center;
    }
  }

  .error {
    background-color: rgba(#f67366, 0.15);
    border: 1px solid $brand-color;
    color: $brand-color;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .addButton {
    @extend %button-base;
    background-color: $brand-color;
    color: white;
  }

  .table {
    width: 100%;
    border-collapse: collapse;
    background-color: $card-bg;
    border: 1px solid $border-color;
    border-radius: 12px;
    overflow: hidden;

    th, td {
      text-align: left;
      padding: 0.9rem 1rem;
      border-top: 1px solid $border-color;
    }

    th {
      color: $text-muted;
      font-size: 0.85rem;
      text-transform: uppercase;
      border-top: none;
    }

    tbody tr:first-child td {
      border-top: none;
    }
  }

  .statusActive {
    color: $success-color;
    font-weight: 600;
  }

  .statusInactive {
    color: $danger-color;
    font-weight: 600;
  }

  .actionsCell {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .editButton {
    @extend %button-base;
    background-color: $input-bg;
    color: $text-color;
    padding: 0.4rem 0.9rem;
  }

  .deactivateButton {
    @extend %button-base;
    background-color: $danger-color;
    color: white;
    padding: 0.4rem 0.9rem;
  }

  .activateButton {
    @extend %button-base;
    background-color: $success-color;
    color: white;
    padding: 0.4rem 0.9rem;
  }

  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background-color: $modal-bg;
    padding: 2rem;
    border-radius: 12px;
    width: 100%;
    max-width: 420px;
    color: $text-color;

    h2 {
      margin-bottom: 1.5rem;
      text-align: center;
    }
  }

  .formError {
    background-color: rgba(#f67366, 0.15);
    border: 1px solid $brand-color;
    color: $brand-color;
    padding: 0.6rem 0.9rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    text-align: center;
    font-size: 0.9rem;
  }

  .inputGroup {
    margin-bottom: 1rem;

    label {
      display: block;
      margin-bottom: 0.5rem;
      color: $text-muted;
      font-size: 0.9rem;
    }

    input, select, textarea {
      width: 100%;
      padding: 0.75rem;
      background-color: $input-bg;
      border: 1px solid $border-color;
      border-radius: 8px;
      color: $text-color;
      font-size: 1rem;
      outline: none;
      font-family: inherit;
      resize: vertical;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;

      &:focus {
        border-color: $brand-color;
        box-shadow: 0 0 0 3px rgba($brand-color, 0.25);
      }
    }
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 2rem;
  }

  .saveButton {
    @extend %button-base;
    background-color: $brand-color;
    color: white;
  }

  .cancelButton {
    @extend %button-base;
    background-color: $border-color;
    color: $text-color;
  }
  ```
- Integration points:
  - Importado por `page.tsx` e `PlanFormModal.tsx`.

### `barbearia-shelby-frontend/src/hooks/useSubscription.tsx`
- Purpose:
  - Hook de dados client-only para a assinatura do cliente logado, mesmo padrão de
    `useClientData.tsx` (só busca quando `auth.user?.userType === 'cliente'`).
- Contents:
  ```tsx
  'use client';

  import { useState, useEffect, useCallback } from 'react';
  import api from '@/services/api';
  import { useAuth } from '@/context/AuthContext';

  export type PlanSummary = {
    id: number;
    name: string;
    description: string | null;
    cutsPerCycle: number;
    price: number;
    benefits: string | null;
    active: boolean;
  };

  export type MySubscription = {
    id: number;
    status: 'ACTIVE' | 'CANCELLED';
    startDate: string;
    plan: PlanSummary;
    cycleStart: string;
    cycleEnd: string;
    cutsUsed: number;
    cutsRemaining: number;
  };

  export function useSubscription() {
    const auth = useAuth();
    const [subscription, setSubscription] = useState<MySubscription | null>(null);
    const [availablePlans, setAvailablePlans] = useState<PlanSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const getHeaders = useCallback(() => {
      return auth?.token ? { Authorization: `Bearer ${auth.token}` } : undefined;
    }, [auth?.token]);

    const extractErrorMessage = (err: unknown, fallback: string) => {
      if (typeof err === 'object' && err !== null) {
        const maybeErr = err as { response?: { data?: { error?: string } }; message?: string };
        return maybeErr.response?.data?.error || maybeErr.message || fallback;
      }
      return fallback;
    };

    const fetchAll = useCallback(async () => {
      if (!auth.user || auth.user.userType !== 'cliente') {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const headers = getHeaders();
        const [subRes, plansRes] = await Promise.all([
          api.get<MySubscription | null>('/subscriptions/me', { headers }),
          api.get<PlanSummary[]>('/plans'),
        ]);
        setSubscription(subRes.data);
        setAvailablePlans(plansRes.data || []);
      } catch (err) {
        setError(extractErrorMessage(err, 'Erro ao carregar seu plano.'));
      } finally {
        setLoading(false);
      }
    }, [getHeaders, auth.user]);

    const subscribe = useCallback(
      async (planId: number) => {
        setError(null);
        try {
          const headers = getHeaders();
          await api.post('/subscriptions', { planId }, { headers });
          await fetchAll();
        } catch (err) {
          const message = extractErrorMessage(err, 'Erro ao assinar plano.');
          setError(message);
          throw new Error(message);
        }
      },
      [getHeaders, fetchAll]
    );

    const cancelSubscription = useCallback(async () => {
      setError(null);
      try {
        const headers = getHeaders();
        await api.patch('/subscriptions/me/cancel', {}, { headers });
        await fetchAll();
      } catch (err) {
        const message = extractErrorMessage(err, 'Erro ao cancelar assinatura.');
        setError(message);
        throw new Error(message);
      }
    }, [getHeaders, fetchAll]);

    useEffect(() => {
      fetchAll();
    }, [fetchAll]);

    return { subscription, availablePlans, loading, error, refetch: fetchAll, subscribe, cancelSubscription };
  }
  ```
- Integration points:
  - Consumido por `app/meus-servicos/components/MySubscription.tsx` e `app/agendamento/page.tsx`.

### `barbearia-shelby-frontend/src/app/meus-servicos/components/MySubscription.tsx`
- Purpose:
  - Seção "Meu Plano" dentro de `/meus-servicos`: assina, mostra ciclo atual, cancela.
- Contents:
  ```tsx
  'use client';

  import React, { useState } from 'react';
  import { useSubscription } from '@/hooks/useSubscription';
  import ConfirmationModal from '@/app/barber/components/BarberDashboard/ConfirmationModal';
  import styles from './MySubscription.module.scss';

  export default function MySubscription() {
    const { subscription, availablePlans, loading, error, subscribe, cancelSubscription } = useSubscription();
    const [confirmingCancel, setConfirmingCancel] = useState(false);
    const [subscribingError, setSubscribingError] = useState<string | null>(null);

    const handleSubscribe = async (planId: number) => {
      setSubscribingError(null);
      try {
        await subscribe(planId);
      } catch (err) {
        setSubscribingError(err instanceof Error ? err.message : 'Erro ao assinar plano.');
      }
    };

    if (loading) {
      return (
        <section className={styles.section}>
          <h2>Meu Plano</h2>
          <p>Carregando...</p>
        </section>
      );
    }

    return (
      <section className={styles.section}>
        <h2>Meu Plano</h2>
        {error && <p className={styles.error}>{error}</p>}
        {subscribingError && <p className={styles.error}>{subscribingError}</p>}

        {subscription ? (
          <div className={styles.currentPlan}>
            <h3>{subscription.plan.name}</h3>
            {subscription.plan.description && <p>{subscription.plan.description}</p>}
            {subscription.plan.benefits && <p className={styles.benefits}>{subscription.plan.benefits}</p>}
            <p>
              <strong>{subscription.cutsRemaining}</strong> de <strong>{subscription.plan.cutsPerCycle}</strong> cortes
              disponíveis neste ciclo.
            </p>
            <p className={styles.cycleInfo}>
              Ciclo atual reinicia em {new Date(subscription.cycleEnd).toLocaleDateString('pt-BR')}.
            </p>
            <button className={styles.cancelButton} onClick={() => setConfirmingCancel(true)}>
              Cancelar assinatura
            </button>
          </div>
        ) : (
          <div className={styles.availablePlans}>
            {availablePlans.length === 0 ? (
              <p>Nenhum plano disponível no momento.</p>
            ) : (
              availablePlans.map((plan) => (
                <div key={plan.id} className={styles.planCard}>
                  <h3>{plan.name}</h3>
                  {plan.description && <p>{plan.description}</p>}
                  {plan.benefits && <p className={styles.benefits}>{plan.benefits}</p>}
                  <p><strong>{plan.cutsPerCycle}</strong> cortes/mês</p>
                  <p><strong>R$ {plan.price.toFixed(2).replace('.', ',')}</strong>/mês</p>
                  <button className={styles.subscribeButton} onClick={() => handleSubscribe(plan.id)}>
                    Assinar
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <ConfirmationModal
          isOpen={confirmingCancel}
          onClose={() => setConfirmingCancel(false)}
          onConfirm={async () => {
            await cancelSubscription();
            setConfirmingCancel(false);
          }}
          title="Cancelar assinatura"
          message={`Tem certeza que deseja cancelar sua assinatura do plano "${subscription?.plan.name}"?`}
        />
      </section>
    );
  }
  ```
- Integration points:
  - Consumido por `app/meus-servicos/components/ClientDashboard.tsx`; reaproveita
    `ConfirmationModal` já existente (`app/barber/components/BarberDashboard/ConfirmationModal`).

### `barbearia-shelby-frontend/src/app/meus-servicos/components/MySubscription.module.scss`
- Purpose:
  - Estilos da seção "Meu Plano" — mesmos tokens de `ClientDashboard.module.scss`.
- Contents:
  ```scss
  // src/app/meus-servicos/components/MySubscription.module.scss

  $brand-color: #f67366;
  $card-bg: #1e1e1e;
  $text-color: #f0f0f0;
  $text-muted: #a0a0a0;
  $border-color: #3a3a3a;
  $error-color: #dc3545;
  $success-color: #4caf82;

  .section {
    margin-bottom: 3rem;

    h2 {
      font-size: 1.5rem;
      color: $brand-color;
      margin-bottom: 1.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid $border-color;
    }
  }

  .error {
    color: $error-color;
    text-align: center;
    font-weight: 500;
    margin-bottom: 1rem;
  }

  .currentPlan, .planCard {
    background-color: $card-bg;
    border: 1px solid $border-color;
    border-radius: 12px;
    padding: 1.5rem;

    h3 {
      color: $text-color;
      margin-bottom: 0.5rem;
    }

    p {
      color: $text-muted;
      margin: 0.4rem 0;

      strong {
        color: $text-color;
      }
    }
  }

  .benefits {
    white-space: pre-line;
  }

  .cycleInfo {
    font-size: 0.9rem;
  }

  .availablePlans {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }

  .cancelButton {
    margin-top: 1rem;
    padding: 0.6rem 1.25rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    background-color: $error-color;
    color: white;

    &:hover {
      opacity: 0.9;
    }
  }

  .subscribeButton {
    margin-top: 1rem;
    padding: 0.6rem 1.25rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    background-color: $success-color;
    color: white;

    &:hover {
      opacity: 0.9;
    }
  }
  ```
- Integration points:
  - Importado por `MySubscription.tsx`.

## Implementation Order (recommended)
1. `prisma/schema.prisma` — `SubscriptionStatus`, `Plan`, `ClientSubscription`,
   `User.subscriptions`, `Appointment.subscriptionId`.
2. `npx prisma migrate dev --name add_plans_and_subscriptions` + revisão do SQL gerado.
3. `barbearia-backend`: `npm run build` (checkpoint).
4. `subscriptionCycle.ts`, `planService.ts`, `plan.controller.ts`, `plan.routes.ts`, montagem em
   `routes/index.ts`.
5. `barbearia-backend`: `npm run build` (checkpoint).
6. `subscriptionService.ts`, `subscription.controller.ts`, `subscription.routes.ts`, montagem em
   `routes/index.ts`.
7. `barbearia-backend`: `npm run build` (checkpoint).
8. `appointmentService.ts` (consumo de plano + `select`/`include`), `appointment.controller.ts`
   (`usePlan`).
9. `barbearia-backend`: `npm run build` (checkpoint).
10. `usePlans.tsx`, `barber/planos/{layout.tsx,PlanFormModal.tsx,page.tsx,Planos.module.scss}`,
    `BarberHeader.tsx` (link).
11. `useSubscription.tsx`, `meus-servicos/components/{MySubscription.tsx,
    MySubscription.module.scss}`, `ClientDashboard.tsx`, `useClientData.tsx`,
    `ClientAppointmentCard.tsx`.
12. `agendamento/page.tsx` + `agendamento-moderno.module.scss` (toggle).
13. `barbearia-shelby-frontend`: `npm run build` e `npx eslint src`.
14. Walkthrough manual completo (dono cadastra plano; cliente assina; cliente consome corte via
    agendamento; cliente esgota ciclo e paga avulso; cliente cancela assinatura) + regra transversal.

## Validation (commands / checks)
- `barbearia-backend`: `npx prisma migrate dev`, `npm run build`.
- `barbearia-shelby-frontend`: `npm run build`, `npx eslint src`.
- Sem testes automatizados existentes para este fluxo em nenhum dos repos — validação funcional é
  manual via navegador/API, como nos epics anteriores.

## Notes
- Mudança de contrato de API: rotas novas e aditivas (`/api/plans*`, `/api/subscriptions*`);
  `POST /api/appointments` ganha um campo opcional `usePlan` (aditivo, retrocompatível). A sinalizar
  ao usuário (regra do `CLAUDE.md` raiz sobre mudanças de contrato entre os repos).
- `src/controllers/billing.controller.ts`, `src/prisma/seed.ts` e o arquivo órfão
  `src/prisma/schema.prisma` não são tocados por esta Spec.
