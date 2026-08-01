PLAN PATH: barbearia-backend/SDD/PLAN/2026-07-30-integracao-pagina-servicos-crud.md

# Integração da página pública de Serviços com o CRUD de serviços existente, garantindo fonte única de verdade — Implementation Plan

## Overview
A página pública `/Servicos` hoje renderiza um array estático de 9 serviços hardcoded no
componente `servicos.tsx`, totalmente desconectado da tabela `Service` do banco e do CRUD real já
usado em `/barber` (dashboard do barbeiro) e `/agendamento` (fluxo de agendamento). Este plano
troca a fonte de dados de `/Servicos` para a API real (`GET /services`), fazendo com que
criar/editar/excluir um serviço via CRUD passe a refletir imediatamente (no próximo carregamento)
na página pública — fonte única de verdade. Também revisa (sem alterar, pois já está correto) as
permissões por role das rotas de serviço no backend, conforme pedido pelo epic.

## Scope
### In Scope
- Buscar serviços reais via `GET /services` em `servicos.tsx` (substituindo o array estático).
- Exibir nome, descrição, preço e duração de cada serviço no card.
- Estados de carregamento e erro na página pública.
- Ajuste mínimo de CSS (`servicos.module.scss`) para acomodar preço/duração no card.
- Revisão (sem mudança de código esperada) das permissões de `service.routes.ts`.

### Out of Scope
- Alterar schema Prisma do model `Service` (já tem todos os campos necessários).
- Alterar lógica de `service.controller.ts` / `serviceService.ts`.
- Alterar `EditServiceModel.tsx` / `BarberDashboard.tsx` (revisados, contrato já compatível —
  usam o mesmo shape de `Service` que a API retorna).
- Paginação, busca, filtros, upload de imagem, cache avançado (SWR/React Query).
- Remover/corrigir `barbearia-shelby-frontend/src/models/service.ts` (interface não usada por
  nenhum consumidor real — fora do escopo deste epic).

## Current State (from codebase)
- `barbearia-shelby-frontend/src/components/Servicos/servicos.tsx:23-33` — array estático
  `servicos` com apenas `title`/`text`, sem `id`/`price`/`duration`, renderizado via `.map`.
- `barbearia-backend/src/routes/service.routes.ts:10-14` — `GET /` e `GET /:id` já são públicas
  (sem `authMiddleware`); `POST`/`PUT`/`DELETE` já exigem `authMiddleware` +
  `requireRole('BARBEIRO','DONO','ADMIN')`.
