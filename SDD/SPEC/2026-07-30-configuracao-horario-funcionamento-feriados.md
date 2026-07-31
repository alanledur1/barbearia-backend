SPEC PATH: barbearia-backend/SDD/SPEC/2026-07-30-configuracao-horario-funcionamento-feriados.md

# Spec — Configuração de horário de funcionamento e CRUD de feriados com bloqueio de agendamento nas datas configuradas

## Objective
- Substituir `validateBusinessHours` (hardcoded 9h–20h, mesmo horário todo dia) por uma versão que lê a configuração de `BusinessHours` (uma linha por dia da semana) do banco.
- Bloquear a criação/reagendamento de agendamentos em datas cadastradas em `Holiday`.
- Expor CRUD de `BusinessHours` (leitura + atualização em lote) e `Holiday` (listar/criar/excluir) via API, restrito ao papel `DONO`.
- Criar uma página de configurações no frontend, acessível somente ao papel `dono`, para editar essas duas entidades.

## Scope
**In**
- `barbearia-backend/prisma/schema.prisma`
- `barbearia-backend/src/prisma/seed.ts`
- `barbearia-backend/src/services/appointmentService.ts`
- `barbearia-backend/src/services/businessHoursService.ts` (novo)
- `barbearia-backend/src/services/holidayService.ts` (novo)
- `barbearia-backend/src/controllers/businessHours.controller.ts` (novo)
- `barbearia-backend/src/controllers/holiday.controller.ts` (novo)
- `barbearia-backend/src/routes/businessHours.routes.ts` (novo)
- `barbearia-backend/src/routes/holiday.routes.ts` (novo)
- `barbearia-backend/src/routes/index.ts`
- `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx` (novo)
- `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx` (novo)
- `barbearia-shelby-frontend/src/app/barber/configuracoes/page.tsx` (novo)
- `barbearia-shelby-frontend/src/app/barber/configuracoes/Configuracoes.module.scss` (novo)
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`

**Out**
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx` — nenhuma mudança (decisão de escopo, ver PRD/Plan).
- Horário por barbeiro individual.
- Feriados recorrentes.
- Acesso de `ADMIN` à página de configurações (Epic 5).
- `useBarberData.tsx`, `BillingDashboard.tsx`, `billing.controller.ts`, CRUD de usuários.

## Files to Modify

### `barbearia-backend/prisma/schema.prisma`
- Changes:
  - Adicionar, após o `model Otp`:
    ```prisma
    model BusinessHours {
      id        Int      @id @default(autoincrement())
      dayOfWeek Int      @unique
      openTime  String
      closeTime String
      isClosed  Boolean  @default(false)
      updatedAt DateTime @updatedAt
    }

    model Holiday {
      id        Int      @id @default(autoincrement())
      date      DateTime @unique @db.Date
      reason    String?
      createdAt DateTime @default(now())
    }
    ```
  - `dayOfWeek`: `0`=domingo ... `6`=sábado (mesma convenção de `Date.prototype.getUTCDay()`, usada no cálculo em `appointmentService.ts`).
  - `openTime`/`closeTime`: string `"HH:mm"` (24h), validada na camada de serviço/controller (não no schema).
  - `Holiday.date`: `@db.Date` (sem componente de hora) — evita ambiguidade de fuso horário; a conversão para "dia BRT" acontece no código antes de gravar/consultar.
- Notes/Constraints:
  - Tabelas 100% novas — migration só adiciona (`CREATE TABLE`), sem tocar `User`/`Service`/`Appointment`/`Otp`.
- Reuse:
  - Convenções de nomenclatura já usadas no schema (`PascalCase` para models, `camelCase` para campos, `@id @default(autoincrement())`).

### `barbearia-backend/src/prisma/seed.ts`
- Changes:
  - Após a criação dos 3 usuários, adicionar:
    ```ts
    const weekdays = [0, 1, 2, 3, 4, 5, 6];
    for (const dayOfWeek of weekdays) {
      await prisma.businessHours.upsert({
        where: { dayOfWeek },
        update: {},
        create: { dayOfWeek, openTime: '09:00', closeTime: '20:00', isClosed: false },
      });
    }
    console.log('✅ Horário de funcionamento padrão (9h-20h, todo dia) garantido.');
    ```
