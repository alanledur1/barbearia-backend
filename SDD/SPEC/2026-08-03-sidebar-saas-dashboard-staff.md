SPEC PATH: barbearia-backend/SDD/SPEC/2026-08-03-sidebar-saas-dashboard-staff.md

# Spec — Sidebar de navegação compacta e minimalista (somente ícones, com tooltip) para toda a área /barber

## Objective
- Substituir `BarberHeader.tsx` (nav horizontal, hoje só na página raiz `/barber`) por uma sidebar
  persistente, só-ícones (com tooltip), montada em `barber/layout.tsx` — passa a aparecer em
  **todas** as subpáginas de `/barber` sem que cada `page.tsx` precise mudar.
- Ícone "Site" (→ `/`) primeiro, seguido dos 7 itens hoje em `BarberHeader`: Agenda, Novo
  Agendamento, Faturamento, Métricas, Configurações, Usuários, Planos — mesma regra de
  visibilidade por papel (`dono`/`admin` para os últimos 4; todos os 3 papéis staff para os
  demais).

## Scope
**In**
- Novo componente `Sidebar.tsx` + `Sidebar.module.scss` em
  `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/`.
- `barber/layout.tsx` passa a renderizar `<Sidebar />` + wrapper de conteúdo com offset, dentro do
  `ProtectedRoute` já existente.
- Novo `BarberLayout.module.scss` em `barbearia-shelby-frontend/src/app/barber/` só com o estilo
  do wrapper de conteúdo (offset para não ficar embaixo da sidebar fixa).
- `BarberDashboard.tsx` para de renderizar `<BarberHeader />`; o cabeçalho local da página raiz
  (título "Dashboard do Barbeiro", badge de atrasados, botão "Recarregar") passa a ser markup
  inline dentro do próprio `BarberDashboard.tsx`, reaproveitando as classes já existentes
  `styles.header` / `styles.overdueBadge` / `styles.refreshButton` de `styles.module.scss`
  (nenhuma classe nova precisa ser criada ali).
- Remoção de `BarberHeader.tsx` (arquivo deletado — toda sua responsabilidade é substituída pelo
  par acima).
- Comportamento responsivo: sidebar vira rail vertical fixo à esquerda em telas ≥769px e barra
  horizontal fixa inferior em telas ≤768px (mesmo breakpoint já usado em `Navbar.scss` e
  `BarberDashboard/styles.module.scss`).

**Out**
- Qualquer mudança em `Navbar.tsx`/`Navbar.scss`/`Footer.jsx` (continuam exatamente como hoje).
- Qualquer mudança nos 4 `layout.tsx` de subrota (`configuracoes`, `metricas`, `planos`,
  `usuarios`) — guards `ProtectedRoute allowedUserType={['dono','admin']}` continuam como estão,
  sem consolidação (decisão registrada: risco/escopo não justifica tocar neles neste epic).
- Qualquer mudança em `agenda/page.tsx`, `billing/page.tsx`, `configuracoes/page.tsx`,
  `metricas/page.tsx`, `planos/page.tsx`, `usuarios/page.tsx` — cada um continua montando seu
  próprio `<main>`; a sidebar chega "de graça" via `barber/layout.tsx`.
- Qualquer mudança de backend/schema/API.
- Criação de testes automatizados novos (não existem hoje no repo; validação é build+lint+E2E
  manual, como nos epics anteriores).
- Item de sidebar apontando para `/barber` (raiz) — a lista de itens é exatamente os 7 do
  `BarberHeader` atual + "Site"; nenhum item adicional não pedido pelo epic.

## Files to Modify

### `barbearia-shelby-frontend/src/app/barber/layout.tsx`
- Changes:
  - Importa `Sidebar` de `./components/BarberDashboard/Sidebar` e `styles` de
    `./BarberLayout.module.scss`.
  - Passa a renderizar, dentro do `ProtectedRoute allowedUserType={['barbeiro','dono','admin']}`
    já existente (sem alterar a lista de papéis):
    ```tsx
    <ProtectedRoute allowedUserType={['barbeiro', 'dono', 'admin']}>
      <Sidebar />
      <div className={styles.content}>{children}</div>
    </ProtectedRoute>
    ```
