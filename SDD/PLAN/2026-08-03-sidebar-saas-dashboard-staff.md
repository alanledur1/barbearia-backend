PLAN PATH: barbearia-backend/SDD/PLAN/2026-08-03-sidebar-saas-dashboard-staff.md

# Sidebar de navegação compacta e minimalista (somente ícones, com tooltip) para toda a área /barber — Implementation Plan

## Overview
Hoje a área `/barber` não tem navegação persistente: `BarberHeader.tsx` (nav horizontal com
texto) só é renderizado dentro de `BarberDashboard.tsx`, na página raiz `/barber`. As outras 6
subpáginas (`agenda`, `billing`, `configuracoes`, `metricas`, `planos`, `usuarios`) ficam
isoladas, sem link de volta. Este plano substitui essa navegação por uma sidebar persistente,
compacta e só-ícones (com tooltip), montada uma única vez em `barber/layout.tsx` — passa a
aparecer automaticamente em toda a área, preservando exatamente a mesma regra de visibilidade por
papel que `BarberHeader` já aplica hoje (Métricas/Configurações/Usuários/Planos só para
`dono`/`admin`), sem tocar em backend, schema ou na landing page pública.

## Scope
### In Scope
- Componente `Sidebar.tsx` (+ `Sidebar.module.scss`) — nav só-ícones, tooltip on-hover, item
  ativo destacado, item "Site" (`/`) + os 7 itens hoje em `BarberHeader`.
- `barber/layout.tsx` — passa a renderizar a sidebar + um wrapper de conteúdo com offset
  (`BarberLayout.module.scss`), dentro do `ProtectedRoute` já existente.
- `BarberDashboard.tsx` — para de renderizar `BarberHeader`; cabeçalho local (título, badge de
  atrasados, botão "Recarregar") passa a ser markup inline, reaproveitando classes já existentes.
- Remoção de `BarberHeader.tsx`.
- Comportamento responsivo (rail vertical ≥769px / barra inferior ≤768px), seguindo o breakpoint
  de 768px já usado em `Navbar.scss` e `BarberDashboard/styles.module.scss`.

### Out of Scope
- Consolidação dos 4 `layout.tsx` de subrota (`configuracoes`, `metricas`, `planos`, `usuarios`)
  num guard central único — permanecem como estão. Risco/ganho não justifica tocar neles neste
  epic (ver Decision Log abaixo).
- Qualquer mudança em `Navbar.tsx`/`Navbar.scss`/`Footer.jsx` ou na landing page `/`.
- Qualquer mudança de backend, schema Prisma, contrato de API.
- Criação de testes automatizados novos (Jest/Cypress) — repositório não tem nenhum teste hoje
  para esta área; validação é build + lint + E2E manual/browser.
- Item de sidebar extra não presente no `BarberHeader` atual (ex.: "voltar para /barber" — não é
  pedido pelo epic, que enumera exatamente 7 itens + "Site").

## Current State (from codebase)
- `barbearia-shelby-frontend/src/app/barber/layout.tsx:4-9` — só `ProtectedRoute
  allowedUserType={['barbeiro','dono','admin']}` ao redor de `{children}`, sem shell/nav.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx:18-77` —
  nav horizontal com texto, só usada por `BarberDashboard.tsx`; checa
  `auth.user?.userType === 'dono' || auth.user?.userType === 'admin'` repetido 4x para os itens
  restritos.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberDashboard.tsx:112-119`
  — único ponto que instancia `<BarberHeader />`.