- Notes/Constraints:
  - `update: {}` (igual ao padrão já usado para os usuários) — não sobrescreve configuração já existente se o seed for rodado de novo.
- Reuse:
  - Mesmo padrão `upsert` já usado para `dono`/`admin`/`barbeiro` no mesmo arquivo.

### `barbearia-backend/src/services/appointmentService.ts`
- Changes:
  - Adicionar, no topo do arquivo, uma função auxiliar de módulo (fora da classe) para converter `"HH:mm"` em minutos:
    ```ts
    function parseTimeToMinutes(time: string): number {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    }
    ```
  - Reescrever `validateBusinessHours` para `private async` (assinatura igual, corpo novo):
    ```ts
    private async validateBusinessHours(start: Date, durationMinutes: number) {
        const endDate = new Date(start.getTime() + durationMinutes * 60 * 1000);
        const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
        const startBRT = new Date(start.getTime() - BRT_OFFSET_MS);
        const endBRT = new Date(endDate.getTime() - BRT_OFFSET_MS);

        const dayOfWeek = startBRT.getUTCDay();
        const startMinutes = startBRT.getUTCHours() * 60 + startBRT.getUTCMinutes();
        const endMinutes = endBRT.getUTCHours() * 60 + endBRT.getUTCMinutes();

        const businessHours = await prisma.businessHours.findUnique({ where: { dayOfWeek } });

        // Fallback de segurança: se não houver linha configurada para o dia (não deveria
        // acontecer após o seed), usa o horário padrão anterior (9h-20h), sem bloquear agendamentos.
        const openTime = businessHours?.openTime ?? '09:00';
        const closeTime = businessHours?.closeTime ?? '20:00';
        const isClosed = businessHours?.isClosed ?? false;

        if (isClosed) {
            throw new CustomError('A barbearia não funciona neste dia da semana.', 400);
        }

        if (startMinutes < parseTimeToMinutes(openTime)) {
            throw new CustomError(`Agendamentos permitidos apenas a partir das ${openTime}.`, 400);
        }

        if (endMinutes > parseTimeToMinutes(closeTime)) {
            throw new CustomError(`Agendamentos permitidos até as ${closeTime}.`, 400);
        }
    }
    ```
  - Adicionar novo método privado, logo abaixo:
    ```ts
    private async validateNotHoliday(start: Date) {
        const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
        const startBRT = new Date(start.getTime() - BRT_OFFSET_MS);
        const dateOnly = new Date(Date.UTC(startBRT.getUTCFullYear(), startBRT.getUTCMonth(), startBRT.getUTCDate()));

        const holiday = await prisma.holiday.findUnique({ where: { date: dateOnly } });
        if (holiday) {
            throw new CustomError('A barbearia está fechada nesta data (feriado).', 400);
        }
    }
    ```
  - `createAppointment`: trocar `this.validateBusinessHours(requestedDateTime, service.duration);` (linha ~158) por:
    ```ts
    await this.validateBusinessHours(requestedDateTime, service.duration);
    await this.validateNotHoliday(requestedDateTime);
    ```
  - `update`: trocar `this.validateBusinessHours(newStartDate, newDuration);` (linha ~253) por:
    ```ts
    await this.validateBusinessHours(newStartDate, newDuration);
    await this.validateNotHoliday(newStartDate);
    ```
- Notes/Constraints:
  - `createAppointment`/`update` já são `async` — os novos `await` não mudam a assinatura pública desses métodos.
  - Manter a lógica de cálculo de `startHourBRT`/deslocamento de fuso consistente com o resto do arquivo (mesma constante de 3 horas já usada implicitamente hoje).
  - Não alterar `checkAvailability` (fora de escopo, já filtra por `adminId` desde o Epic 1).
  - Mensagens de erro em português, mesmo padrão de `CustomError` já usado no arquivo.
- Reuse:
  - `CustomError` (já importado).
  - `prisma` (já importado de `./prisma.service`).