- Notes/Constraints:
  - `Sidebar` só deve ficar visível depois que `ProtectedRoute` autorizar (ela fica **dentro** do
    `ProtectedRoute`, não antes) — garante que `cliente`/visitante nunca a veem, mesmo que
    naveguem direto para uma URL de `/barber/*` (são redirecionados para `/Login` antes de
    `children` — e portanto antes da `Sidebar` — renderizar).
  - Não alterar `allowedUserType` — regra de acesso ao shell continua idêntica.
- Reuse:
  - `ProtectedRoute` (`@/components/ProtectedRoute/ProtectedRoute`) sem alteração estrutural.

### `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberDashboard.tsx`
- Changes:
  - Remove `import BarberHeader from './BarberHeader';`.
  - Remove a chamada `<BarberHeader onRefresh={refetch} appointmentsCount={...} .../>` (linhas
    112-119 atuais).
  - No lugar, renderiza inline (dentro de `<section className={styles.container}>`, antes do
    `{loading && ...}`) o cabeçalho local da página, reaproveitando as classes já existentes:
    ```tsx
    <header className={styles.header}>
      <div>
        <h1>
          Dashboard do Barbeiro
          {overdueAppointments.length > 0 && (
            <button
              className={`${styles.overdueBadge} ${filter === 'overdue' ? styles.active : ''}`}
              title={`Atenção: ${overdueAppointments.length} agendamento(s) passado(s) pendente(s). Clique para ver.`}
              onClick={() => setFilter(prev => prev === 'future' ? 'overdue' : 'future')}
            >
              {overdueAppointments.length}
            </button>
          )}
        </h1>
        <p>{futureAppointments.length} agendamento(s) futuros • {services.length} serviço(s)</p>
      </div>
      <div>
        <button className={styles.refreshButton} onClick={refetch}>Recarregar</button>
      </div>
    </header>
    ```
  - Usa `overdueAppointments.length` (já calculado no `useMemo` existente, linhas 36-53) em vez
    de recalcular um `overdueCount` separado — elimina a duplicação que existia dentro de
    `BarberHeader.tsx` (que refazia o mesmo filtro sobre `allAppointments`).
- Notes/Constraints:
  - Não remover/alterar o restante do componente (`AppointmentsList`, `aside` de serviços,
    modais) — só a parte que instanciava `BarberHeader`.
  - Os links de navegação (Agenda, Novo Agendamento, Faturamento, Métricas, Configurações,
    Usuários, Planos) que existiam dentro de `BarberHeader` **não** são recriados aqui — eles
    agora vivem exclusivamente na `Sidebar` (layout-level), evitando duplicidade de navegação na
    página raiz.
- Reuse:
  - `styles.header`, `styles.overdueBadge`, `styles.refreshButton` de
    `./styles.module.scss` (já existentes, sem alteração no `.scss`).

## Files to Create

### `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/Sidebar.tsx`
- Purpose:
  - Componente de navegação persistente da área `/barber`, só-ícones, com tooltip, respeitando
    visibilidade por papel.
