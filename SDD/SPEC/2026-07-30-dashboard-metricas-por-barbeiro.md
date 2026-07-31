# Spec — Dashboard de métricas agregadas por barbeiro, visível para dono e admin, estendendo o billing summary existente

## Objective
- Adicionar um endpoint aditivo (`GET /billing/summary/by-barber`, restrito a `DONO`/`ADMIN`) que
  agrega as métricas de faturamento já calculadas por `BillingController.getSummary`, mas
  segmentadas por barbeiro (`Appointment.adminId`).
- Adicionar um novo dashboard no frontend (`/barber/metricas`, guard `['dono','admin']`) que
  consome esse endpoint e reaproveita o padrão visual de `BillingDashboard.tsx`.

## Scope
**In**
- Novo método de controller + nova rota backend (aditivos).
- Novo hook, nova rota Next.js (layout+page+componente+scss) e novo link de navegação no
  frontend.

**Out**
- Qualquer mudança em `getSummary` / `/billing/summary` / `BillingDashboard.tsx` / `/barber/billing`.
- Filtro de período, gráficos, exportação, métricas de ocupação.
- Mudanças em `prisma/schema.prisma`.

## Files to Modify

### `barbearia-backend/src/controllers/billing.controller.ts`
- Changes:
  - Adicionar `import { AppointmentService } from "../services/appointmentService";` no topo.
  - Adicionar o método `getSummaryByBarber(req: Request, res: Response)` à classe
    `BillingController`, com a seguinte lógica:
    ```ts
    async getSummaryByBarber(req: Request, res: Response) {
        try {
            const appointmentService = new AppointmentService();

            const [completedAppointments, barbers] = await Promise.all([
                prisma.appointment.findMany({
                    where: { status: 'COMPLETED' },
                    include: {
                        service: true,
                        admin: { select: { id: true, name: true, role: true } },
                    },
                }),
                appointmentService.listBookableBarbers(),
            ]);

            type BarberStats = {
                adminId: number | null;
                name: string;
                role: string | null;
                totalRevenue: number;
                totalAppointments: number;
                averageTicket: number;
            };

            const statsByKey = new Map<number | 'unassigned', BarberStats>();

            // Semeia com todos os barbeiros (role BARBEIRO), inclusive os sem nenhum atendimento.
            for (const barber of barbers) {
                statsByKey.set(barber.id, {
                    adminId: barber.id,
                    name: barber.name,
                    role: 'BARBEIRO',
                    totalRevenue: 0,
                    totalAppointments: 0,
                    averageTicket: 0,
                });
            }

            for (const app of completedAppointments as any[]) {
                const key: number | 'unassigned' = app.adminId ?? 'unassigned';
                if (!statsByKey.has(key)) {
                    statsByKey.set(key, {
                        adminId: app.adminId ?? null,
                        name: app.admin?.name ?? 'Sem profissional atribuído',
                        role: app.admin?.role ?? null,
                        totalRevenue: 0,
                        totalAppointments: 0,
                        averageTicket: 0,
                    });
                }
                const entry = statsByKey.get(key)!;
                entry.totalAppointments += 1;
                entry.totalRevenue += app.service?.price || 0;
            }

            const barberStats = Array.from(statsByKey.values()).map((entry) => ({
                ...entry,
                averageTicket: entry.totalAppointments > 0 ? entry.totalRevenue / entry.totalAppointments : 0,
            })).sort((a, b) => b.totalRevenue - a.totalRevenue || a.name.localeCompare(b.name));

            const overallRevenue = barberStats.reduce((sum, b) => sum + b.totalRevenue, 0);
            const overallAppointments = barberStats.reduce((sum, b) => sum + b.totalAppointments, 0);
            const overallAverageTicket = overallAppointments > 0 ? overallRevenue / overallAppointments : 0;

            return res.status(200).json({
                overall: {
                    totalRevenue: overallRevenue,
                    totalAppointments: overallAppointments,
                    averageTicket: overallAverageTicket,
                },
                barbers: barberStats,
            });
        } catch (error) {
            console.error("Erro ao gerar resumo de faturamento por barbeiro:", error);
            return res.status(500).json({ error: "Falha ao gerar resumo por barbeiro." });
        }
    }
    ```