### `barbearia-backend/src/routes/index.ts`
- Changes:
  - Importar os dois novos routers:
    ```ts
    import businessHoursRoutes from './businessHours.routes';
    import holidayRoutes from './holiday.routes';
    ```
  - Montar, junto aos outros `router.use(...)`:
    ```ts
    router.use('/business-hours', businessHoursRoutes);
    router.use('/holidays', holidayRoutes);
    ```
- Notes/Constraints:
  - Seguir a ordem/estilo já usado para `clients`/`services`/`appointments`/`admin`.
- Reuse:
  - Padrão de `router.use('/<área>', <router>)` já existente no arquivo.

### `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`
- Changes:
  - Importar `useAuth`: `import { useAuth } from '@/context/AuthContext';`.
  - Dentro do componente, `const auth = useAuth();`.
  - No bloco de botões de navegação (ao lado de `Faturamento`), adicionar, condicionado a `auth.user?.userType === 'dono'`:
    ```tsx
    {auth.user?.userType === 'dono' && (
      <Link href="/barber/configuracoes">
        <button className={styles.refreshButton} style={{ marginRight: '1rem' }}>Configurações</button>
      </Link>
    )}
    ```
- Notes/Constraints:
  - Mesmo padrão visual/estrutural dos outros dois botões de `Link` já existentes no arquivo (`Novo Agendamento`, `Faturamento`).
- Reuse:
  - `styles.refreshButton`, `next/link` (já importado).

## Files to Create

### `barbearia-backend/src/services/businessHoursService.ts`
- Purpose:
  - Camada fina sobre `prisma.businessHours`, seguindo o padrão de `serviceService.ts`.
- Contents:
  ```ts
  import { CustomError } from '../utils/customErrors';
  import { prisma } from './prisma.service';

  export type BusinessHoursEntry = {
      dayOfWeek: number;
      openTime: string;
      closeTime: string;
      isClosed: boolean;
  };

  const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

  export class BusinessHoursService {
      async listAll() {
          return prisma.businessHours.findMany({ orderBy: { dayOfWeek: 'asc' } });
      }

      async updateBulk(entries: BusinessHoursEntry[]) {
          if (!Array.isArray(entries) || entries.length !== 7) {
              throw new CustomError('É necessário enviar exatamente 7 entradas (uma por dia da semana).', 400);
          }

          const seenDays = new Set<number>();
          for (const entry of entries) {
              if (typeof entry.dayOfWeek !== 'number' || entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
                  throw new CustomError('dayOfWeek inválido (deve ser 0-6).', 400);
              }
              if (seenDays.has(entry.dayOfWeek)) {
                  throw new CustomError(`Dia da semana duplicado no payload: ${entry.dayOfWeek}.`, 400);
              }
              seenDays.add(entry.dayOfWeek);

              if (!TIME_REGEX.test(entry.openTime) || !TIME_REGEX.test(entry.closeTime)) {
                  throw new CustomError('Horário inválido (formato esperado: HH:mm).', 400);
              }
              if (!entry.isClosed) {
                  const [openH, openM] = entry.openTime.split(':').map(Number);
                  const [closeH, closeM] = entry.closeTime.split(':').map(Number);
                  if (openH * 60 + openM >= closeH * 60 + closeM) {
                      throw new CustomError(
                          `Horário de abertura deve ser antes do fechamento (dia ${entry.dayOfWeek}).`,
                          400
                      );
                  }
              }
          }

          return prisma.$transaction(
              entries.map((entry) =>
                  prisma.businessHours.upsert({
                      where: { dayOfWeek: entry.dayOfWeek },
                      update: {
                          openTime: entry.openTime,
                          closeTime: entry.closeTime,
                          isClosed: entry.isClosed,
                      },
                      create: {
                          dayOfWeek: entry.dayOfWeek,
                          openTime: entry.openTime,
                          closeTime: entry.closeTime,
                          isClosed: entry.isClosed,
                      },
                  })
              )
          );
      }
  }
  ```
- Integration points:
  - Consumido por `businessHours.controller.ts`.

### `barbearia-backend/src/services/holidayService.ts`
- Purpose:
  - Camada fina sobre `prisma.holiday`, seguindo o padrão de `serviceService.ts`.
