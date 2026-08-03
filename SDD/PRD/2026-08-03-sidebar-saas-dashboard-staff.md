# PRD — Sidebar de navegação compacta e minimalista (somente ícones, com tooltip ao passar o mouse) para toda a área /barber, substituindo o header horizontal atual (hoje presente só na página raiz), com um ícone "Site" que leva de volta à landing page pública "/" e os demais ícones espelhando exatamente as opções hoje disponíveis em Minha Dashboard, com a mesma regra de visibilidade por papel (dono/admin/barbeiro) já aplicada hoje, seguindo a paleta de cores escura já usada no projeto

## 1) Objetivo
- Substituir `BarberHeader` (navegação horizontal hoje presente **só** na página raiz `/barber`) por
  uma sidebar persistente, compacta, só-ícones (com tooltip), presente em **todas** as subpáginas
  de `/barber` — hoje cada subpágina (`agenda`, `billing`, `configuracoes`, `metricas`, `planos`,
  `usuarios`) fica isolada, sem nenhuma navegação de volta ou entre seções.
- Dar ao staff (barbeiro/dono/admin) um "shell" de navegação único e persistente para toda a área
  autenticada, no mesmo espírito de um dashboard SaaS, sem regressão de acesso/visibilidade por
  papel.

## 2) Escopo
**Inclui**
- Novo componente de sidebar (substitui/reescreve `BarberHeader.tsx`), só-ícones, com tooltip ao
  hover, presente no shell de `/barber` (via `barber/layout.tsx`).
- Ícone "Site" (primeiro item) linkando para `/` (landing page pública, inalterada).
- Ícones espelhando exatamente os itens hoje em `BarberHeader`: Agenda (`/barber/agenda`), Novo
  Agendamento (`/agendamento`), Faturamento (`/barber/billing`), Métricas (`/barber/metricas`),
  Configurações (`/barber/configuracoes`), Usuários (`/barber/usuarios`), Planos (`/barber/planos`).
- Mesma regra de visibilidade por papel já aplicada em `BarberHeader`: Agenda/Novo
  Agendamento/Faturamento sempre visíveis a `barbeiro`/`dono`/`admin`; Métricas/Configurações/
  Usuários/Planos só a `dono`/`admin`.
- Paleta de cores escura já usada no projeto (tokens de `BarberDashboard/styles.module.scss`).
- Indicação visual do item ativo (rota atual).

**Não inclui (fora de escopo)**
- Qualquer mudança na landing page `/` em si (fica pixel-idêntica ao que já é hoje).
- Qualquer mudança de acesso/visibilidade para `cliente` ou visitante — regra transversal do
  roadmap (`/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`,
  `/meus-servicos` continuam exatamente como hoje).
- O botão "Recarregar" (`onRefresh`) do `BarberHeader` atual — é uma ação local da página
  `/barber` (raiz), não um item de navegação; continua existindo dentro de `BarberDashboard.tsx`
  fora da sidebar (a sidebar é só navegação entre seções, não ações de página).
- Mudança de backend — feature é 100% frontend (navegação/UI), sem novo endpoint, payload ou
  campo de API.
- Mudança de schema Prisma — nenhuma.
- Remoção do `Navbar` (header global fixo com logo/Home/Serviços/Sobre/Contato/avatar) que hoje
  envolve **toda** a aplicação (inclusive `/barber`) via `app/layout.tsx` — ele continua existindo;
  a sidebar é um shell adicional, específico da área `/barber`, que convive com o `Navbar` global.
- Testes automatizados novos (Jest/Cypress) — não há testes hoje cobrindo `BarberHeader`,
  `ProtectedRoute` ou as rotas de `/barber` (nenhum arquivo `*.test.*` nem spec Cypress existe no
  repositório); validação será build + E2E manual/browser, como em epics anteriores.

## 3) Fluxo atual (como funciona hoje)
- `app/layout.tsx` (Server Component raiz) envolve **toda** a aplicação com `<Navbar />` +
  `{children}` + `<Footer />`, dentro de `<AuthProvider>`. `Navbar` é `position: fixed; top:0;
  height:90px` (70px em `max-width:768px`), e `globals.css` compensa isso com `main {
  padding-top: 90px }` (80px/72px nos breakpoints menores) — ou seja, todo `<main>` de página já
  assume esse espaço reservado no topo.