- Contents:
  - `'use client'`.
  - Imports: `Link` de `next/link`; `usePathname` de `next/navigation`; `useAuth` de
    `@/context/AuthContext`; ícones de `react-icons/fa6` (`FaHouse`, `FaCalendarDays`,
    `FaCalendarPlus`, `FaFileInvoiceDollar`, `FaChartLine`, `FaGear`, `FaUsers`,
    `FaLayerGroup`); `type { IconType }` de `react-icons`; `styles` de `./Sidebar.module.scss`.
  - Tipo local:
    ```tsx
    type SidebarItem = {
      href: string;
      label: string;
      icon: IconType;
      roles?: Array<'barbeiro' | 'dono' | 'admin'>; // undefined = visível a todo staff
    };
    ```
  - Lista estática de itens (módulo, fora do componente), na ordem:
    1. `{ href: '/', label: 'Site', icon: FaHouse }`
    2. `{ href: '/barber/agenda', label: 'Agenda', icon: FaCalendarDays }`
    3. `{ href: '/agendamento', label: 'Novo Agendamento', icon: FaCalendarPlus }`
    4. `{ href: '/barber/billing', label: 'Faturamento', icon: FaFileInvoiceDollar }`
    5. `{ href: '/barber/metricas', label: 'Métricas', icon: FaChartLine, roles: ['dono','admin'] }`
    6. `{ href: '/barber/configuracoes', label: 'Configurações', icon: FaGear, roles: ['dono','admin'] }`
    7. `{ href: '/barber/usuarios', label: 'Usuários', icon: FaUsers, roles: ['dono','admin'] }`
    8. `{ href: '/barber/planos', label: 'Planos', icon: FaLayerGroup, roles: ['dono','admin'] }`
  - Componente `Sidebar()`:
    - `const auth = useAuth(); const pathname = usePathname();`
    - `const visibleItems = SIDEBAR_ITEMS.filter(item => !item.roles || (auth.user && item.roles.includes(auth.user.userType as 'barbeiro' | 'dono' | 'admin')));`
      - Nota: `Sidebar` só é montado dentro do `ProtectedRoute` de `barber/layout.tsx`, então
        `auth.user` já é garantidamente um staff (`barbeiro`/`dono`/`admin`) nesse ponto — o
        filtro só precisa checar os `roles` restritivos dos 4 itens `dono`/`admin`-only.
    - Função local `function isItemActive(href: string): boolean { if (href === '/' || href === '/agendamento') return pathname === href; return pathname === href || pathname.startsWith(href + '/'); }`
    - Render:
      ```tsx
      <nav className={styles.sidebar} aria-label="Navegação da área do barbeiro">
        <ul className={styles.list}>
          {visibleItems.map(({ href, label, icon: Icon }) => (
            <li key={href} className={styles.item}>
              <Link
                href={href}
                className={`${styles.link} ${isItemActive(href) ? styles.active : ''}`}
                aria-label={label}
              >
                <Icon className={styles.icon} aria-hidden="true" />
                <span className={styles.tooltip}>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      ```
- Integration points:
  - Importado e renderizado por `barber/layout.tsx` (ver acima). Nenhum outro arquivo importa
    `Sidebar`.

### `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/Sidebar.module.scss`
- Purpose:
  - Estilo da sidebar: rail vertical fixo (desktop) / barra horizontal fixa inferior (mobile,
    `max-width: 768px`, mesmo breakpoint de `Navbar.scss`/`styles.module.scss`), com tooltip
    custom por item, paleta escura reaproveitada de
    `BarberDashboard/styles.module.scss:5-14`.
- Contents (estrutura, não literal):
  ```scss
  // Variáveis replicadas de styles.module.scss (mesmo padrão já usado em cada .module.scss
  // de subpágina do projeto — não há arquivo central de tokens hoje).
  $brand-color: #f67366;
  $card-bg: #1e1e1e;
  $text-color: #f0f0f0;
  $text-muted: #a0a0a0;
  $border-color: #3a3a3a;

  $navbar-height: 90px;        // altura do Navbar global fixo (globals.css)
  $navbar-height-mobile: 70px; // idem, breakpoint 768px (globals.css)
  $sidebar-width: 72px;
  $sidebar-height-mobile: 64px;

  .sidebar {
    position: fixed;
    top: $navbar-height;
    left: 0;
    bottom: 0;
    width: $sidebar-width;
    background-color: $card-bg;
    border-right: 1px solid $border-color;
    z-index: 900; // abaixo do Navbar (z-index 1000) e seus dropdowns
    overflow-y: auto;
  }

  .list {
    list-style: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem 0;
    margin: 0;
  }

  .item { position: relative; }

  .link {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    color: $text-muted;
    transition: background-color 0.2s ease, color 0.2s ease;

    &:hover, &:focus-visible { background-color: #2a2a2a; color: $text-color; }
    &.active { background-color: $brand-color; color: #fff; }
  }

  .icon { width: 1.3rem; height: 1.3rem; }

  .tooltip {
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%) translateX(-6px);
    background-color: #000;
    color: $text-color;
    padding: 0.4rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease, transform 0.15s ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    z-index: 950;
  }

  .link:hover .tooltip, .link:focus-visible .tooltip {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }

  @media (max-width: 768px) {
    .sidebar {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: $sidebar-height-mobile;
      border-right: none;
      border-top: 1px solid $border-color;
      overflow-x: auto;
      overflow-y: visible;
    }

    .list {
      flex-direction: row;
      justify-content: space-around;
      padding: 0 0.5rem;
      height: 100%;
      gap: 0.25rem;
    }

    .tooltip {
      left: 50%;
      top: auto;
      bottom: calc(100% + 10px);
      transform: translateX(-50%) translateY(6px);
    }

    .link:hover .tooltip, .link:focus-visible .tooltip {
      transform: translateX(-50%) translateY(0);
    }
  }
  ```
