# Spec — Página de agenda diária estilo Google Calendar/Outlook consumindo agendamentos, horário de funcionamento e feriados

## Objective
- Liberar leitura de `BusinessHours`/`Holiday` para o papel `BARBEIRO` (rotas `GET`), mantendo as
  rotas de escrita restritas a `DONO`/`ADMIN`.
- Criar uma página `/barber/agenda` (barbeiro/dono/admin) com grid diário de horas, blocos de
  agendamento posicionados por horário/duração reais, navegação entre dias e seletor de barbeiro,
  usando `BusinessHours`/`Holiday` para sombrear/bloquear visualmente o que está fora do
  expediente.

## Scope
**In**
- 2 alterações de 1 linha em rotas backend (`businessHours.routes.ts`, `holiday.routes.ts`).
- Novo hook `useDailyAgenda.tsx`.
- Nova página `/barber/agenda` (`page.tsx` + `AgendaGrid.tsx` + `Agenda.module.scss`).
- Novo link no `BarberHeader.tsx`.

**Out**
- Qualquer mutação de agendamento a partir da agenda (criar/editar/concluir/cancelar/excluir).
- Novo endpoint de leitura agregada no backend.
- Mudanças em `PUT /business-hours`, `POST/DELETE /holidays`, `AppointmentService`, wizard
  `/agendamento`, `prisma/schema.prisma`.

## Files to Modify

### `barbearia-backend/src/routes/businessHours.routes.ts`
- Changes:
  - Linha 9: trocar `requireRole('DONO', 'ADMIN')` por `requireRole('BARBEIRO', 'DONO', 'ADMIN')`
    na rota `GET /`.
  ```ts
  router.get('/', authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'), controller.listAll);
  router.put('/', authMiddleware, requireRole('DONO', 'ADMIN'), controller.updateBulk);
  ```
- Notes/Constraints:
  - Não alterar a rota `PUT /` (linha 10) — continua `requireRole('DONO', 'ADMIN')`.
  - Nenhuma mudança em `businessHours.controller.ts`/`businessHoursService.ts`.
- Reuse:
  - `authMiddleware`, `requireRole`, `controller` já importados/instanciados no topo do arquivo.

### `barbearia-backend/src/routes/holiday.routes.ts`
- Changes:
  - Linha 9: trocar `requireRole('DONO', 'ADMIN')` por `requireRole('BARBEIRO', 'DONO', 'ADMIN')`
    na rota `GET /`.
  ```ts
  router.get('/', authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'), controller.listAll);
  router.post('/', authMiddleware, requireRole('DONO', 'ADMIN'), controller.create);
  router.delete('/:id', authMiddleware, requireRole('DONO', 'ADMIN'), controller.delete);
  ```
- Notes/Constraints:
  - Não alterar `POST /` (linha 10) nem `DELETE /:id` (linha 11) — continuam `DONO`/`ADMIN`-only.
  - Nenhuma mudança em `holiday.controller.ts`/`holidayService.ts`.
- Reuse:
  - `authMiddleware`, `requireRole`, `controller` já importados/instanciados no topo do arquivo.

### `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`
- Changes:
  - Adicionar um novo `<Link href="/barber/agenda">`, **sem** condicional de papel (mesmo padrão
    de "Novo Agendamento"/"Faturamento"), posicionado antes desses dois links existentes:
  ```tsx
  <Link href="/barber/agenda">
    <button className={styles.refreshButton} style={{ marginRight: '1rem' }}>Agenda</button>
  </Link>
  <Link href="/agendamento">
    <button className={styles.refreshButton} style={{ marginRight: '1rem' }}>Novo Agendamento</button>
  </Link>
  ```
- Notes/Constraints:
  - Reusar exatamente a classe `styles.refreshButton` e o padrão `style={{ marginRight: '1rem' }}`
    já usados pelos outros links do mesmo grupo, para consistência visual.
- Reuse:
  - `Link` (next/link) e `styles` já importados no topo do arquivo.

## Files to Create

### `barbearia-shelby-frontend/src/hooks/useDailyAgenda.tsx`
- Purpose:
  - Hook dedicado que busca os dados estáticos da agenda (barbeiros, horário de funcionamento,
    feriados) uma vez e os agendamentos do dia sempre que a data (`dateKey`) muda.