- `barber/layout.tsx` (`barbearia-shelby-frontend/src/app/barber/layout.tsx:4-9`) é hoje só um
  `ProtectedRoute allowedUserType={['barbeiro','dono','admin']}` envolvendo `{children}` — não
  renderiza nenhum shell/navegação própria.
- Só `barber/page.tsx` (`.../barber/page.tsx`) renderiza `<BarberDashboard />`, que por sua vez
  renderiza `<BarberHeader ... />` (`.../components/BarberDashboard/BarberDashboard.tsx:112-119`)
  dentro de `<section className={styles.container}>` (sem `<main>` — mas ainda herda o
  `padding-top` do `<main>` do `RootLayout`? Não: `BarberDashboard` usa `<section>`, não `<main>`;
  quem prov o `<main>` nessa rota é implícito — na prática `barber/page.tsx` só tem `<main><
  BarberDashboard /></main>`, então o espaçamento do Navbar é respeitado).
- As demais 6 subpáginas (`agenda`, `billing`, `configuracoes`, `metricas`, `planos`, `usuarios`)
  **não** renderizam `BarberHeader` — cada uma monta seu próprio `<main className={styles.container}>`
  isolado, sem nenhum link de volta para `/barber` ou entre si. Usuário precisa usar o botão
  "voltar" do navegador ou o dropdown do `Navbar` (que só tem "Minha Dashboard" → `/barber`).
- `BarberHeader.tsx` (`.../BarberDashboard/BarberHeader.tsx:18-77`) hoje:
  - Recebe props específicas de `BarberDashboard` (`onRefresh`, `appointmentsCount`,
    `servicesCount`, `allAppointments`, `onFilterToggle`, `currentFilter`) — acopladas à página
    raiz, não reutilizáveis por outras subpáginas como estão.
  - Usa `useAuth()` (`@/context/AuthContext`) para checar `auth.user?.userType === 'dono' ||
    auth.user?.userType === 'admin'` (repetido 4x, linhas 54, 59, 64, 69) e condicionar os links
    de Métricas/Configurações/Usuários/Planos.
  - Renderiza `<Link>` com `<button>` texto (não ícone) para cada item: Agenda → `/barber/agenda`;
    Novo Agendamento → `/agendamento`; Faturamento → `/barber/billing`; Métricas →
    `/barber/metricas`; Configurações → `/barber/configuracoes`; Usuários → `/barber/usuarios`;
    Planos → `/barber/planos`; mais um botão local "Recarregar" (`onRefresh`, sem link).
- Guard por subrota hoje é **duplicado**: além do guard geral em `barber/layout.tsx`
  (`['barbeiro','dono','admin']`), 4 subrotas têm o próprio `layout.tsx` com
  `ProtectedRoute allowedUserType={['dono','admin']}` (mais restritivo, redundante com a checagem
  visual do `BarberHeader`):
  - `barber/configuracoes/layout.tsx:6`
  - `barber/metricas/layout.tsx:6`
  - `barber/planos/layout.tsx:6`
  - `barber/usuarios/layout.tsx:6`
  `agenda` e `billing` **não** têm `layout.tsx` próprio — ficam só sob o guard geral
  (`['barbeiro','dono','admin']`), coerente com serem visíveis a todos os 3 papéis no
  `BarberHeader` hoje.
- `ProtectedRoute` (`barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx:14-45`)
  é genérico: aceita `allowedUserType: UserType | UserType[]`, mostra "Verificando acesso..." até
  `isClientSide && auth.isAuthenticated !== null` resolver (por causa da hidratação SSR/CSR do
  `AuthContext`, que lê `localStorage` só no client), e faz `router.replace('/Login')` se não
  autorizado.
- `AuthContext` (`barbearia-shelby-frontend/src/context/AuthContext.tsx:7`) já define `UserType =
  'cliente' | 'barbeiro' | 'dono' | 'admin'`; `useAuth()` lança erro fora de provider,
  `useAuthSafe()` retorna um valor default seguro (usado no `Navbar`, que é global e pode renderizar
  antes/fora de contexto autenticado).