- Integration points:
  - Consumido só por `Sidebar.tsx` (CSS module, escopo local).

### `barbearia-shelby-frontend/src/app/barber/BarberLayout.module.scss`
- Purpose:
  - Wrapper de conteúdo de `barber/layout.tsx`: reserva espaço para a sidebar fixa não sobrepor
    o conteúdo das páginas.
- Contents:
  ```scss
  $sidebar-width: 72px;
  $sidebar-height-mobile: 64px;

  .content {
    margin-left: $sidebar-width;
  }

  @media (max-width: 768px) {
    .content {
      margin-left: 0;
      margin-bottom: $sidebar-height-mobile;
    }
  }
  ```
- Integration points:
  - Consumido só por `barber/layout.tsx`.

## Files to Delete
### `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`
- Motivo: toda sua responsabilidade é absorvida por `Sidebar.tsx` (navegação) + markup inline em
  `BarberDashboard.tsx` (título/badge/recarregar). Nenhum outro arquivo importa `BarberHeader`
  além de `BarberDashboard.tsx` (já ajustado acima) — seguro remover.

## Implementation Order (recommended)
1. Criar `Sidebar.module.scss`.
2. Criar `Sidebar.tsx` (usa o `.scss` do passo 1).
3. Criar `BarberLayout.module.scss`.
4. Editar `barber/layout.tsx` para renderizar `<Sidebar />` + `<div className={styles.content}>`.
5. Editar `BarberDashboard.tsx` (remove `BarberHeader`, inline cabeçalho local).
6. Deletar `BarberHeader.tsx`.
7. `npm run lint` e `npm run build` dentro de `barbearia-shelby-frontend/`.
8. Validação manual/browser (todas as subpáginas, os 3 papéis staff, e a regra transversal para
   visitante/cliente).

## Validation (commands / checks)
- `barbearia-shelby-frontend`: `npm run lint`
- `barbearia-shelby-frontend`: `npm run build`
- `barbearia-backend`: `npm run build` (baseline — nenhuma mudança esperada, mas roda para
  confirmar que nada quebrou por engano).
- E2E manual/browser (sem suíte automatizada existente no repo para este componente):
  1. Login como `barbeiro` → `/barber` mostra sidebar com Site/Agenda/Novo Agendamento/
     Faturamento; sem Métricas/Configurações/Usuários/Planos. Navegar para `/barber/agenda`,
     `/barber/billing` (e tentar `/barber/metricas` direto pela URL → deve redirecionar pro
     `/Login`, comportamento herdado do guard de subrota já existente).
  2. Login como `dono` (ou `admin`) → todos os 8 itens aparecem; navegar por todas as 6
     subpáginas + raiz e confirmar que a sidebar persiste em todas, com o item da rota atual
     destacado.
  3. Passar o mouse sobre cada ícone → tooltip com o rótulo aparece.
  4. Clicar em "Site" → volta para `/` (landing page, idêntica à de hoje, sem sidebar).
  5. Sem login (visitante) e como `cliente` → `/`, `/Servicos`, `/Login`, `/CriarConta`,
     `/EsqueciSenha`, `/agendamento`, `/meus-servicos` continuam idênticos a hoje; tentar acessar
     `/barber` direto redireciona para `/Login`.
  6. Redimensionar para ≤768px → sidebar vira barra inferior; conteúdo da página não fica coberto
     pela barra nem pelo `Navbar` superior.

## Notes
- Nenhuma migration/alteração de schema Prisma — feature 100% frontend.
- Nenhuma mudança de contrato de API entre os dois repositórios.
- Paleta de cor é duplicada localmente em `Sidebar.module.scss` (mesmo padrão já usado por cada
  `.module.scss` de subpágina do projeto) — não é criado um arquivo central de tokens, pois isso
  seria mudança de arquitetura fora do escopo deste epic.
- Os 4 `layout.tsx` de subrota (`configuracoes`, `metricas`, `planos`, `usuarios`) permanecem
  intocados nesta spec — decisão registrada no Plan.