- Contents:
  ```tsx
  'use client';

  import { useState, useEffect, useCallback } from 'react';
  import api from '@/services/api';
  import { useAuth } from '@/context/AuthContext';

  export type AgendaBarber = { id: number; name: string };

  export type AgendaBusinessHoursDay = {
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  };

  export type AgendaHoliday = { id: number; date: string; reason?: string | null };

  export type AgendaAppointment = {
    id: number;
    date: string;
    endDate: string;
    durationMinutes: number;
    status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
    notes?: string | null;
    guestName?: string | null;
    guestEmail?: string | null;
    guestPhone?: string | null;
    client?: { id: number; name: string; email?: string | null; phone?: string | null } | null;
    service?: { id: number; name: string; duration: number; price: number } | null;
    admin?: { id: number; name: string; email?: string | null } | null;
  };

  const DEFAULT_BUSINESS_HOURS: AgendaBusinessHoursDay[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: '09:00',
    closeTime: '20:00',
    isClosed: false,
  }));

  function extractErrorMessage(err: unknown, fallback: string) {
    if (typeof err === 'object' && err !== null) {
      const maybeErr = err as { response?: { data?: { error?: string } }; message?: string };
      return maybeErr.response?.data?.error || maybeErr.message || fallback;
    }
    return fallback;
  }

  export function useDailyAgenda(dateKey: string) {
    const auth = useAuth();
    const [barbers, setBarbers] = useState<AgendaBarber[]>([]);
    const [businessHours, setBusinessHours] = useState<AgendaBusinessHoursDay[]>(DEFAULT_BUSINESS_HOURS);
    const [holidays, setHolidays] = useState<AgendaHoliday[]>([]);
    const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getHeaders = useCallback(() => {
      return auth?.token ? { Authorization: `Bearer ${auth.token}` } : undefined;
    }, [auth?.token]);

    // Barbeiros, horário de funcionamento e feriados mudam raramente — busca uma vez por sessão.
    useEffect(() => {
      const fetchStatic = async () => {
        try {
          const headers = getHeaders();
          const [barbersRes, hoursRes, holidaysRes] = await Promise.all([
            api.get<AgendaBarber[]>('/appointments/barbers'),
            api.get<AgendaBusinessHoursDay[]>('/business-hours', { headers }),
            api.get<AgendaHoliday[]>('/holidays', { headers }),
          ]);
          setBarbers(barbersRes.data);
          const byDay = new Map(hoursRes.data.map((d) => [d.dayOfWeek, d]));
          setBusinessHours(DEFAULT_BUSINESS_HOURS.map((d) => byDay.get(d.dayOfWeek) ?? d));
          setHolidays(holidaysRes.data);
        } catch (err) {
          setError(extractErrorMessage(err, 'Erro ao carregar configurações da agenda.'));
        }
      };
      fetchStatic();
    }, [getHeaders]);

    // Agendamentos do dia selecionado — refaz a cada troca de data.
    const fetchAppointments = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = getHeaders();
        const res = await api.get<AgendaAppointment[]>(`/appointments?date=${dateKey}`, { headers });
        setAppointments(res.data);
      } catch (err) {
        setError(extractErrorMessage(err, 'Erro ao carregar agendamentos do dia.'));
      } finally {
        setLoading(false);
      }
    }, [dateKey, getHeaders]);

    useEffect(() => {
      fetchAppointments();
    }, [fetchAppointments]);

    return { barbers, businessHours, holidays, appointments, loading, error, refetch: fetchAppointments };
  }
  ```
- Integration points:
  - Consumido por `barber/agenda/page.tsx`.
  - Usa `api` (`barbearia-shelby-frontend/src/services/api.ts`) e `useAuth`
    (`barbearia-shelby-frontend/src/context/AuthContext.tsx`), ambos já existentes.
  - Depende das rotas backend `GET /appointments/barbers`, `GET /business-hours`, `GET /holidays`
    e `GET /appointments?date=` — as duas do meio só funcionam para `BARBEIRO` após a mudança da
    Phase 1 deste plan.

### `barbearia-shelby-frontend/src/app/barber/agenda/page.tsx`
- Purpose:
  - Orquestra estado de data/barbeiro selecionados, navegação entre dias, e repassa os dados
    filtrados para `AgendaGrid`.