- `barbearia-backend/src/middlewares/requireRole.middleware.ts:5` — compara `req.user.role` contra
  a lista de roles recebida; strings `'BARBEIRO'`, `'DONO'`, `'ADMIN'` batem exatamente com
  `enum UserRole` em `barbearia-backend/prisma/schema.prisma:8-13`.
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx:15,40-54` — padrão já existente e
  funcional de consumo público de `GET /services` (mesma rota, mesmo caso de uso: página pública
  sem autenticação lendo o catálogo de serviços).
- `barbearia-shelby-frontend/src/hooks/useBarberData.tsx:42` — tipo `Service` "canônico" já usado
  pelos consumidores reais: `{ id: number; name: string; duration: number; price: number;
  description?: string }`.
- `barbearia-shelby-frontend/src/services/api.ts` — client axios único (`baseURL:
  ${NEXT_PUBLIC_API_URL}/api`), reutilizado por todos os consumidores reais.

## Desired End State
- Ao abrir `/Servicos` (sem login), a página busca `GET /services` e renderiza um card por
  serviço real, com nome, descrição, preço e duração.
- Criar/editar/excluir um serviço via `/barber` (CRUD) e recarregar `/Servicos` mostra a mudança
  refletida, sem qualquer alteração de código.
- Sem serviços cadastrados ou falha de rede, a página mostra uma mensagem amigável (loading/erro/
  vazio), nunca tela em branco ou erro JS não tratado.
- `npm run build` do frontend e do backend passam limpos; `npx eslint src` do frontend limpo (para
  os arquivos tocados).

## References
- PRD: `barbearia-backend/SDD/PRD/2026-07-30-integracao-pagina-servicos-crud.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-07-30-integracao-pagina-servicos-crud.md`
- Key code references:
  - `barbearia-shelby-frontend/src/components/Servicos/servicos.tsx` — componente a alterar
  - `barbearia-shelby-frontend/src/components/Servicos/servicos.module.scss` — estilos a ajustar
  - `barbearia-backend/src/routes/service.routes.ts` — permissões a revisar (confirmar, não mudar)
  - `barbearia-shelby-frontend/src/app/agendamento/page.tsx:40-54` — padrão de fetch a replicar

---

## Phase 1: Integrar `/Servicos` com a API real de serviços

### Tasks
- [x] Em `servicos.tsx`, remover o array estático `servicos` e substituir por
      `useState<Service[]>([])` + `useEffect` que chama `api.get('/services')` (mesmo padrão de
      `agendamento/page.tsx`), com estados `loading`/`error`.
- [x] Definir `type Service = { id: number; name: string; description: string; price: number;
      duration: number }` localmente no componente (mesmo shape do retorno real da API/Prisma).
- [x] Renderizar os cards a partir dos dados reais: título = `service.name` (o CSS já aplica
      `text-transform: uppercase` no `h3`, então não precisa `.toUpperCase()` manual), descrição =
      `service.description` (mantendo o comportamento atual de revelar no hover/tap via `.text`).
- [x] Adicionar ao card uma linha de metadados sempre visível com preço e duração formatados em
      pt-BR (ex.: `R$ 45,00 · 30 min`), usando o mesmo ícone `RiScissors2Fill` já usado para todos
      os cards hoje (não há campo de ícone por serviço no schema, então mantém-se decorativo/único
      como já era).
- [x] Adicionar mensagens de estado: "Carregando serviços..." durante `loading`, mensagem de erro
      amigável se a chamada falhar, e "Nenhum serviço disponível no momento." se a lista vier
      vazia.
- [x] Em `servicos.module.scss`, adicionar uma classe `.meta` (ou equivalente) para a linha de
      preço/duração, estilizada para ficar sempre visível (diferente de `.text`, que continua
      oculta até hover/tap) e consistente com a paleta/tipografia já usada no arquivo.

### Success Criteria

#### Automated Verification
- [x] `cd barbearia-shelby-frontend && npm run build` — build limpo (Next.js 16 / Turbopack).
- [x] `cd barbearia-shelby-frontend && npx eslint src/components/Servicos/servicos.tsx
      src/app/Servicos/page.tsx` — sem erros/warnings novos.

#### Manual Verification
- [x] Com o backend local rodando e ao menos um serviço cadastrado no banco, abrir `/Servicos`
      sem estar logado e confirmar que os cards mostram os serviços reais (nome, descrição, preço,
      duração) — não o array estático antigo. Confirmado via Puppeteer: `/Servicos` renderizou
      "CORTE TESTE — R$ 50,00 · 30 min" e "BARBA — R$ 30,00 · 20 min" (dados reais do banco).
- [x] Criar um serviço novo via `/barber` (logado como `dono`/`barbeiro`), recarregar `/Servicos`
      e confirmar que o novo serviço aparece. Confirmado via Puppeteer: criado "Servico E2E Teste"
      (R$ 77,00 · 30 min) em `/barber` logado como `dono` (seed `admin@barbearia.com`), e o card
      apareceu em `/Servicos` na sequência.
- [x] Editar um serviço via `EditServiceModel.tsx` em `/barber`, recarregar `/Servicos` e
      confirmar que a mudança (nome/preço/duração) aparece. Confirmado via Puppeteer: preço
      alterado de 77 para 99 no modal de edição; `/Servicos` passou a mostrar "R$ 99,00".
- [x] Excluir um serviço via `/barber`, recarregar `/Servicos` e confirmar que ele some da lista.
      Confirmado via Puppeteer: serviço excluído (com confirmação no `ConfirmationModal`) e
      "Servico E2E Teste" deixou de aparecer em `/Servicos`.

---

## Phase 2: Revisar permissões por role do CRUD de serviços (backend)

### Tasks
- [x] Ler `service.routes.ts` por completo e confirmar que `GET /` e `GET /:id` permanecem sem
      `authMiddleware`/`requireRole` (pré-condição para `/Servicos` funcionar para visitante não
      logado) e que `POST`/`PUT`/`DELETE` continuam exigindo `authMiddleware` +
      `requireRole('BARBEIRO', 'DONO', 'ADMIN')`.
- [x] Confirmar que as strings de role usadas em `requireRole(...)` batem exatamente com os
      valores do `enum UserRole` em `prisma/schema.prisma` (`CLIENTE`, `BARBEIRO`, `DONO`,
      `ADMIN`) — evitar typo silencioso que quebraria autorização.
- [x] Caso alguma inconsistência seja encontrada (não esperado pela pesquisa já feita), corrigir
      no mínimo necessário e documentar a mudança; caso contrário, nenhuma alteração de código
      nesta fase (apenas confirmação/documentação no resumo da fase). Confirmado: nenhuma
      inconsistência encontrada, nenhuma mudança de código necessária nesta fase.

### Success Criteria

#### Automated Verification
- [x] `cd barbearia-backend && npm run build` — build TypeScript limpo (garante que nenhuma
      mudança/revisão quebrou o backend).

#### Manual Verification
- [x] Chamar `GET /api/services` sem header `Authorization` e confirmar `200 OK` com a lista de
      serviços (rota pública funcionando). Confirmado via `curl` local: `200` com a lista real.
- [x] Chamar `POST /api/services` sem header `Authorization` (ou com um usuário `CLIENTE`) e
      confirmar `401`/`403` (escrita continua restrita a staff). Confirmado via `curl` local:
      `401 {"error":"Token de autenticação não fornecido ou mal formatado."}`.

---

## Testing Notes
- Unit tests: não há suíte Jest cobrindo `servicos.tsx` ou `service.routes.ts` hoje; nenhuma
  criada neste plano (fora do pedido do epic — ver PRD, seção 5.6).
- Integration tests: não há Cypress specs relevantes a `/Servicos` hoje.
- Manual steps: ver "Manual Verification" de cada fase acima; validação E2E consolidada roda como
  etapa própria do fluxo SDD (fora deste plan, no processo geral de execução do epic).

## Migration Notes
Não aplicável — o model `Service` já tem todos os campos necessários (`name`, `description`,
`price`, `duration`). Nenhuma mudança de schema, logo nenhuma `npx prisma migrate dev` é
necessária neste epic.

## Rollout Notes
- Nenhum flag de feature necessário — mudança é apenas na fonte de dados de uma página já
  publicada. Não há dependência de deploy coordenado entre frontend/backend além do que já existe
  (a API `GET /services` já está em produção e já é consumida por `/agendamento`).