- Contents:
  ```ts
  import { CustomError } from '../utils/customErrors';
  import { prisma } from './prisma.service';

  export class HolidayService {
      async listAll() {
          return prisma.holiday.findMany({ orderBy: { date: 'asc' } });
      }

      async create(data: { date: string; reason?: string }) {
          const parsedDate = new Date(data.date);
          if (isNaN(parsedDate.getTime())) {
              throw new CustomError('Data inválida.', 400);
          }
          const dateOnly = new Date(Date.UTC(
              parsedDate.getUTCFullYear(),
              parsedDate.getUTCMonth(),
              parsedDate.getUTCDate()
          ));

          try {
              return await prisma.holiday.create({
                  data: { date: dateOnly, reason: data.reason },
              });
          } catch (error: any) {
              if (error.code === 'P2002') {
                  throw new CustomError('Já existe um feriado cadastrado para esta data.', 409);
              }
              throw error;
          }
      }

      async delete(id: number) {
          try {
              return await prisma.holiday.delete({ where: { id } });
          } catch (error: any) {
              if (error.code === 'P2025') {
                  throw new CustomError('Feriado não encontrado.', 404);
              }
              throw error;
          }
      }
  }
  ```
- Integration points:
  - Consumido por `holiday.controller.ts`.

### `barbearia-backend/src/controllers/businessHours.controller.ts`
- Purpose:
  - Handlers HTTP para `BusinessHours`, mesmo padrão try/catch de `admin.controller.ts`/`service.controller.ts`.
- Contents:
  ```ts
  import { Request, Response } from 'express';
  import { BusinessHoursService } from '../services/businessHoursService';
  import { CustomError } from '../utils/customErrors';

  export class BusinessHoursController {
      private service = new BusinessHoursService();

      listAll = async (_req: Request, res: Response) => {
          try {
              const businessHours = await this.service.listAll();
              return res.status(200).json(businessHours);
          } catch (err: any) {
              console.error('Error listing business hours:', err);
              return res.status(500).json({ error: 'Failed to retrieve business hours.' });
          }
      };

      updateBulk = async (req: Request, res: Response) => {
          try {
              const updated = await this.service.updateBulk(req.body);
              return res.status(200).json(updated);
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error updating business hours:', err);
              return res.status(500).json({ error: 'Failed to update business hours.' });
          }
      };
  }
  ```
- Integration points:
  - Consumido por `businessHours.routes.ts`.

### `barbearia-backend/src/controllers/holiday.controller.ts`
- Purpose:
  - Handlers HTTP para `Holiday`, mesmo padrão try/catch de `service.controller.ts`.
- Contents:
  ```ts
  import { Request, Response } from 'express';
  import { HolidayService } from '../services/holidayService';
  import { CustomError } from '../utils/customErrors';

  export class HolidayController {
      private service = new HolidayService();

      listAll = async (_req: Request, res: Response) => {
          try {
              const holidays = await this.service.listAll();
              return res.status(200).json(holidays);
          } catch (err: any) {
              console.error('Error listing holidays:', err);
              return res.status(500).json({ error: 'Failed to retrieve holidays.' });
          }
      };

      create = async (req: Request, res: Response) => {
          try {
              const { date, reason } = req.body;
              if (!date) {
                  return res.status(400).json({ error: 'A data é obrigatória.' });
              }
              const holiday = await this.service.create({ date, reason });
              return res.status(201).json(holiday);
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error creating holiday:', err);
              return res.status(500).json({ error: 'Failed to create holiday.' });
          }
      };

      delete = async (req: Request, res: Response) => {
          try {
              const { id } = req.params;
              const holidayId = parseInt(id as string, 10);
              if (isNaN(holidayId)) {
                  return res.status(400).json({ error: 'ID de feriado inválido.' });
              }
              await this.service.delete(holidayId);
              return res.status(204).send();
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error deleting holiday:', err);
              return res.status(500).json({ error: 'Failed to delete holiday.' });
          }
      };
  }
  ```
- Integration points:
  - Consumido por `holiday.routes.ts`.

### `barbearia-backend/src/routes/businessHours.routes.ts`
- Purpose:
  - Rotas de `BusinessHours`, restritas a `DONO`.