- Paleta escura hoje vive só em `BarberDashboard/styles.module.scss:5-14` (sem tokens globais):
  `$brand-color:#f67366`, `$dark-bg:#121212`, `$card-bg:#1e1e1e`, `$text-color:#f0f0f0`,
  `$text-muted:#a0a0a0`, `$border-color:#3a3a3a`, `$success-color:#28a745`,
  `$cancelled-color:#dc3545`, `$confirmed-color:#0d6efd`, `$input-bg:#2a2a2a`. Cada subpágina de
  `/barber` tem seu próprio `.module.scss` com uma paleta praticamente idêntica redeclarada
  localmente (`Agenda.module.scss`, `Billing.module.scss`, `Configuracoes.module.scss`,
  `Metricas.module.scss`, `Planos.module.scss`, `Usuarios.module.scss` — não confirmado 1:1 mas
  os valores hex `#f67366`/`#121212`/`#1e1e1e` aparecem repetidos no grep já feito no
  `ROADMAP_V3.md`, seção "Estado atual").
- `react-icons` `^5.5.0` já é dependência instalada. Usos hoje (nenhum dentro de `/barber`):
  `react-icons/fa6` (`FaArrowRight` no `Navbar`, `FaPhone` no `Contato`), `react-icons/fa`
  (`FaClock`, `FaMapMarkerAlt`, `FaExternalLinkAlt` no `HomePage`; `FaClock`, `FaHandScissors`,
  `FaInfoCircle` no `AppointmentCard.tsx` dentro de `BarberDashboard`; `FaFacebookF`, `FaTwitter`,
  `FaWhatsapp`, `FaInstagram` no `Footer`), `react-icons/md` (`MdDeleteForever` no
  `AppointmentCard.tsx`), `react-icons/ri` (`RiScissors2Fill`), `react-icons/sl`, `react-icons/tb`,
  `react-icons/bs`. `AppointmentCard.tsx` já é o único arquivo dentro de `/barber` a usar
  `react-icons` hoje — confirma que ícones já convivem com o dark theme da dashboard.
- Padrão responsivo já usado no projeto para navegação: `Navbar.scss` tem breakpoint
  `@media (max-width: 768px)` que esconde `&__links` (nav principal) e mostra um botão hamburger
  (`.navbar__hamburger`) que abre `.navbar__mobileMenu` (drawer absoluto, `position:absolute`,
  fundo escuro). `BarberDashboard/styles.module.scss:551-633` também usa
  `@media (max-width: 768px)` para empilhar o `.header` (`flex-direction:column`) e fazer os
  botões de ação ocuparem `width:100%` em coluna — não usa hamburger, só reflow vertical.

## 4) Fluxo desejado (comportamento esperado)
- `barber/layout.tsx` passa a renderizar um shell com a sidebar fixa (só-ícones) + a página atual
  (`{children}`), para **todas** as rotas sob `/barber` — sem precisar que cada `page.tsx`
  individual monte a sidebar.
- A sidebar mostra, de cima para baixo: ícone "Site" (→ `/`) sempre visível, depois os ícones de
  Agenda, Novo Agendamento, Faturamento (sempre visíveis a `barbeiro`/`dono`/`admin`), depois
  Métricas, Configurações, Usuários, Planos (só `dono`/`admin`) — mesma regra de visibilidade que
  `BarberHeader` já aplica hoje, sem adicionar nem remover nenhuma condição de papel.
- Cada ícone tem tooltip com o rótulo (ex.: "Agenda", "Novo Agendamento") ao passar o mouse, já
  que não há texto visível ao lado do ícone.
- O item correspondente à rota atual tem indicação visual de "ativo" (mesma ideia do
  `.viewControls button.active` / `.navbar__links li.active a` já usados no projeto).
- `BarberHeader.tsx` deixa de existir como header de página — vira (ou é substituído por) o
  componente de sidebar; o botão "Recarregar" da página raiz permanece como ação local dentro de
  `BarberDashboard.tsx`/`BarberDashboard`'s próprio cabeçalho de conteúdo, fora da sidebar.