- `barbearia-shelby-frontend/src/app/barber/agenda/page.tsx`, `.../billing/page.tsx`,
  `.../configuracoes/page.tsx`, `.../metricas/page.tsx`, `.../planos/page.tsx`,
  `.../usuarios/page.tsx` — cada um monta seu próprio `<main className={styles.container}>`
  isolado, sem nenhuma navegação de volta.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx`, `.../metricas/layout.tsx`,
  `.../planos/layout.tsx`, `.../usuarios/layout.tsx` — cada um com
  `ProtectedRoute allowedUserType={['dono','admin']}` próprio, redundante com a barreira do
  `barber/layout.tsx` mas ainda é a única barreira real de acesso direto por URL a essas 4
  subrotas.
- `barbearia-shelby-frontend/src/app/layout.tsx:60-62` — `RootLayout` renderiza `<Navbar/>` fixo
  (90px de altura) + `{children}` + `<Footer/>` ao redor de tudo, inclusive `/barber`.
  `globals.css:60-63,89-96` compensa com `main{padding-top:90px}` (80px/72px em breakpoints
  menores).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/styles.module.scss:5-14`
  — únicos tokens de cor escura hoje usados pela área `/barber`
  (`$brand-color:#f67366`, `$card-bg:#1e1e1e`, `$text-color:#f0f0f0`, `$text-muted:#a0a0a0`,
  `$border-color:#3a3a3a`).
- `barbearia-shelby-frontend/src/components/navbar/Navbar.scss:376-424` — padrão responsivo já
  existente no projeto (`@media (max-width:768px)`, hamburger + drawer).
- `react-icons` `^5.5.0` já instalado; `react-icons/fa6` contém `FaHouse`, `FaCalendarDays`,
  `FaCalendarPlus`, `FaFileInvoiceDollar`, `FaChartLine`, `FaGear`, `FaUsers`, `FaLayerGroup`
  (confirmado em `node_modules/react-icons/fa6/index.d.ts`).
- Nenhum arquivo `*.test.*` nem spec Cypress existe hoje no repositório frontend, apesar de
  Jest/Testing Library/Cypress estarem instalados.

## Desired End State
Um usuário `barbeiro`/`dono`/`admin` logado, em **qualquer** página sob `/barber`, vê uma sidebar
fixa e compacta (só ícones, com tooltip ao hover) à esquerda (ou em barra inferior no mobile),
com "Site" no topo e os demais itens filtrados pela mesma regra de papel que já existe hoje. O
item da rota atual aparece destacado. `BarberHeader.tsx` não existe mais. Visitante e `cliente`
continuam vendo `/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`,
`/meus-servicos` exatamente como hoje — sem nenhuma versão SaaS da navegação.
Verificável via: `npm run build`/`npm run lint` limpos em `barbearia-shelby-frontend/`, e
walkthrough manual no navegador cobrindo os 3 papéis staff + visitante/cliente.

## References
- PRD: `barbearia-backend/SDD/PRD/2026-08-03-sidebar-saas-dashboard-staff.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-08-03-sidebar-saas-dashboard-staff.md`
- Key code references:
  - `barbearia-shelby-frontend/src/app/barber/layout.tsx` — vira o host da sidebar.
  - `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx` —
    removido.
  - `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberDashboard.tsx:112-119`
    — ponto de remoção/inline do cabeçalho local.
  - `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/styles.module.scss:5-14`
    — fonte dos tokens de cor a replicar na sidebar.

---

## Phase 1: Componente de sidebar (isolado)

### Tasks
- [x] Criar `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/Sidebar.module.scss`
      (rail vertical fixo desktop / barra inferior fixa mobile ≤768px, tooltip custom, tokens de
      cor replicados de `styles.module.scss:5-14`) — ver Spec.
- [x] Criar `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/Sidebar.tsx`
      (lista dos 8 itens — "Site" + 7 espelhando `BarberHeader` —, filtro por papel via
      `useAuth()`, item ativo via `usePathname()`, tooltip acessível via `aria-label` + span
      `.tooltip`) — ver Spec.