- Contents:
  ```tsx
  'use client';

  import React, { useEffect, useMemo, useState } from 'react';
  import { useAuth } from '@/context/AuthContext';
  import { useDailyAgenda } from '@/hooks/useDailyAgenda';
  import AgendaGrid from './AgendaGrid';
  import styles from './Agenda.module.scss';

  // Constrói a chave "YYYY-MM-DD" a partir de campos LOCAIS do Date (não usa toISOString(),
  // que converte para UTC e pode deslocar o dia dependendo do fuso do navegador).
  function toDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseDateKey(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d); // meia-noite local
  }

  function shiftDateKey(key: string, deltaDays: number): string {
    const dt = parseDateKey(key);
    dt.setDate(dt.getDate() + deltaDays);
    return toDateKey(dt);
  }

  const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  export default function AgendaPage() {
    const auth = useAuth();
    const [dateKey, setDateKey] = useState<string>(() => toDateKey(new Date()));
    const [selectedBarberId, setSelectedBarberId] = useState<number | null>(null);

    const { barbers, businessHours, holidays, appointments, loading, error } = useDailyAgenda(dateKey);

    // Pré-seleciona o próprio usuário se ele for barbeiro; senão, o primeiro barbeiro da lista.
    useEffect(() => {
      if (selectedBarberId !== null || barbers.length === 0) return;
      if (auth.user?.userType === 'barbeiro') {
        const self = barbers.find((b) => b.id === auth.user!.id);
        setSelectedBarberId(self ? self.id : barbers[0].id);
      } else {
        setSelectedBarberId(barbers[0].id);
      }
    }, [barbers, auth.user, selectedBarberId]);

    const selectedDate = useMemo(() => parseDateKey(dateKey), [dateKey]);
    const dayOfWeek = selectedDate.getDay();
    const businessHoursForDay = businessHours.find((d) => d.dayOfWeek === dayOfWeek) ?? businessHours[dayOfWeek];
    const isHoliday = holidays.some((h) => h.date.slice(0, 10) === dateKey);

    const appointmentsForBarber = useMemo(
      () => appointments.filter((a) => a.admin?.id === selectedBarberId),
      [appointments, selectedBarberId]
    );

    const isToday = dateKey === toDateKey(new Date());

    return (
      <main className={styles.container}>
        <h1>Agenda Diária</h1>

        <div className={styles.toolbar}>
          <div className={styles.dateNav}>
            <button onClick={() => setDateKey((k) => shiftDateKey(k, -1))} aria-label="Dia anterior">
              &lt;
            </button>
            <button onClick={() => setDateKey(toDateKey(new Date()))} disabled={isToday}>
              Hoje
            </button>
            <button onClick={() => setDateKey((k) => shiftDateKey(k, 1))} aria-label="Próximo dia">
              &gt;
            </button>
            <input
              type="date"
              value={dateKey}
              onChange={(e) => e.target.value && setDateKey(e.target.value)}
            />
            <span className={styles.dateLabel}>
              {DAY_LABELS[dayOfWeek]}, {selectedDate.toLocaleDateString('pt-BR')}
            </span>
          </div>

          <div className={styles.barberSelect}>
            <label htmlFor="agenda-barber">Barbeiro:</label>
            <select
              id="agenda-barber"
              value={selectedBarberId ?? ''}
              onChange={(e) => setSelectedBarberId(Number(e.target.value))}
            >
              {barbers.length === 0 && <option value="">Nenhum barbeiro cadastrado</option>}
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {loading && <p className={styles.loading}>Carregando agenda...</p>}

        <AgendaGrid
          businessHoursForDay={businessHoursForDay}
          isHoliday={isHoliday}
          appointments={appointmentsForBarber}
        />
      </main>
    );
  }
  ```
- Integration points:
  - Consome `useDailyAgenda` e renderiza `AgendaGrid`.
  - Roteado automaticamente pelo App Router em `/barber/agenda`; protegido pelo guard existente
    de `barber/layout.tsx` (`allowedUserType={['barbeiro','dono','admin']}`) — sem `layout.tsx`
    próprio, pois o público é idêntico.

### `barbearia-shelby-frontend/src/app/barber/agenda/AgendaGrid.tsx`
- Purpose:
  - Componente apresentacional: desenha o grid de horas do dia (com área fora do expediente
    sombreada e banner de "fechado" quando aplicável) e os blocos de agendamento posicionados por
    horário/duração reais; clique num bloco abre um painel de detalhes somente leitura.