- Notes/Constraints:
  - `overall` é calculado a partir da soma de `barberStats` (não de uma segunda passada sobre
    `completedAppointments`), garantindo reconciliação matemática por construção — não precisa de
    teste extra de paridade além de comparar com `/billing/summary` no mesmo estado do banco.
  - Barbeiros com `totalAppointments === 0` mantêm `averageTicket: 0` (evitar `NaN`/divisão por
    zero), mesmo padrão de guard já usado em `getSummary`.
  - Não modificar `getSummary` nem `servicesBreakdown` — método novo é 100% aditivo à classe.
- Reuse:
  - `AppointmentService.listBookableBarbers()` (`barbearia-backend/src/services/appointmentService.ts:107`)
    reutilizado sem alteração.
  - `prisma` importado de `../services/prisma.service` (já importado no topo do arquivo).

### `barbearia-backend/src/routes/index.ts`
- Changes:
  - Logo após a linha `router.get('/billing/summary', authMiddleware,
    requireRole('BARBEIRO', 'DONO', 'ADMIN'), billingController.getSummary);` (linha 29),
    adicionar:
    ```ts
    router.get('/billing/summary/by-barber', authMiddleware, requireRole('DONO', 'ADMIN'), billingController.getSummaryByBarber);
    ```
- Notes/Constraints:
  - Não alterar a rota `/billing/summary` existente (continua com `requireRole('BARBEIRO', 'DONO',
    'ADMIN')`, inalterada).
  - Usar exatamente `requireRole('DONO', 'ADMIN')` — mesma assinatura usada em
    `business-hours`/`holidays`/`users` (Epic 5), sem incluir `BARBEIRO`.
- Reuse:
  - `authMiddleware`, `requireRole`, `billingController` já importados/instanciados no topo do
    arquivo (nenhum import novo necessário).

### `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`
- Changes:
  - Adicionar, dentro do mesmo bloco condicional `dono`/`admin` já existente (ao lado dos links
    "Configurações" e "Usuários", entre as linhas 51-60), um novo link:
    ```tsx
    {(auth.user?.userType === 'dono' || auth.user?.userType === 'admin') && (
      <Link href="/barber/metricas">
        <button className={styles.refreshButton} style={{ marginRight: '1rem' }}>Métricas</button>
      </Link>
    )}
    ```
  - Posicionar antes do link "Configurações" existente (ordem sugerida: Novo Agendamento,
    Faturamento, Métricas, Configurações, Usuários, Recarregar) — não é crítico, mas manter os
    links `dono`/`admin` agrupados.
- Notes/Constraints:
  - Reusar exatamente a mesma condição (`auth.user?.userType === 'dono' || auth.user?.userType ===
    'admin'`) e a mesma classe `styles.refreshButton` já usadas pelos outros dois links, para
    consistência visual.
- Reuse:
  - `Link` (next/link) e `styles` já importados no topo do arquivo.

## Files to Create

### `barbearia-shelby-frontend/src/hooks/useBarberMetrics.tsx`
- Purpose:
  - Hook dedicado para buscar os dados agregados por barbeiro, isolado de `useBarberData.tsx`
    (que já está grande e cobre outra tela/escopo).
- Contents (seguindo o padrão de `useBusinessSettings.tsx`):
  ```tsx
  import { useState, useEffect, useCallback } from 'react';
  import api from '@/services/api';
  import { useAuth } from '@/context/AuthContext';

  export type BarberMetric = {
    adminId: number | null;
    name: string;
    role: string | null;
    totalRevenue: number;
    totalAppointments: number;
    averageTicket: number;
  };

  export type MetricsOverall = {
    totalRevenue: number;
    totalAppointments: number;
    averageTicket: number;
  };

  export function useBarberMetrics() {
    const auth = useAuth();
    const [overall, setOverall] = useState<MetricsOverall | null>(null);
    const [barbers, setBarbers] = useState<BarberMetric[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getHeaders = useCallback(() => {
      return auth?.token ? { Authorization: `Bearer ${auth.token}` } : undefined;
    }, [auth?.token]);

    const fetchAll = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = getHeaders();
        const res = await api.get<{ overall: MetricsOverall; barbers: BarberMetric[] }>(
          '/billing/summary/by-barber',
          { headers }
        );
        setOverall(res.data.overall);
        setBarbers(res.data.barbers);
      } catch (err: unknown) {
        let errorMessage = 'Erro ao carregar métricas por barbeiro.';
        if (typeof err === 'object' && err !== null) {
          const maybeErr = err as { response?: { data?: { error?: string } }; message?: string };
          errorMessage = maybeErr.response?.data?.error || maybeErr.message || errorMessage;
        }
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    }, [getHeaders]);

    useEffect(() => {
      fetchAll();
    }, [fetchAll]);

    return { overall, barbers, loading, error, refetch: fetchAll };
  }
  ```
