# PRD — Integração da página pública de Serviços com o CRUD de serviços existente, garantindo fonte única de verdade

## 1) Objetivo
- Fazer a página pública `/Servicos` (frontend) exibir os serviços realmente cadastrados via CRUD
  de serviços do backend (`Service` no Prisma, `service.controller.ts`/`service.routes.ts`),
  em vez de uma lista estática hardcoded desconectada do banco.
- Eliminar a duplicação de fonte de verdade: hoje existem dois "catálogos" de serviços que não se
  falam — o array estático da página pública e a tabela `Service` gerenciada pelo CRUD do
  `/barber` (dashboard do barbeiro). Depois deste epic, `/Servicos` reflete diretamente o que
  está no banco (criar/editar/excluir um serviço via CRUD aparece/some da página pública).

## 2) Escopo
**Inclui**
- Alterar `barbearia-shelby-frontend/src/components/Servicos/servicos.tsx` para buscar os
  serviços via `GET /services` (API real) em vez do array estático `servicos`.
- Ajustar a UI do card de serviço para exibir os campos reais retornados pela API
  (`name`, `description`, `price`, `duration`) — hoje o card só mostra título + texto (sem preço
  nem duração).
- Tratar estados de carregamento e erro na página pública (a chamada é assíncrona; hoje a página
  não tem esses estados porque os dados eram estáticos).
- Revisar as permissões por role das rotas de serviço no backend
  (`barbearia-backend/src/routes/service.routes.ts`) para confirmar que a leitura (`GET`)
  permanece pública (sem `authMiddleware`) — pré-condição para a página `/Servicos` funcionar para
  visitante não logado — e que escrita (`POST`/`PUT`/`DELETE`) continua restrita a
  `BARBEIRO`/`DONO`/`ADMIN`.

**Não inclui (fora de escopo)**
- Mudar o schema Prisma do model `Service` (já tem todos os campos necessários: `name`,
  `description`, `price`, `duration`).
- Alterar o CRUD em si (`service.controller.ts`, `serviceService.ts`) — a lógica de create/update/
  delete já existe e funciona (usada hoje por `BarberDashboard.tsx`); não é objeto de mudança,
  apenas de revisão de permissões.
- Alterar `EditServiceModel.tsx` (usado hoje dentro de `/barber` pelo dono/barbeiro para editar
  serviços) — a menos que a revisão de permissões do passo anterior revele necessidade de mudança
  (não esperado, ver seção 5.1).
- Paginação, busca ou filtros na página `/Servicos`.
- Upload de imagem por serviço (não existe campo de imagem no model `Service`).
- Cache/revalidação avançada (ISR, SWR, React Query) — fora do padrão já usado no projeto
  (`useEffect` + `useState` + `axios`, ver seção 6).

## 3) Fluxo atual (como funciona hoje)
- **Backend**: `service.routes.ts` já expõe CRUD completo:
  `POST /services` (auth + `requireRole('BARBEIRO','DONO','ADMIN')`),
  `GET /services` (público, sem middleware),
  `GET /services/:id` (público),
  `PUT /services/:id` (auth + role),
  `DELETE /services/:id` (auth + role).
  `ServiceController`/`ServiceService` implementam create/list/getById/update/delete sobre a
  tabela `Service` do Prisma (`id`, `name`, `description`, `price`, `duration`).
- **Frontend — `/barber` (já integrado)**: `BarberDashboard.tsx` usa o hook
  `useBarberData.tsx`, que chama `api.get('/services')`, `api.post('/services')`,
  `api.put('/services/:id')`, `api.delete('/services/:id')` de verdade. O dono/barbeiro cadastra,
  edita (via `EditServiceModel.tsx`) e exclui serviços reais por ali.
- **Frontend — `/agendamento` (já integrado)**: também chama `api.get('/services')`
  (`barbearia-shelby-frontend/src/app/agendamento/page.tsx:44`) para popular a escolha de serviço
  no fluxo de agendamento — outro consumidor real da mesma API.
- **Frontend — `/Servicos` (NÃO integrado — é o problema deste epic)**: a página
  (`barbearia-shelby-frontend/src/app/Servicos/page.tsx`) apenas renderiza o componente
  `Servicos` (`src/components/Servicos/servicos.tsx`), que tem um array **hardcoded** de 9
  serviços fixos (`SOBRANCELHA`, `CORTE E BARBA`, etc.), sem `id`, sem `price`, sem `duration` —
  totalmente desconectado da tabela `Service`/CRUD. Se um dono cria/edita/exclui um serviço via
  `/barber`, a página pública `/Servicos` não muda em nada.

## 4) Fluxo desejado (comportamento esperado)
- Ao carregar `/Servicos`, o frontend busca a lista real de serviços via `GET /services` (sem
  necessidade de login — rota pública).