- Contents:
  ```tsx
  'use client';

  import React, { useMemo, useState } from 'react';
  import { AgendaAppointment, AgendaBusinessHoursDay } from '@/hooks/useDailyAgenda';
  import styles from './Agenda.module.scss';

  type Props = {
    businessHoursForDay?: AgendaBusinessHoursDay;
    isHoliday: boolean;
    appointments: AgendaAppointment[];
  };

  const HOUR_HEIGHT_PX = 64;
  const PX_PER_MINUTE = HOUR_HEIGHT_PX / 60;
  const PADDING_MINUTES = 60; // margem visual antes/depois do expediente

  function parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  // Minutos desde a meia-noite LOCAL do navegador (mesma convenção já usada em
  // AppointmentCard.tsx/toLocaleString('pt-BR') — assume staff acessando do fuso da barbearia).
  function localMinutesOfDay(iso: string): number {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  }

  function formatHourLabel(minutes: number): string {
    const h = Math.floor(minutes / 60);
    return `${String(h).padStart(2, '0')}:00`;
  }

  const STATUS_LABEL: Record<AgendaAppointment['status'], string> = {
    CONFIRMED: 'Confirmado',
    COMPLETED: 'Concluído',
    CANCELLED: 'Cancelado',
  };

  export default function AgendaGrid({ businessHoursForDay, isHoliday, appointments }: Props) {
    const [selected, setSelected] = useState<AgendaAppointment | null>(null);

    const openTime = businessHoursForDay?.openTime ?? '09:00';
    const closeTime = businessHoursForDay?.closeTime ?? '20:00';
    const isClosedDay = !!businessHoursForDay?.isClosed || isHoliday;

    const { windowStart, windowEnd, openMinutes, closeMinutes } = useMemo(() => {
      const open = parseTimeToMinutes(openTime);
      const close = parseTimeToMinutes(closeTime);
      let start = Math.max(0, open - PADDING_MINUTES);
      let end = Math.min(24 * 60, close + PADDING_MINUTES);

      // Garante que nenhum agendamento fique fora da janela renderizada, mesmo que o expediente
      // tenha sido reconfigurado depois da criação do agendamento (caso de borda).
      appointments.forEach((a) => {
        const apptStart = localMinutesOfDay(a.date);
        const apptEnd = apptStart + a.durationMinutes;
        start = Math.min(start, apptStart);
        end = Math.max(end, apptEnd);
      });

      return { windowStart: start, windowEnd: end, openMinutes: open, closeMinutes: close };
    }, [openTime, closeTime, appointments]);

    const hourMarks = useMemo(() => {
      const marks: number[] = [];
      const firstHour = Math.floor(windowStart / 60) * 60;
      for (let m = firstHour; m <= windowEnd; m += 60) marks.push(m);
      return marks;
    }, [windowStart, windowEnd]);

    const totalHeight = (windowEnd - windowStart) * PX_PER_MINUTE;

    return (
      <div className={styles.gridWrapper}>
        {isClosedDay && (
          <div className={styles.closedBanner}>
            {isHoliday ? 'A barbearia está fechada nesta data (feriado).' : 'Fechado neste dia da semana.'}
          </div>
        )}

        <div className={styles.grid} style={{ height: `${totalHeight}px` }}>
          {/* Sombreamento fora do expediente */}
          {openMinutes > windowStart && (
            <div
              className={styles.blockedZone}
              style={{ top: 0, height: `${(openMinutes - windowStart) * PX_PER_MINUTE}px` }}
            />
          )}
          {closeMinutes < windowEnd && (
            <div
              className={styles.blockedZone}
              style={{
                top: `${(closeMinutes - windowStart) * PX_PER_MINUTE}px`,
                height: `${(windowEnd - closeMinutes) * PX_PER_MINUTE}px`,
              }}
            />
          )}

          {/* Linhas/rótulos de hora */}
          {hourMarks.map((m) => (
            <div
              key={m}
              className={styles.hourRow}
              style={{ top: `${(m - windowStart) * PX_PER_MINUTE}px` }}
            >
              <span className={styles.hourLabel}>{formatHourLabel(m)}</span>
            </div>
          ))}

          {/* Blocos de agendamento */}
          {appointments.map((a) => {
            const apptStart = localMinutesOfDay(a.date);
            const top = (apptStart - windowStart) * PX_PER_MINUTE;
            const height = Math.max(a.durationMinutes * PX_PER_MINUTE, 24);
            const clientName = a.client?.name || a.guestName || 'Cliente convidado';

            return (
              <button
                key={a.id}
                className={`${styles.appointmentBlock} ${styles[`status${a.status}`]}`}
                style={{ top: `${top}px`, height: `${height}px` }}
                onClick={() => setSelected(a)}
              >
                <strong>{clientName}</strong>
                <span>{a.service?.name ?? 'Serviço'}</span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div className={styles.detailsPanel}>
            <div className={styles.detailsHeader}>
              <h3>Detalhes do agendamento</h3>
              <button onClick={() => setSelected(null)} aria-label="Fechar">×</button>
            </div>
            <p><strong>Cliente:</strong> {selected.client?.name || selected.guestName || 'Cliente convidado'}</p>
            <p><strong>Contato:</strong> {selected.client?.phone || selected.guestPhone || 'N/A'}</p>
            <p><strong>Serviço:</strong> {selected.service?.name ?? '—'} ({selected.durationMinutes} min)</p>
            <p>
              <strong>Horário:</strong>{' '}
              {new Date(selected.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              {' – '}
              {new Date(selected.endDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p><strong>Status:</strong> {STATUS_LABEL[selected.status]}</p>
            <p><strong>Notas:</strong> {selected.notes || '—'}</p>
          </div>
        )}

        {!isClosedDay && appointments.length === 0 && (
          <p className={styles.emptyState}>Nenhum agendamento neste dia para o barbeiro selecionado.</p>
        )}
      </div>
    );
  }
  ```