- Integration points:
  - Consumido por `MetricasDashboard.tsx`.
  - Usa `api` (`barbearia-shelby-frontend/src/services/api.ts`) e `useAuth`
    (`barbearia-shelby-frontend/src/context/AuthContext.tsx`), ambos já existentes.

### `barbearia-shelby-frontend/src/app/barber/metricas/layout.tsx`
- Purpose:
  - Guard de rota restrito a `dono`/`admin`, mesmo padrão de `configuracoes/layout.tsx` e
    `usuarios/layout.tsx`.
- Contents:
  ```tsx
  import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
  import React from 'react';

  export default function MetricasLayout({ children }: { children: React.ReactNode }) {
    return (
      <ProtectedRoute allowedUserType={['dono', 'admin']}>
        {children}
      </ProtectedRoute>
    );
  }
  ```
- Integration points:
  - Envolve `page.tsx` na mesma pasta, herdado também pelo guard geral de `barber/layout.tsx`
    (`['barbeiro','dono','admin']`) — o guard mais restritivo (`dono`/`admin`) prevalece na prática
    porque ambos precisam autorizar.

### `barbearia-shelby-frontend/src/app/barber/metricas/page.tsx`
- Purpose:
  - Página Next.js que renderiza o componente do dashboard, mesmo padrão de `barber/billing/page.tsx`.
- Contents:
  ```tsx
  'use client';

  import React from 'react';
  import styles from './Metricas.module.scss';
  import MetricasDashboard from './MetricasDashboard';

  export default function MetricasPage() {
    return (
      <main className={styles.metricsPageContainer}>
        <MetricasDashboard />
      </main>
    );
  }
  ```
- Integration points:
  - Roteado automaticamente pelo App Router em `/barber/metricas`.

### `barbearia-shelby-frontend/src/app/barber/metricas/MetricasDashboard.tsx`
- Purpose:
  - Componente principal do dashboard: cards de totais gerais + tabela por barbeiro.
- Contents:
  ```tsx
  'use client';

  import React from 'react';
  import { useBarberMetrics } from '@/hooks/useBarberMetrics';
  import styles from './Metricas.module.scss';

  export default function MetricasDashboard() {
    const { overall, barbers, loading, error } = useBarberMetrics();

    if (loading && !overall) return <p className={styles.loading}>Carregando métricas...</p>;
    if (error) return <p className={styles.error}>{error}</p>;
    if (!overall) return <p>Não foi possível carregar os dados.</p>;

    return (
      <div className={styles.metricsContainer}>
        <h1>Desempenho por Barbeiro</h1>

        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <h2>Faturamento Total</h2>
            <p>R$ {overall.totalRevenue.toFixed(2)}</p>
          </div>
          <div className={styles.metricCard}>
            <h2>Atendimentos Concluídos</h2>
            <p>{overall.totalAppointments}</p>
          </div>
          <div className={styles.metricCard}>
            <h2>Ticket Médio Geral</h2>
            <p>R$ {overall.averageTicket.toFixed(2)}</p>
          </div>
        </div>

        <div className={styles.breakdownSection}>
          <h2>Performance por Barbeiro</h2>
          <div className={styles.tableContainer}>
            <table>
              <thead>
                <tr>
                  <th>Barbeiro</th>
                  <th>Atendimentos</th>
                  <th>Faturamento</th>
                  <th>Ticket Médio</th>
                </tr>
              </thead>
              <tbody>
                {barbers.map((b) => (
                  <tr key={b.adminId ?? 'unassigned'}>
                    <td>{b.name}</td>
                    <td>{b.totalAppointments}</td>
                    <td>R$ {b.totalRevenue.toFixed(2)}</td>
                    <td>R$ {b.averageTicket.toFixed(2)}</td>
                  </tr>
                ))}
                {barbers.length === 0 && (
                  <tr>
                    <td colSpan={4}>Nenhum barbeiro cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
  ```
- Integration points:
  - Consome `useBarberMetrics` (hook novo acima).
  - Usa `Metricas.module.scss` (arquivo novo abaixo).