- Cada card exibe nome, descrição e (novo) preço e duração do serviço real.
- Se um serviço for criado, editado ou excluído via CRUD (`/barber`, dono/barbeiro/admin), a
  próxima visita/reload de `/Servicos` reflete a mudança automaticamente — sem necessidade de
  editar código do frontend.
- Estado de carregamento (skeleton/mensagem) enquanto a API responde, e estado de erro (mensagem
  amigável) se a API falhar — mesmo padrão simples já usado em `/agendamento/page.tsx` (states
  `isLoading`/`error` com `useState`).
- Visitante não logado continua acessando `/Servicos` normalmente (rota pública, sem guard de
  role) — não muda.

## 5) Mapa do Codebase (onde isso vive)

### 5.1 Entradas (rotas/telas/handlers)
- `barbearia-backend/src/routes/service.routes.ts` — define as 5 rotas do CRUD de serviço.
  `GET /` e `GET /:id` são públicas (sem `authMiddleware`); `POST`/`PUT`/`DELETE` exigem
  `authMiddleware` + `requireRole('BARBEIRO','DONO','ADMIN')`. Já está correto para o objetivo
  deste epic (leitura pública, escrita restrita) — não deve precisar de mudança, mas será
  revisado/confirmado na fase de planejamento.
- `barbearia-shelby-frontend/src/app/Servicos/page.tsx` — página pública `/Servicos`; server/client
  wrapper que renderiza `<Servicos />` dentro de um header animado. Sem lógica de dados hoje.
- `barbearia-shelby-frontend/src/components/Servicos/servicos.tsx` — componente principal a ser
  alterado: hoje tem o array estático `servicos` (linhas 23-33) e renderiza os cards a partir dele
  (linha 38 em diante, `.map`).

### 5.2 Domínio / Regras / Serviços
- `barbearia-backend/src/controllers/service.controller.ts` — `create`, `listAll`, `getById`,
  `update`, `delete`. Sem mudança de lógica esperada.
- `barbearia-backend/src/services/serviceService.ts` — regras de negócio (ex.: `delete` bloqueia
  exclusão se houver agendamento `CONFIRMED` futuro vinculado, `update` valida existência antes de
  atualizar). Sem mudança de lógica esperada.

### 5.3 Persistência / Modelos / Migrações
- `barbearia-backend/prisma/schema.prisma:30-37` — `model Service { id Int, name String,
  description String, price Float, duration Int, appointments Appointment[] }`. Já tem todos os
  campos necessários — **nenhuma migration esperada** para este epic.
- Observação: `barbearia-shelby-frontend/src/models/service.ts` define uma interface `Service`
  desalinhada do schema real (`id: string`, `defaultDurationMinutes`, sem `description`
  obrigatório) — não é usada por nenhum dos consumidores reais (`useBarberData.tsx` e
  `agendamento/page.tsx` definem seu próprio tipo `Service` local com `id: number`, `duration`,
  `price`). Não é necessário tocar neste arquivo para a integração funcionar (ver Open Questions).

### 5.4 Integrações externas (clients/adapters/providers)
- `barbearia-shelby-frontend/src/services/api.ts` — instância axios única (`baseURL:
  ${NEXT_PUBLIC_API_URL}/api`), já usada por todos os consumidores reais de `/services`. Deve ser
  reutilizada (não criar novo client).

### 5.5 UI / Componentes (se aplicável)
- `barbearia-shelby-frontend/src/components/Servicos/servicos.tsx` — componente a alterar (busca
  de dados + adaptação da renderização do card).