- Todas as 6 subpáginas hoje isoladas (`agenda`, `billing`, `configuracoes`, `metricas`, `planos`,
  `usuarios`) passam a exibir a sidebar automaticamente (herdada de `barber/layout.tsx`), sem
  precisar de nenhuma mudança dentro do `page.tsx` de cada uma.
- Visitante (não logado), `cliente` (logado ou não) continuam vendo `/` exatamente como hoje —
  landing page pública, sem sidebar, sem nenhuma versão "SaaS". A sidebar só aparece dentro de
  `/barber/*`, que já é protegido por `ProtectedRoute allowedUserType={['barbeiro','dono','admin']}`
  — `cliente`/visitante que tentarem acessar `/barber/*` continuam sendo redirecionados para
  `/Login`, como hoje.
- Paleta da sidebar segue os tokens escuros já usados em `BarberDashboard/styles.module.scss`
  (`$dark-bg`/`$card-bg`/`$brand-color`/etc.) — não a paleta clara/genérica do template de
  referência de Figma citado no `ROADMAP_V3.md` (que é só referência de *forma*, não de cor).
- Comportamento em telas pequenas segue o padrão responsivo já estabelecido no projeto (ver seção
  3 e Open Questions/decisões da fase de planejamento).

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `barbearia-shelby-frontend/src/app/barber/layout.tsx` — hoje só `ProtectedRoute`; vira o host da
  sidebar para toda a área `/barber`.
- `barbearia-shelby-frontend/src/app/barber/page.tsx` — renderiza `BarberDashboard` (que hoje
  renderiza `BarberHeader` internamente).
- `barbearia-shelby-frontend/src/app/barber/agenda/page.tsx`,
  `.../billing/page.tsx`, `.../configuracoes/page.tsx`, `.../metricas/page.tsx`,
  `.../planos/page.tsx`, `.../usuarios/page.tsx` — cada um monta seu próprio `<main
  className={styles.container}>` isolado, todos ficam sob `barber/layout.tsx` na árvore de rotas.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx`,
  `.../metricas/layout.tsx`, `.../planos/layout.tsx`, `.../usuarios/layout.tsx` — guards
  `ProtectedRoute allowedUserType={['dono','admin']}` duplicados por subrota (redundantes com a
  visibilidade condicional que a sidebar/`BarberHeader` já aplica na UI, mas ainda são a única
  barreira real de acesso direto por URL para essas 4 subrotas).

### 5.2 Domínio / Regras / Serviços
- `barbearia-shelby-frontend/src/context/AuthContext.tsx` — `useAuth()`/`useAuthSafe()`,
  `UserType`, fonte da verdade de `user.userType` usada para decidir visibilidade dos ícones.
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` — guard genérico
  reutilizado, sem alteração estrutural necessária.
- Nenhuma regra de negócio de backend envolvida — feature é puramente de apresentação/navegação
  no frontend.

### 5.3 Persistência / Modelos / Migrações
- Não aplicável. Nenhuma tabela/coluna tocada. Nenhuma migration Prisma necessária.

### 5.4 Integrações externas (clients/adapters/providers)
- Não aplicável — sem chamadas de API novas, sem SDK novo. `react-icons` já é dependência
  instalada (`^5.5.0`), sem necessidade de instalar nada novo.

### 5.5 UI / Componentes (se aplicável)
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx` —
  componente atual a ser substituído/reescrito como sidebar.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberDashboard.tsx:112-119`
  — ponto que hoje instancia `<BarberHeader .../>` com props específicas da página raiz
  (`onRefresh`, contadores, filtro) — precisa parar de renderizar a navegação (que migra para o
  layout) mas mantém a lógica de "Recarregar"/contadores como conteúdo próprio da página.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/styles.module.scss:5-14` —
  única fonte de tokens de cor hoje usada pela área `/barber`; candidato a ser a fonte dos tokens
  usados no novo componente de sidebar (import do `.scss` ou repetição das variáveis, a definir na
  fase de planejamento).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/AppointmentCard.tsx:6,8` —
  único uso hoje de `react-icons` dentro de `/barber`, referência de import (`from 'react-icons/fa'`
  / `from 'react-icons/md'`).