### Success Criteria
#### Automated Verification
- [x] `npm run lint` (dentro de `barbearia-shelby-frontend/`): **desvio** — `next lint` não
      existe mais no Next.js 16.1.1 (comando removido do CLI; `package.json` ainda referencia o
      script antigo, condição pré-existente não introduzida por este epic). Substituído por
      `npx eslint src/app/barber/components/BarberDashboard/Sidebar.tsx` (mesma config flat
      `eslint.config.mjs` que `next lint` usaria) — 0 erros/warnings.
- [x] `npm run build` (dentro de `barbearia-shelby-frontend/`) continua passando (Sidebar ainda
      não está importada em lugar nenhum nesta fase, então não pode quebrar nada existente).

#### Manual Verification
- [x] Leitura do componente confirma: 8 itens na ordem correta, `roles` corretos nos 4 itens
      restritos, ícones existentes em `react-icons/fa6`.

---

## Phase 2: Wiring no layout + remoção do BarberHeader

### Tasks
- [x] Criar `barbearia-shelby-frontend/src/app/barber/BarberLayout.module.scss` (`.content` com
      `margin-left`/`margin-bottom` de offset para a sidebar fixa).
- [x] Editar `barbearia-shelby-frontend/src/app/barber/layout.tsx` para renderizar `<Sidebar />`
      + `<div className={styles.content}>{children}</div>` dentro do `ProtectedRoute` existente
      (sem alterar `allowedUserType`).
- [x] Editar `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberDashboard.tsx`:
      remover import/uso de `BarberHeader`, inline do cabeçalho local (título + badge de
      atrasados + botão "Recarregar") reaproveitando `styles.header`/`styles.overdueBadge`/
      `styles.refreshButton` já existentes, usando `overdueAppointments.length` já calculado.
- [x] Deletar `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`.

### Success Criteria
#### Automated Verification
- [x] `npm run lint`: mesmo desvio pré-existente da Phase 1 (`next lint` removido no Next 16).
      Substituído por `npx eslint src/app/barber` — 0 erros/warnings.
- [x] `npm run build` (dentro de `barbearia-shelby-frontend/`) passa limpo (confirma que nada
      mais importa `BarberHeader` e que os novos módulos `.scss`/`.tsx` compilam). Todas as 7
      rotas de `/barber` aparecem geradas normalmente no output do build.
- [x] Busca por `BarberHeader` no repositório frontend não retorna nenhuma referência residual
      (import ou uso) — `Grep` confirmou zero matches após a remoção.

#### Manual Verification
- [x] `Sidebar` renderiza corretamente dentro de `barber/layout.tsx` (visual/estrutura confirmada
      por leitura do JSX resultante — sem erro de tipos/props; `next build` já roda o TypeScript
      checker completo do projeto e não acusou nenhum erro de props/tipos).

---

## Phase 3: Validação E2E (build completo + navegador)

### Tasks
- [x] `barbearia-backend`: `npm run build` (baseline, nenhuma mudança de backend esperada).
- [x] `barbearia-shelby-frontend`: `npm run build` e `npx eslint src/app/barber` finais, com as
      três fases já aplicadas.
- [x] Subir backend (`npm run dev`) e frontend (`npm run dev`) localmente.
- [x] Percorrer no navegador (chrome-devtools MCP): login `barbeiro`
      (`barbeiro.exemplo@barbearia.com`), login `dono` (`admin@barbearia.com`), visitante sem
      login, `cliente` logado (conta nova registrada via `/CriarConta` para o teste) — cobrindo
      todos os itens de "Validation" da Spec.

### Success Criteria
#### Automated Verification
- [x] `barbearia-backend`: `npm run build` (`tsc`) sem erro.
- [x] `barbearia-shelby-frontend`: `npm run build` sem erro (17 rotas geradas, incluindo as 7 de
      `/barber`).
- [x] `barbearia-shelby-frontend`: `npx eslint src/app/barber` sem erro (mesmo desvio do `next
      lint` removido, documentado nas Phases 1-2).