- Integration points:
  - Consumido por `barber/agenda/page.tsx`.
  - Usa os tipos `AgendaAppointment`/`AgendaBusinessHoursDay` exportados por `useDailyAgenda.tsx`.
  - Usa `Agenda.module.scss` (arquivo novo abaixo).

### `barbearia-shelby-frontend/src/app/barber/agenda/Agenda.module.scss`
- Purpose:
  - Estilo da página e do grid, reaproveitando os tokens visuais já usados em
    `BarberDashboard/styles.module.scss` e `Configuracoes.module.scss`.
- Contents:
  ```scss
  $brand-color: #f67366;
  $card-bg: #1e1e1e;
  $border-color: #3a3a3a;
  $text-color: #f0f0f0;
  $text-muted: #a0a0a0;
  $input-bg: #2a2a2a;
  $confirmed-color: #0d6efd;
  $success-color: #28a745;
  $cancelled-color: #dc3545;

  .container {
    padding: 2rem;
    max-width: 1000px;
    margin: 0 auto;
    font-family: 'Poppins', sans-serif;
    color: $text-color;

    h1 {
      margin-bottom: 1.5rem;
      text-align: center;
    }
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background-color: $card-bg;
    border: 1px solid $border-color;
    border-radius: 12px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
  }

  .dateNav {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;

    button {
      background-color: $input-bg;
      border: 1px solid $border-color;
      border-radius: 8px;
      color: $text-color;
      padding: 0.4rem 0.75rem;
      cursor: pointer;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &:hover:not(:disabled) {
        border-color: $brand-color;
      }
    }

    input[type='date'] {
      background-color: $input-bg;
      border: 1px solid $border-color;
      border-radius: 8px;
      color: $text-color;
      padding: 0.4rem 0.6rem;
    }
  }

  .dateLabel {
    color: $text-muted;
    font-weight: 600;
  }

  .barberSelect {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    select {
      background-color: $input-bg;
      border: 1px solid $border-color;
      border-radius: 8px;
      color: $text-color;
      padding: 0.4rem 0.6rem;
    }
  }

  .error {
    background-color: rgba($brand-color, 0.15);
    border: 1px solid $brand-color;
    color: $brand-color;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    text-align: center;
  }

  .loading,
  .emptyState {
    text-align: center;
    color: $text-muted;
    margin: 1rem 0;
  }

  .gridWrapper {
    position: relative;
    background-color: $card-bg;
    border: 1px solid $border-color;
    border-radius: 12px;
    padding: 1rem 1rem 1rem 4.5rem;
    overflow-y: auto;
    max-height: 70vh;
  }

  .closedBanner {
    background-color: rgba($cancelled-color, 0.15);
    border: 1px solid $cancelled-color;
    color: $text-color;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    text-align: center;
    font-weight: 600;
  }

  .grid {
    position: relative;
    border-top: 1px solid $border-color;
  }

  .blockedZone {
    position: absolute;
    left: 0;
    right: 0;
    background: repeating-linear-gradient(
      45deg,
      rgba($text-muted, 0.08),
      rgba($text-muted, 0.08) 6px,
      transparent 6px,
      transparent 12px
    );
    pointer-events: none;
  }

  .hourRow {
    position: absolute;
    left: -4.5rem;
    right: 0;
    border-top: 1px solid $border-color;
    height: 1px;
  }

  .hourLabel {
    position: absolute;
    left: 0;
    top: -0.6rem;
    width: 4rem;
    font-size: 0.75rem;
    color: $text-muted;
    text-align: right;
  }

  .appointmentBlock {
    position: absolute;
    left: 4px;
    right: 4px;
    border: none;
    border-radius: 6px;
    padding: 0.3rem 0.5rem;
    color: #fff;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.8rem;

    strong {
      font-size: 0.85rem;
    }

    span {
      opacity: 0.85;
    }

    &:hover {
      filter: brightness(1.1);
    }
  }

  .statusCONFIRMED {
    background-color: $confirmed-color;
  }

  .statusCOMPLETED {
    background-color: $success-color;
  }

  .statusCANCELLED {
    background-color: $cancelled-color;
    opacity: 0.7;
  }

  .detailsPanel {
    margin-top: 1.5rem;
    background-color: $input-bg;
    border: 1px solid $border-color;
    border-radius: 12px;
    padding: 1.25rem;

    p {
      margin: 0.4rem 0;
    }
  }

  .detailsHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;

    h3 {
      margin: 0;
    }

    button {
      background: none;
      border: none;
      color: $text-muted;
      font-size: 1.4rem;
      line-height: 1;
      cursor: pointer;

      &:hover {
        color: $brand-color;
      }
    }
  }
  ```