### `barbearia-shelby-frontend/src/app/barber/metricas/Metricas.module.scss`
- Purpose:
  - Estilo do novo dashboard, reaproveitando os mesmos tokens visuais de `Billing.module.scss`
    para manter consistência com o padrão já estabelecido em `/barber/billing`.
- Contents (baseado em `barbearia-shelby-frontend/src/app/barber/billing/Billing.module.scss`,
  ajustando apenas os nomes de classe raiz e removendo o `margin-top: 500px` legado que não deve
  ser copiado):
  ```scss
  $card-bg: #1e1e1e;
  $border-color: #3a3a3a;
  $text-color: #f0f0f0;
  $text-muted: #a0a0a0;
  $brand-color: #f67366;

  .metricsPageContainer {
    padding: 2rem 0;
  }

  .metricsContainer {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
    font-family: 'Poppins', sans-serif;

    h1 {
      margin-bottom: 2rem;
      text-align: center;
    }
  }

  .metricsGrid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 3rem;
  }

  .metricCard {
    background-color: $card-bg;
    border: 1px solid $border-color;
    border-radius: 12px;
    padding: 1.5rem;
    text-align: center;

    h2 {
      font-size: 1.1rem;
      color: $text-muted;
      margin-bottom: 1rem;
    }

    p {
      font-size: 2.5rem;
      font-weight: 700;
      color: $brand-color;
    }
  }

  .breakdownSection {
    h2 {
      margin-bottom: 1.5rem;
      text-align: center;
    }
  }

  .tableContainer {
    background-color: $card-bg;
    border: 1px solid $border-color;
    border-radius: 12px;
    overflow: hidden;

    table {
      width: 100%;
      border-collapse: collapse;

      th,
      td {
        padding: 1rem 1.5rem;
        text-align: left;
      }

      thead {
        background-color: lighten($card-bg, 5%);

        th {
          color: $text-muted;
        }
      }

      tbody {
        tr {
          border-top: 1px solid $border-color;

          &:hover {
            background-color: lighten($card-bg, 3%);
          }
        }

        td {
          color: $text-color;
        }
      }
    }
  }

  .loading,
  .error {
    text-align: center;
    font-size: 1.2rem;
    color: $text-muted;
    padding: 4rem 0;
  }

  .error {
    color: $brand-color;
  }
  ```
- Integration points:
  - Importado por `page.tsx` (`styles.metricsPageContainer`) e `MetricasDashboard.tsx`
    (demais classes).

## Implementation Order (recommended)
1. `barbearia-backend/src/controllers/billing.controller.ts` — método `getSummaryByBarber`.
2. `barbearia-backend/src/routes/index.ts` — nova rota.
3. Validar backend isoladamente (build + chamadas HTTP reais nos 4 papéis) antes de tocar o
   frontend.
4. `barbearia-shelby-frontend/src/hooks/useBarberMetrics.tsx`.
5. `barbearia-shelby-frontend/src/app/barber/metricas/layout.tsx`.
6. `barbearia-shelby-frontend/src/app/barber/metricas/Metricas.module.scss`.
7. `barbearia-shelby-frontend/src/app/barber/metricas/MetricasDashboard.tsx`.
8. `barbearia-shelby-frontend/src/app/barber/metricas/page.tsx`.
9. `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx` — novo
   link.
10. Validar frontend (build + eslint + E2E navegador nos 4 papéis + regra transversal).

## Validation (commands / checks)
- `cd barbearia-backend && npm run build`
- `cd barbearia-shelby-frontend && npm run build`
- `cd barbearia-shelby-frontend && npx eslint src`
- `cd barbearia-shelby-frontend && npm test` (esperado: nenhuma suíte encontrada, mesmo estado
  atual do projeto)
- Chamadas HTTP reais (`POST /api/login` para obter token de cada papel, depois
  `GET /api/billing/summary/by-barber`) cobrindo `dono` (200), `admin` (200), `barbeiro` (403),
  sem token (401).
- E2E via navegador real cobrindo os 4 papéis + regra transversal (rotas públicas).

## Notes
- Nenhuma migration Prisma é necessária — confirmado no Plan (`Migration Notes`).
- O nome de rota escolhido (`/barber/metricas`) segue o padrão kebab-case já usado pelas páginas
  internas mais recentes (`/barber/configuracoes`, `/barber/usuarios`), diferente do padrão
  PascalCase das páginas públicas mais antigas (`/Login`, `/Servicos`) — consistente com a nota de
  convenção do `CLAUDE.md` do frontend.