#### Manual Verification
- [x] Sidebar aparece em todas as 7 páginas de `/barber` (raiz, agenda, billing, configuracoes,
      metricas, planos, usuarios) para `dono`/`admin`; barbeiro só vê os 4 itens sempre visíveis
      (+ Site) — confirmado via snapshot de acessibilidade em cada rota.
- [x] Tooltip aparece ao hover em cada ícone — confirmado por screenshot ("Agenda" tooltip visível
      ao hover). **Achado corrigido durante esta fase**: `overflow-y: auto` em `.sidebar` forçava
      o navegador a computar `overflow-x` também como não-"visible" (regra do spec de CSS
      Overflow), cortando o `.tooltip` (posicionado fora da largura de 72px de propósito). Corrigido
      removendo overflow declarado em `.sidebar` (desktop e mobile) — ver
      `Sidebar.module.scss`. Reconfirmado por screenshot após o fix: tooltip "Agenda" visível.
- [x] Item da rota atual fica destacado — confirmado (brand color `#f67366` no ícone da rota
      ativa em `/barber/agenda`, `/barber/metricas`, etc.).
- [x] "Site" volta para `/` (landing page idêntica à atual, sem sidebar) — confirmado.
- [x] Acesso direto por URL de `barbeiro` a `/barber/metricas` continua redirecionando para
      `/Login` — confirmado.
- [x] Visitante e `cliente` continuam acessando exatamente `/`, `/meus-servicos` sem nenhuma
      mudança — landing page `/` idêntica à de antes do epic, sem sidebar/versão SaaS; tentativa
      de acesso a `/barber` por visitante e por `cliente` logado redireciona para `/Login` em
      ambos os casos — confirmado.
- [x] Em viewport ≤768px (390×844), sidebar vira barra inferior com os 8 ícones em linha, sem
      sobrepor o `Navbar` superior nem o conteúdo principal da página — confirmado por screenshot.
      **Limitação conhecida, não corrigida (fora de escopo)**: ao rolar até o fim absoluto de uma
      subpágina de `/barber` em mobile, a barra inferior fixa sobrepõe os últimos ~64px do
      `Footer` global (ícones de redes sociais) — o `Footer` é renderizado fora da árvore de
      `barber/layout.tsx` (em `app/layout.tsx`, compartilhado por todas as páginas do site) e
      está fora do Scope Guard deste epic; corrigir exigiria tocar `Footer.jsx` ou
      `app/layout.tsx`, ambos fora da lista de arquivos da Spec. Não bloqueia nenhum critério de
      aceitação (conteúdo funcional da página e a própria sidebar nunca ficam cobertos).

---

## Testing Notes
- Unit tests: não aplicável — sem suíte Jest cobrindo esta área hoje; não criada nesta rodada
  (fora de escopo, ver PRD 5.6).
- Integration tests: não aplicável — sem specs Cypress hoje.
- Manual steps: ver "Manual Verification" de cada fase e a seção "Validation" da Spec (passos 1-6).

## Migration Notes
Não aplicável — nenhuma alteração de schema Prisma. Feature é 100% frontend (navegação/UI).

## Rollout Notes
- Sem flag de rollout — mudança é direta (substitui `BarberHeader` por `Sidebar` no próximo
  deploy do frontend). Sem impacto em backend/produção do lado da API.

## Achados extra (fora do escopo original, não corrigidos)
- **`/barber/agenda` (e provavelmente outras subpáginas que seguem o mesmo padrão): o título da
  página fica visualmente sobreposto ao `Navbar` global fixo.** Causa: `agenda/page.tsx` aplica a
  classe `.container` (que define `padding: 2rem` via shorthand, incluindo `padding-top`)
  diretamente no elemento `<main>`; por especificidade CSS, isso sobrescreve a regra global
  `main { padding-top: 90px }` de `globals.css` que reserva espaço para o `Navbar` fixo. Página
  raiz `/barber` não tem esse problema porque lá o `<main>` (sem classe) envolve um `<section
  className={styles.container}>` interno — o `<main>` mantém `padding-top: 90px` limpo. Confirmado
  como **pré-existente** (não introduzido por este epic): `git log` mostra `Agenda.module.scss`
  commitado em epic anterior ("feat: agenda diaria estilo Google Calendar/Outlook"), e nenhuma
  mudança deste epic tocou esse arquivo. Fora do Scope Guard (`agenda/page.tsx` está na lista de
  arquivos que este epic não deveria tocar) — não corrigido, registrado aqui para follow-up
  futuro.

