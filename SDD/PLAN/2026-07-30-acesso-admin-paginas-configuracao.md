# Área de configurações da aplicação com acesso total restrito ao papel admin — Implementation Plan

## Overview
Este epic abre o acesso do papel `ADMIN` às páginas/rotas de configuração hoje restritas
exclusivamente a `DONO`: horário de funcionamento + feriados (Epic 2) e CRUD de usuários
(Epic 4). É uma mudança puramente de autorização (guards), sem schema novo e sem lógica de
negócio nova — replica, nas 3 rotas backend e 2 guards frontend identificados, o mesmo padrão
`DONO + ADMIN` já usado em outras rotas do próprio repo desde o Epic 0.

## Scope
### In Scope
- Backend: `requireRole('DONO')` → `requireRole('DONO', 'ADMIN')` em
  `businessHours.routes.ts`, `holiday.routes.ts`, `user.routes.ts`.
- Frontend: `allowedUserType={['dono']}` → `allowedUserType={['dono', 'admin']}` em
  `barber/configuracoes/layout.tsx` e `barber/usuarios/layout.tsx`.
- Frontend: condição de exibição dos links "Configurações" e "Usuários" no `BarberHeader.tsx`
  passa a incluir `admin`.

### Out of Scope
- Regra de negócio do CRUD de usuários (`userService.ts` `MANAGEABLE_ROLES`) — `ADMIN` continua
  fora da lista de papéis gerenciáveis; gestão de contas `ADMIN` não é objeto deste epic.
- Novas páginas de configuração (Epic 6/7/8 ainda não existem).
- Qualquer mudança de acesso para `CLIENTE`, `BARBEIRO`, visitante ou `DONO`.
- Migration de schema (nenhuma necessária).

## Current State (from codebase)
- `barbearia-backend/src/routes/businessHours.routes.ts:9-10` — `requireRole('DONO')`.
- `barbearia-backend/src/routes/holiday.routes.ts:9-11` — `requireRole('DONO')`.
- `barbearia-backend/src/routes/user.routes.ts:11-14` — `requireRole('DONO')`.
- `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx:6` —
  `allowedUserType={['dono']}`.