- `barbearia-shelby-frontend/src/components/navbar/Navbar.tsx` e `Navbar.scss` — referência de
  padrão responsivo (hamburger + drawer) e de indicação de link ativo (`isActive`/`.active`) já
  usados no projeto; `Navbar` continua renderizado globalmente (`app/layout.tsx:60`), inclusive
  dentro de `/barber` — convive com a nova sidebar, não é removido nem alterado por este epic.
- `barbearia-shelby-frontend/src/app/globals.css:60-63,89-96` — `main { padding-top: 90px }` (e
  variações por breakpoint) compensando o `Navbar` fixo; relevante porque a nova sidebar precisa
  coexistir com esse espaçamento (não sobrepor o `Navbar` fixo no topo).
- `barbearia-shelby-frontend/src/app/layout.tsx:60-62` — `RootLayout` renderiza `<Navbar />`,
  `{children}`, `<Footer />` ao redor de tudo, incluindo `/barber` — confirma que remover/alterar
  esse header global está fora de escopo.

### 5.6 Testes / Fixtures (se existirem)
- Não há testes automatizados hoje. Busca por `*.test.*` e specs Cypress no repositório não
  retornou nenhum arquivo, apesar de Jest/Testing Library/Cypress estarem instalados
  (`package.json` tem scripts `"test": "jest"` e `cypress` como devDependency, mas nenhum arquivo
  de teste existe ainda em `barbearia-shelby-frontend/`). Validação desta feature será build
  (`next build`) + lint (`next lint`) + E2E manual/browser, no mesmo padrão dos epics anteriores
  (ver PRD `2026-07-30-acesso-admin-paginas-configuracao.md`, seção 5.6, que documenta o mesmo
  estado).

## 6) Padrões existentes para reuso (evitar duplicação)
- `barbearia-shelby-frontend/src/components/ProtectedRoute/ProtectedRoute.tsx` — já aceita lista
  de papéis (`allowedUserType: UserType | UserType[]`); reusar sem alteração estrutural para
  qualquer guard novo/consolidado.
- `barbearia-shelby-frontend/src/context/AuthContext.tsx` (`useAuth`) — já usado por
  `BarberHeader.tsx:19` para checar `userType`; mesmo hook a reusar na sidebar.
- `barbearia-shelby-frontend/src/components/navbar/Navbar.tsx` (`isActive`, linhas 68-79) — padrão
  já existente de comparação `pathname` (via `usePathname()` de `next/navigation`) para marcar link
  ativo; reusável na sidebar para o mesmo propósito.
- `barbearia-shelby-frontend/src/components/navbar/Navbar.scss:376-424` — padrão responsivo
  já estabelecido (`@media (max-width: 768px)`, hamburger, drawer absoluto) — referência caso a
  fase de planejamento decida por um comportamento mobile equivalente para a sidebar.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/AppointmentCard.tsx:6,8` —
  padrão de import de ícones (`react-icons/fa`, `react-icons/md`) já em uso dentro da própria área
  `/barber`.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/styles.module.scss:5-14` —
  tokens de cor escura já definidos e em uso; fonte a seguir para a paleta da sidebar (em vez de
  criar uma paleta nova).

## 7) Documentação externa (via Context7)

### Consultas realizadas

| Library ID | Query | Resumo do resultado |
|------------|-------|---------------------|
| `/vercel/next.js/v16.1.1` | "nested layout.tsx sharing UI (sidebar) across a route segment and its subroutes in App Router" | Confirma que o padrão correto e recomendado é um `layout.tsx` default-exportando um componente que recebe `children: React.ReactNode` e renderiza UI persistente (ex.: sidebar) ao redor de `{children}` — layouts preservam estado e não rerenderizam na navegação entre subrotas. É exatamente o padrão já usado em todo o projeto (`barber/layout.tsx` e os 4 `layout.tsx` de subrota existentes), sem necessidade de Parallel Routes (`@slot`) — essas só seriam necessárias se a sidebar precisasse de navegação/estado independente da própria árvore de rotas, o que não é o caso aqui (a sidebar é só uma lista estática de links + guard, igual ao `Navbar` global já existente). |