- Integration points:
  - Importado por `page.tsx` (classes do toolbar/container) e `AgendaGrid.tsx` (classes do grid).

## Implementation Order (recommended)
1. `barbearia-backend/src/routes/businessHours.routes.ts` — expandir `GET /`.
2. `barbearia-backend/src/routes/holiday.routes.ts` — expandir `GET /`.
3. Validar backend isoladamente (build + chamadas HTTP reais nos 4 papéis) antes de tocar o
   frontend.
4. `barbearia-shelby-frontend/src/hooks/useDailyAgenda.tsx`.
5. `barbearia-shelby-frontend/src/app/barber/agenda/Agenda.module.scss`.
6. `barbearia-shelby-frontend/src/app/barber/agenda/AgendaGrid.tsx`.
7. `barbearia-shelby-frontend/src/app/barber/agenda/page.tsx`.
8. `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx` — novo
   link.
9. Validar frontend (build + eslint + E2E navegador nos 4 papéis + regra transversal).

## Validation (commands / checks)
- `cd barbearia-backend && npm run build`
- `cd barbearia-shelby-frontend && npm run build`
- `cd barbearia-shelby-frontend && npx eslint src`
- `cd barbearia-shelby-frontend && npm test` (esperado: nenhuma suíte encontrada, mesmo estado
  atual do projeto)
- Chamadas HTTP reais (`POST /api/login` para obter token de cada papel, depois
  `GET /api/business-hours` e `GET /api/holidays`) cobrindo `barbeiro` (200, antes 403), `dono`
  (200), `admin` (200), `cliente`/sem token (403/401).
- E2E via navegador real cobrindo os 3 papéis autorizados (barbeiro/dono/admin) + bloqueio de
  cliente/visitante + regra transversal (rotas públicas).

## Notes
- Nenhuma migration Prisma é necessária — confirmado no Plan (`Migration Notes`).
- A rota é `/barber/agenda` (kebab-case/palavra única), consistente com o padrão já usado pelas
  páginas internas mais recentes (`/barber/metricas`, `/barber/usuarios`, `/barber/configuracoes`).
- `AgendaGrid` usa `date.getHours()`/`getMinutes()` (hora local do navegador) para posicionar os
  blocos — mesma convenção já usada em `AppointmentCard.tsx` (`toLocaleString('pt-BR')`) e no
  restante do projeto, que assume acesso a partir do fuso da barbearia (America/Sao_Paulo);
  nenhuma biblioteca de fuso horário nova é introduzida.