- `barbearia-shelby-frontend/src/components/Servicos/servicos.module.scss` — estilos do card
  (`.card`, `.header`, `.icon`, `.text`); hoje só estiliza título (`h3`) + parágrafo de texto
  (`.text`, que aparece só no hover/estado ativo). Precisará de ajuste mínimo para acomodar
  preço/duração (novo conteúdo dentro do card).
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/EditServiceModel.tsx` —
  modal de edição de serviço já funcional, usado no `/barber`; consome o tipo `Service` de
  `useBarberData.tsx` (`{ id, name, duration, price, description? }`). Não deve precisar mudar
  para este epic, mas está listado como "superfície tocada" no epic — será revisado durante o
  planejamento/implementação para confirmar que não há inconsistência de contrato com o resto do
  CRUD (ex.: campo `description` não é editável no modal hoje — apenas name/duration/price).
- `barbearia-shelby-frontend/src/hooks/useBarberData.tsx` — hook com o tipo `Service` "canônico"
  já usado pelos consumidores reais (`{ id: number; name: string; duration: number; price: number;
  description?: string }`) e as funções `addService`/`updateService`/`deleteService` que chamam a
  API real. Referência de padrão a reutilizar (não necessariamente importar diretamente, já que é
  um hook específico do dashboard autenticado, mas o **shape do tipo** deve ser espelhado/reusado
  na página pública).

### 5.6 Testes / Fixtures (se existirem)
- Não há testes automatizados (Jest/Cypress) hoje cobrindo `/Servicos`, `servicos.tsx`,
  `service.controller.ts` ou `service.routes.ts`. Nenhum teste existente para atualizar.

## 6) Padrões existentes para reuso (evitar duplicação)
- `barbearia-shelby-frontend/src/app/agendamento/page.tsx:15,40-54` — padrão já usado no projeto
  para buscar `/services` publicamente numa página client-side: `type Service = { id: number; name:
  string; duration: number; price: number; }`, `useEffect` chamando `api.get('/services')` com
  `useState` para `services`/`isLoading`/`error`. Este é o padrão mais próximo do que `/Servicos`
  precisa (mesma rota, mesmo tipo de consumidor público) e deve ser reaproveitado como referência
  de implementação.
- `barbearia-shelby-frontend/src/services/api.ts` — client axios único; deve ser importado, não
  recriado.
- `barbearia-shelby-frontend/src/hooks/useBarberData.tsx` — mostra o shape completo de `Service`
  (incluindo `description`) e como tratar erros de resposta da API (`err.response?.data?.error`).

## 7) Documentação externa (via Context7)
Não foi necessário consultar Context7: a integração usa apenas padrões internos já estabelecidos
no próprio projeto (axios + useEffect/useState em componente client Next.js, Express Router +
Prisma já existentes). Não há biblioteca nova sendo introduzida nem uso de API de framework fora
do que já está em uso idêntico em `agendamento/page.tsx` e `useBarberData.tsx`.

### Consultas realizadas
| Library ID | Query | Resumo do resultado |
|------------|-------|---------------------|
| — | — | Não aplicável — nenhuma lib nova, padrão já replicado no próprio codebase. |

### Trechos relevantes
- Não aplicável.

## 8) Impactos prováveis (áreas afetadas)
- Frontend — `src/components/Servicos/servicos.tsx`: maior mudança (busca de dados real + ajuste
  de renderização do card).
- Frontend — `src/components/Servicos/servicos.module.scss`: ajuste de estilo para exibir
  preço/duração no card.
- Backend — `src/routes/service.routes.ts`: revisão (provavelmente sem mudança de código, apenas
  confirmação) de que `GET` é público e `POST`/`PUT`/`DELETE` exigem role de staff.
- Frontend — `EditServiceModel.tsx` / `BarberDashboard.tsx`: possível revisão sem mudança
  funcional (superfícies citadas no epic), a confirmar durante planejamento.
- Nenhum impacto em schema/migração, nenhum impacto em outras páginas (`/agendamento` e `/barber`
  já consomem a mesma API e não são afetadas por mudanças em `/Servicos`).

## 9) Critérios de aceitação
- [ ] `/Servicos` exibe os serviços reais cadastrados no banco (via `GET /services`), não mais o
      array estático.
- [ ] Criar um serviço novo via `/barber` (CRUD) faz ele aparecer em `/Servicos` (após reload).
- [ ] Editar um serviço via `/barber` (`EditServiceModel.tsx`) faz a mudança refletir em
      `/Servicos` (após reload).
- [ ] Excluir um serviço via `/barber` faz ele sumir de `/Servicos` (após reload).
- [ ] Cada card em `/Servicos` mostra nome, descrição, preço e duração do serviço.
- [ ] `/Servicos` continua acessível sem login (visitante/cliente), sem exigir nenhum papel.
- [ ] Se a API falhar ou não houver serviços cadastrados, a página não quebra (mostra estado de
      erro ou "nenhum serviço disponível" em vez de tela em branco/erro JS).
- [ ] Rotas de escrita de serviço (`POST`/`PUT`/`DELETE /services`) continuam restritas a
      `BARBEIRO`/`DONO`/`ADMIN` (nenhuma regressão de segurança).

## 10) Open Questions (bloqueios / dúvidas)
- Nenhuma bloqueante identificada até aqui. Duas decisões de produto ficam para a Fase 2
  (workshop), a resolver com evidência de codebase/convenção existente, não bloqueiam a pesquisa:
  1. Layout exato de como preço/duração aparecem no card (hover-only como a descrição hoje, ou
     sempre visível) — decisão de UI, resolvida no workshop seguindo o padrão visual existente do
     próprio `servicos.module.scss`.
  2. Se `barbearia-shelby-frontend/src/models/service.ts` (interface `Service` desalinhada, não
     usada por ninguém) deve ser removida/alinhada ou apenas ignorada — não bloqueia a
     implementação (nenhum consumidor real a importa), decisão de escopo a confirmar no workshop.