- Contents:
  ```ts
  import { Router } from 'express';
  import { BusinessHoursController } from '../controllers/businessHours.controller';
  import authMiddleware from '../middlewares/auth.middleware';
  import requireRole from '../middlewares/requireRole.middleware';

  const router = Router();
  const controller = new BusinessHoursController();

  router.get('/', authMiddleware, requireRole('DONO'), controller.listAll);
  router.put('/', authMiddleware, requireRole('DONO'), controller.updateBulk);

  export default router;
  ```
- Integration points:
  - Montado em `routes/index.ts` como `/business-hours`.

### `barbearia-backend/src/routes/holiday.routes.ts`
- Purpose:
  - Rotas de `Holiday`, restritas a `DONO`.
- Contents:
  ```ts
  import { Router } from 'express';
  import { HolidayController } from '../controllers/holiday.controller';
  import authMiddleware from '../middlewares/auth.middleware';
  import requireRole from '../middlewares/requireRole.middleware';

  const router = Router();
  const controller = new HolidayController();

  router.get('/', authMiddleware, requireRole('DONO'), controller.listAll);
  router.post('/', authMiddleware, requireRole('DONO'), controller.create);
  router.delete('/:id', authMiddleware, requireRole('DONO'), controller.delete);

  export default router;
  ```
- Integration points:
  - Montado em `routes/index.ts` como `/holidays`.

### `barbearia-shelby-frontend/src/hooks/useBusinessSettings.tsx`
- Purpose:
  - Hook de dados para a página de configurações, mesmo padrão de `useBarberData.tsx` (`getHeaders`, estados de loading/erro, funções assíncronas que recarregam a lista ao final).
- Contents:
  ```tsx
  import { useState, useEffect, useCallback } from 'react';
  import api from '@/services/api';
  import { useAuth } from '@/context/AuthContext';

  export type BusinessHoursDay = {
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  };

  export type Holiday = { id: number; date: string; reason?: string | null };

  const DEFAULT_DAYS: BusinessHoursDay[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: '09:00',
    closeTime: '20:00',
    isClosed: false,
  }));

  export function useBusinessSettings() {
    const auth = useAuth();
    const [businessHours, setBusinessHours] = useState<BusinessHoursDay[]>(DEFAULT_DAYS);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
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
        const [hoursRes, holidaysRes] = await Promise.all([
          api.get<BusinessHoursDay[]>('/business-hours', { headers }),
          api.get<Holiday[]>('/holidays', { headers }),
        ]);
        // Mescla com DEFAULT_DAYS para garantir 7 linhas mesmo se alguma ainda não existir no banco.
        const byDay = new Map(hoursRes.data.map((d) => [d.dayOfWeek, d]));
        setBusinessHours(DEFAULT_DAYS.map((d) => byDay.get(d.dayOfWeek) ?? d));
        setHolidays(holidaysRes.data);
      } catch (err) {
        setError(extractErrorMessage(err, 'Erro ao carregar configurações.'));
      } finally {
        setLoading(false);
      }
    }, [getHeaders]);

    const saveBusinessHours = useCallback(
      async (entries: BusinessHoursDay[]) => {
        setError(null);
        try {
          const headers = getHeaders();
          const res = await api.put<BusinessHoursDay[]>('/business-hours', entries, { headers });
          setBusinessHours(res.data);
        } catch (err) {
          const message = extractErrorMessage(err, 'Erro ao salvar horário de funcionamento.');
          setError(message);
          throw new Error(message);
        }
      },
      [getHeaders]
    );

    const addHoliday = useCallback(
      async (date: string, reason?: string) => {
        setError(null);
        try {
          const headers = getHeaders();
          await api.post('/holidays', { date, reason }, { headers });
          await fetchAll();
        } catch (err) {
          const message = extractErrorMessage(err, 'Erro ao cadastrar feriado.');
          setError(message);
          throw new Error(message);
        }
      },
      [getHeaders, fetchAll]
    );

    const removeHoliday = useCallback(
      async (id: number) => {
        setError(null);
        try {
          const headers = getHeaders();
          await api.delete(`/holidays/${id}`, { headers });
          setHolidays((prev) => prev.filter((h) => h.id !== id));
        } catch (err) {
          setError(extractErrorMessage(err, 'Erro ao remover feriado.'));
        }
      },
      [getHeaders]
    );

    useEffect(() => {
      fetchAll();
    }, [fetchAll]);

    return { businessHours, holidays, loading, error, setError, refetch: fetchAll, saveBusinessHours, addHoliday, removeHoliday };
  }
  ```