---

## Decision Log (fechado durante o workshop autônomo, com evidência de codebase)
- **Decisão**: Sidebar vira rail vertical fixo (72px) em telas ≥769px e barra horizontal fixa
  inferior (64px) em telas ≤768px.
  **Motivo/efeito**: reusa o breakpoint 768px já padrão no projeto (`Navbar.scss`,
  `BarberDashboard/styles.module.scss`); barra inferior é o padrão mais comum para nav só-ícones
  em mobile e evita introduzir um novo paradigma de interação (drawer) só para 8 ícones já
  compactos. Impacta: `Sidebar.module.scss`, `BarberLayout.module.scss`.
- **Decisão**: Não consolidar os 4 `layout.tsx` de subrota num guard central.
  **Motivo/efeito**: explicitamente marcado como "não obrigatório" no roadmap; consolidar exigiria
  desenhar uma nova camada de configuração de papéis por rota sem necessidade funcional para
  cumprir os critérios de aceitação — risco/ganho não justifica neste epic. Impacta: nenhum
  arquivo (decisão de não tocar).
- **Decisão**: Nenhum item de sidebar aponta para `/barber` (raiz) além dos 8 itens especificados.
  **Motivo/efeito**: o epic enumera exatamente "Site" + os 7 itens do `BarberHeader` atual;
  adicionar um item extra não pedido seria expansão de escopo. Navegação de volta à raiz continua
  possível via o link "Minha Dashboard" já existente no dropdown do `Navbar` global (inalterado).
- **Decisão**: Tokens de cor são replicados localmente em `Sidebar.module.scss` (não extraídos
  para um arquivo central de tokens).
  **Motivo/efeito**: replicar segue o padrão já estabelecido em todos os `.module.scss` do
  projeto (cada subpágina já duplica sua própria paleta); criar um arquivo central seria mudança
  de arquitetura fora do escopo deste epic (achado registrado no `ROADMAP_V3.md` como "não
  bloqueia o epic"). Impacta: `Sidebar.module.scss`.
- **Decisão**: Tooltip é implementado via CSS custom (span posicionado, opacity no hover/focus),
  não via `title` nativo do browser.
  **Motivo/efeito**: `title` nativo tem delay e não segue a paleta escura do projeto; a
  implementação custom é leve (sem nova dependência) e consistente com a qualidade visual já
  presente em outros componentes da área (dropdown do `Navbar`, botão animado "Adicionar" em
  `BarberDashboard`). Impacta: `Sidebar.tsx`, `Sidebar.module.scss`.

## Scope Guard
- NÃO fazer: refactor de `useBarberData`, `AppointmentsList`, `AgendaGrid`, `BillingDashboard`,
  ou qualquer lógica de negócio das subpáginas.
- NÃO tocar em: backend, `prisma/schema.prisma`, rotas de API, `Navbar.tsx`, `Navbar.scss`,
  `Footer.jsx`, `app/page.tsx` (landing page), `ProtectedRoute.tsx`, `AuthContext.tsx`, os 4
  `layout.tsx` de subrota (`configuracoes`, `metricas`, `planos`, `usuarios`), `agenda/page.tsx`,
  `billing/page.tsx`, `configuracoes/page.tsx`, `metricas/page.tsx`, `planos/page.tsx`,
  `usuarios/page.tsx`.