- `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx:6` —
  `allowedUserType={['dono']}`.
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx:51,56` —
  `auth.user?.userType === 'dono'` controla a renderização dos links "Configurações" e
  "Usuários".
- Padrão de referência já existente no repo (não precisa criar nada novo):
  `barbearia-backend/src/routes/admin.routes.ts:14-17` (`requireRole('DONO', 'ADMIN')`),
  `barbearia-shelby-frontend/src/app/barber/layout.tsx:6`
  (`allowedUserType={['barbeiro', 'dono', 'admin']}`).

## Desired End State
Login como `ADMIN` permite navegar para `/barber/configuracoes` e `/barber/usuarios`, ver os
links no header, editar horário/feriados e fazer CRUD de usuários com sucesso (200 nas chamadas
de API). Login como `DONO` continua idêntico a antes. Login como `BARBEIRO`/`CLIENTE` e acesso
anônimo continuam bloqueados dessas duas páginas/rotas exatamente como hoje. As 7 rotas da regra
transversal do roadmap seguem acessíveis sem mudança.

## References
- PRD: `barbearia-backend/SDD/PRD/2026-07-30-acesso-admin-paginas-configuracao.md`
- Spec: `barbearia-backend/SDD/SPEC/2026-07-30-acesso-admin-paginas-configuracao.md`
- Key code references:
  - `barbearia-backend/src/routes/businessHours.routes.ts:9-10`
  - `barbearia-backend/src/routes/holiday.routes.ts:9-11`
  - `barbearia-backend/src/routes/user.routes.ts:11-14`
  - `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx:6`
  - `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx:6`
  - `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx:51,56`

---

## Phase 1: Backend — abrir guards de rota para ADMIN

### Tasks
- [ ] Em `barbearia-backend/src/routes/businessHours.routes.ts`, trocar as duas ocorrências de
      `requireRole('DONO')` por `requireRole('DONO', 'ADMIN')` (linhas 9 e 10).
- [ ] Em `barbearia-backend/src/routes/holiday.routes.ts`, trocar as três ocorrências de
      `requireRole('DONO')` por `requireRole('DONO', 'ADMIN')` (linhas 9, 10 e 11).
- [ ] Em `barbearia-backend/src/routes/user.routes.ts`, trocar as quatro ocorrências de
      `requireRole('DONO')` por `requireRole('DONO', 'ADMIN')` (linhas 11-14), e atualizar o
      comentário da linha 9 que hoje diz "restrito ao papel DONO" para refletir que `DONO` e
      `ADMIN` têm acesso (a regra de negócio do próprio CRUD — quais papéis podem ser
      gerenciados — não muda; só quem pode chamar a API).

### Success Criteria
#### Automated Verification
- [ ] `cd barbearia-backend && npm run build` — compila sem erro.
- [ ] `grep -n "requireRole('DONO')" src/routes/businessHours.routes.ts src/routes/holiday.routes.ts src/routes/user.routes.ts` não retorna nenhuma linha (todas viraram `'DONO', 'ADMIN'`).

#### Manual Verification
- [ ] Com um token de `ADMIN` válido, `GET /api/business-hours`, `GET /api/holidays` e
      `GET /api/users` retornam 200 (antes retornavam 403).
- [ ] Com um token de `BARBEIRO` ou `CLIENTE`, as mesmas rotas continuam retornando 403.
- [ ] Com um token de `DONO`, as mesmas rotas continuam retornando 200 (sem regressão).

---

## Phase 2: Frontend — abrir guards de página e links de navegação para admin

### Tasks
- [ ] Em `barbearia-shelby-frontend/src/app/barber/configuracoes/layout.tsx`, trocar
      `allowedUserType={['dono']}` por `allowedUserType={['dono', 'admin']}`.
- [ ] Em `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx`, trocar
      `allowedUserType={['dono']}` por `allowedUserType={['dono', 'admin']}`.
- [ ] Em `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`,
      trocar as duas condições `auth.user?.userType === 'dono'` (linhas 51 e 56, links
      "Configurações" e "Usuários") por uma checagem que aceite `'dono'` ou `'admin'`
      (ex.: `(auth.user?.userType === 'dono' || auth.user?.userType === 'admin')`).

### Success Criteria
#### Automated Verification
- [ ] `cd barbearia-shelby-frontend && npm run build` — compila sem erro.
- [ ] `cd barbearia-shelby-frontend && npx eslint src` — sem erros novos (lint padrão do projeto,
      já que `npm run lint` está quebrado no Next 16 — ver `CLAUDE.md`).

#### Manual Verification
- [ ] Login como `admin` no navegador: `/barber/configuracoes` e `/barber/usuarios` carregam
      normalmente (sem redirect para `/Login`), e os links "Configurações"/"Usuários" aparecem no
      `BarberHeader`.
- [ ] Login como `dono`: comportamento idêntico ao anterior (páginas e links continuam visíveis).
- [ ] Login como `barbeiro`: `/barber/configuracoes` e `/barber/usuarios` continuam redirecionando
      para `/Login`; links não aparecem no header.
- [ ] Visitante (sem login) e `cliente`: acesso direto às duas URLs continua redirecionando para
      `/Login`.
- [ ] Regra transversal do roadmap: `/`, `/Servicos`, `/Login`, `/CriarConta`, `/EsqueciSenha`,
      `/agendamento`, `/meus-servicos` seguem retornando 200 para visitante/cliente sem mudança.

---

## Testing Notes
- Unit tests: não há suíte Jest cobrindo `ProtectedRoute`/`BarberHeader`/rotas de configuração
  hoje (ver PRD, seção 5.6) — não é criada neste epic (fora de escopo, consistente com epics
  anteriores).
- Integration tests: validação via chamadas reais de API (curl ou script) com tokens dos 4
  papéis, cobrindo as 3 rotas da Phase 1.
- Manual steps: 1) login como cada papel (`dono`, `admin`, `barbeiro`, `cliente`, visitante) no
  navegador; 2) navegar para `/barber/configuracoes` e `/barber/usuarios`; 3) confirmar
  carregamento/redirect conforme a tabela de critérios de aceitação do PRD; 4) confirmar as 7
  rotas da regra transversal.

## Migration Notes
Não aplicável — nenhuma alteração de schema Prisma neste epic (só troca de argumentos de
`requireRole` e de `allowedUserType`).

## Rollout Notes
- Sem risco de dado; mudança é reversível trivialmente (reverter a lista de papéis).
- Push e deploy em produção ficam fora da autoridade desta execução (mesma política dos epics
  anteriores).

---