### Trechos relevantes
- **Next.js (App Router, `layout.tsx`)**: layout compartilhado básico — mesmo formato já usado em
  `barber/layout.tsx` hoje:
  ```tsx
  export default function DashboardLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return <section>{children}</section>
  }
  ```
  Confirma que basta o `barber/layout.tsx` atual (que já segue esse formato) passar a renderizar
  a sidebar ao lado de `{children}`, sem precisar de Parallel Routes/Server Actions/nenhuma API
  nova do framework.

## 8) Impactos prováveis (áreas afetadas)
- Frontend — Shell de rota: `barber/layout.tsx` (novo container flex sidebar + conteúdo).
- Frontend — Componente de navegação: `BarberHeader.tsx` (substituído/reescrito) e o ponto de
  instanciação em `BarberDashboard.tsx:112-119`.
- Frontend — Guards duplicados por subrota (`configuracoes`, `metricas`, `planos`, `usuarios`
  `layout.tsx`): decisão de manter ou consolidar num guard central fica para a fase de
  planejamento (nota explícita do roadmap, não obrigatória).
- Frontend — Estilo: tokens de cor de `BarberDashboard/styles.module.scss` (fonte a seguir/reusar)
  e novo arquivo de estilo para o componente de sidebar.
- Nenhum impacto em backend, schema, ou contrato de API.

## 9) Critérios de aceitação
- [ ] Sidebar só-ícones (com tooltip) aparece em **todas** as subpáginas de `/barber` (raiz,
      `agenda`, `billing`, `configuracoes`, `metricas`, `planos`, `usuarios`), não só na raiz.
- [ ] Primeiro ícone da sidebar é "Site" e leva para `/` (landing page pública, inalterada).
- [ ] Ícones restantes espelham exatamente as opções hoje em `BarberHeader`: Agenda, Novo
      Agendamento, Faturamento, Métricas, Configurações, Usuários, Planos.
- [ ] `barbeiro` vê Agenda, Novo Agendamento, Faturamento (e Site) — não vê Métricas,
      Configurações, Usuários, Planos.
- [ ] `dono` e `admin` veem todos os ícones (Site, Agenda, Novo Agendamento, Faturamento,
      Métricas, Configurações, Usuários, Planos).
- [ ] Cada ícone mostra tooltip com o rótulo textual ao passar o mouse.
- [ ] Item da rota atual tem indicação visual de "ativo" na sidebar.
- [ ] Sidebar usa a paleta escura já usada no projeto (`$dark-bg`/`$card-bg`/`$brand-color`/etc.
      de `BarberDashboard/styles.module.scss`), não a paleta clara do template de referência.
- [ ] Acesso direto por URL a `/barber/metricas`, `/barber/configuracoes`, `/barber/usuarios`,
      `/barber/planos` por um `barbeiro` continua bloqueado (redirect para `/Login`), como hoje.
- [ ] Visitante (não logado) e `cliente` continuam acessando exatamente `/`, `/Servicos`,
      `/Login`, `/CriarConta`, `/EsqueciSenha`, `/agendamento`, `/meus-servicos` sem nenhuma
      mudança de layout/comportamento — landing page `/` continua idêntica, sem versão SaaS.
- [ ] `next build` e `next lint` passam sem erro.

## 10) Open Questions (bloqueios / dúvidas)
Nenhuma bloqueante para a pesquisa. Duas decisões foram deixadas explicitamente para a fase de
planejamento pelo próprio roadmap (não são lacunas de pesquisa, são pontos de decisão de design/
escopo já sinalizados):
- Comportamento exato da sidebar em telas pequenas/mobile — a pesquisa encontrou o padrão
  responsivo existente no projeto (`Navbar.scss` hamburger+drawer; `BarberDashboard` reflow
  vertical em coluna) como evidência suficiente para decidir na fase de planejamento sem virar
  Open Question genuína.
- Consolidar os 4 `layout.tsx` de subrota (`configuracoes`, `metricas`, `planos`, `usuarios`) num
  guard central único — decisão de risco/escopo, não de fato ausente no codebase (o padrão de
  `allowedUserType` como lista já existe e é direto de replicar/consolidar).