- Integration points:
  - Consumido por `app/barber/configuracoes/page.tsx`.

### `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx`
- Purpose:
  - Guarda de rota adicional (`dono`-only), aninhada dentro da guarda já existente de `/barber` (`['barbeiro','dono','admin']`).
- Contents:
  ```tsx
  import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
  import React from 'react';

  export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
    return (
      <ProtectedRoute allowedUserType={['dono']}>
        {children}
      </ProtectedRoute>
    );
  }
  ```
- Integration points:
  - Envolve `app/barber/configuracoes/page.tsx`; herda o `<ProtectedRoute allowedUserType={['barbeiro','dono','admin']}>` de `app/barber/layout.tsx` (a checagem mais restrita desta camada prevalece na prática, pois ambas redirecionam para `/Login` se não autorizado).

### `barbearia-shelby-frontend/src/app/barber/configuracoes/page.tsx`
- Purpose:
  - Página de configurações: formulário de horário por dia da semana + CRUD de feriados.
- Contents (estrutura; nomes de dias em português, `dayOfWeek` 0=domingo):
  ```tsx
  'use client';

  import React, { useState } from 'react';
  import { useBusinessSettings, BusinessHoursDay } from '@/hooks/useBusinessSettings';
  import styles from './Configuracoes.module.scss';

  const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  export default function ConfiguracoesPage() {
    const { businessHours, holidays, loading, error, saveBusinessHours, addHoliday, removeHoliday } = useBusinessSettings();
    const [draft, setDraft] = useState<BusinessHoursDay[]>(businessHours);
    const [saving, setSaving] = useState(false);
    const [holidayDate, setHolidayDate] = useState('');
    const [holidayReason, setHolidayReason] = useState('');

    // Sincroniza o rascunho quando os dados carregam/mudam do servidor.
    React.useEffect(() => { setDraft(businessHours); }, [businessHours]);

    const updateDraftDay = (dayOfWeek: number, patch: Partial<BusinessHoursDay>) => {
      setDraft((prev) => prev.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)));
    };

    const handleSaveHours = async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      try {
        await saveBusinessHours(draft);
      } catch {
        // erro já fica em `error` do hook
      } finally {
        setSaving(false);
      }
    };

    const handleAddHoliday = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!holidayDate) return;
      try {
        await addHoliday(holidayDate, holidayReason || undefined);
        setHolidayDate('');
        setHolidayReason('');
      } catch {
        // erro já fica em `error` do hook
      }
    };

    return (
      <main className={styles.container}>
        <h1>Configurações</h1>
        {error && <p className={styles.error}>{error}</p>}
        {loading && <p>Carregando...</p>}

        <section className={styles.section}>
          <h2>Horário de Funcionamento</h2>
          <form onSubmit={handleSaveHours}>
            {draft.map((day) => (
              <div key={day.dayOfWeek} className={styles.dayRow}>
                <span className={styles.dayLabel}>{DAY_LABELS[day.dayOfWeek]}</span>
                <label>
                  <input
                    type="checkbox"
                    checked={day.isClosed}
                    onChange={(e) => updateDraftDay(day.dayOfWeek, { isClosed: e.target.checked })}
                  />
                  Fechado
                </label>
                <input
                  type="time"
                  value={day.openTime}
                  disabled={day.isClosed}
                  onChange={(e) => updateDraftDay(day.dayOfWeek, { openTime: e.target.value })}
                />
                <span>até</span>
                <input
                  type="time"
                  value={day.closeTime}
                  disabled={day.isClosed}
                  onChange={(e) => updateDraftDay(day.dayOfWeek, { closeTime: e.target.value })}
                />
              </div>
            ))}
            <button type="submit" className={styles.saveButton} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Horário'}
            </button>
          </form>
        </section>

        <section className={styles.section}>
          <h2>Feriados / Bloqueios</h2>
          <form onSubmit={handleAddHoliday} className={styles.holidayForm}>
            <input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} required />
            <input
              type="text"
              placeholder="Motivo (opcional)"
              value={holidayReason}
              onChange={(e) => setHolidayReason(e.target.value)}
            />
            <button type="submit" className={styles.addButton}>Adicionar</button>
          </form>
          <ul className={styles.holidayList}>
            {holidays.map((h) => (
              <li key={h.id}>
                <span>{new Date(h.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                {h.reason && <span> — {h.reason}</span>}
                <button onClick={() => removeHoliday(h.id)} className={styles.deleteButton}>Remover</button>
              </li>
            ))}
            {holidays.length === 0 && <li>Nenhum feriado cadastrado.</li>}
          </ul>
        </section>
      </main>
    );
  }
  ```
- Integration points:
  - Consome `useBusinessSettings`; estilizado por `Configuracoes.module.scss`.
  - `new Date(h.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })` — evita que o navegador desloque a data (que vem como `YYYY-MM-DDT00:00:00.000Z`, `@db.Date`) para o dia anterior devido ao fuso local.

### `barbearia-shelby-frontend/src/app/barber/configuracoes/Configuracoes.module.scss`
- Purpose:
  - Estilos da nova página, reaproveitando os tokens visuais já usados em `Billing.module.scss`/`EditServiceModal.module.scss` (cores, espaçamento, botões) em vez de introduzir um sistema novo.
- Contents:
  - Classes mínimas necessárias para o markup acima: `.container`, `.section`, `.dayRow`, `.dayLabel`, `.saveButton`, `.holidayForm`, `.holidayList`, `.addButton`, `.deleteButton`, `.error`. Copiar a paleta de cores/espaçamento (`padding`, `border-radius`, cores de botão) diretamente de `Billing.module.scss` para manter consistência visual com o restante de `/barber`.
- Integration points:
  - Importado por `page.tsx`.

## Implementation Order (recommended)
1. `prisma/schema.prisma` — modelos `BusinessHours`/`Holiday`.
2. `npx prisma migrate dev --name add_business_hours_and_holiday` + revisão do SQL gerado.
3. `prisma/seed.ts` — upsert dos defaults + `npm run seed`.
4. `businessHoursService.ts`, `holidayService.ts`.
5. `businessHours.controller.ts`, `holiday.controller.ts`.
6. `businessHours.routes.ts`, `holiday.routes.ts`, montagem em `routes/index.ts`.
7. `barbearia-backend`: `npm run build` (checkpoint).
8. `appointmentService.ts` — `validateBusinessHours` async + `validateNotHoliday` + `await` nos 2 call sites.
9. `barbearia-backend`: `npm run build` de novo (checkpoint).
10. `useBusinessSettings.tsx`, `barber/configuracoes/layout.tsx`, `barber/configuracoes/page.tsx`, `Configuracoes.module.scss`.
11. `BarberHeader.tsx` — link condicional.
12. `barbearia-shelby-frontend`: `npm run build` e `npx eslint src`.
13. Walkthrough manual (dono, barbeiro, admin, cliente, visitante) + testes de rejeição via API (horário/feriado).

## Validation (commands / checks)
- `barbearia-backend`: `npx prisma migrate dev`, `npm run build`.
- `barbearia-shelby-frontend`: `npm run build`, `npx eslint src`.
- Sem testes automatizados existentes para este fluxo em nenhum dos repos — validação funcional é manual via navegador/API, como no Epic 1.

## Notes
- O fluxo público de agendamento (`/agendamento`) não consome `BusinessHours`/`Holiday` nesta execução — a rejeição acontece só no backend, no momento da criação/reagendamento (`POST`/`PATCH /appointments`). Isso é uma decisão de escopo explícita (ver PRD/Plan), não uma lacuna a ser corrigida por esta Spec.
- Mudança de contrato de API: 2 grupos de rotas novos e aditivos (`/api/business-hours`, `/api/holidays`), restritos a `DONO`. `POST /api/appointments`/`PATCH /api/appointments/:id` ganham um novo motivo possível de erro 400, mas mantêm o mesmo formato de resposta de erro já usado hoje.
