SPEC PATH: barbearia-backend/SDD/SPEC/2026-07-30-integracao-pagina-servicos-crud.md

# Spec — Integração da página pública de Serviços com o CRUD de serviços existente, garantindo fonte única de verdade

## Objective
- Trocar a fonte de dados da página pública `/Servicos` de um array estático hardcoded para a API
  real (`GET /services`), tornando a tabela `Service` a fonte única de verdade tanto para o CRUD
  (`/barber`) quanto para a vitrine pública (`/Servicos`).
- Confirmar (sem regressão) que as permissões por role do CRUD de serviços continuam corretas:
  leitura pública, escrita restrita a `BARBEIRO`/`DONO`/`ADMIN`.

## Scope
**In**
- `barbearia-shelby-frontend/src/components/Servicos/servicos.tsx` — busca real de dados.
- `barbearia-shelby-frontend/src/components/Servicos/servicos.module.scss` — estilo da nova linha
  de preço/duração e dos estados de loading/erro/vazio.
- `barbearia-backend/src/routes/service.routes.ts` — revisão de permissões (leitura, sem mudança
  de código esperada).

**Out**
- Schema Prisma (`prisma/schema.prisma`) — sem mudança, `Service` já tem os campos necessários.
- `service.controller.ts`, `serviceService.ts` — sem mudança de lógica.
- `EditServiceModel.tsx`, `BarberDashboard.tsx`, `useBarberData.tsx` — sem mudança (revisados,
  contrato já compatível com o shape retornado pela API).
- `barbearia-shelby-frontend/src/models/service.ts` — não usado por nenhum consumidor real, não
  tocado.
- `barbearia-shelby-frontend/src/app/Servicos/page.tsx` — não precisa mudar (só renderiza
  `<Servicos />`, sem lógica de dados).

## Files to Modify

### `barbearia-shelby-frontend/src/components/Servicos/servicos.tsx`
- Changes:
  - Remover o array estático `servicos` (nomes/textos fixos).
  - Adicionar `import api from '@/services/api';`.
  - Definir `type Service = { id: number; name: string; description: string; price: number;
    duration: number };` no topo do arquivo.
  - Adicionar estados: `const [servicos, setServicos] = useState<Service[]>([]);`,
    `const [loading, setLoading] = useState(true);`, `const [error, setError] = useState<string |
    null>(null);`.
  - Adicionar `useEffect` que, ao montar, chama `api.get<Service[]>('/services')`, popula
    `servicos` com `response.data`, trata erro definindo `error` com mensagem amigável (ex.:
    `'Não foi possível carregar os serviços. Tente novamente mais tarde.'`), e usa `finally` para
    `setLoading(false)` — mesmo padrão de `agendamento/page.tsx:40-54`.
  - No `.map` de renderização, usar `service.id` como `key` (em vez de `servico.title`, que não
    existe mais — nomes de serviço podem se repetir, `id` é estável e único).
  - `<h3>{service.name}</h3>` no lugar de `servico.title` (CSS já faz uppercase via `text-
    transform` no seletor `.header h3`).
  - `<p className={styles.text}>{service.description}</p>` no lugar de `servico.text`.
  - Adicionar, dentro do `.header` ou logo abaixo dele (fora de `.text`, ou seja, sempre visível,
    não escondido no hover), um elemento com a nova classe `styles.meta` mostrando preço e
    duração formatados, ex.:
    ```tsx
    <span className={styles.meta}>
      {service.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      {' · '}
      {service.duration} min
    </span>
    ```
  - Antes do `return` do grid, tratar os 3 estados:
    - `if (loading) return <section className={styles.servicos}><p className={styles.status}>
      Carregando serviços...</p></section>;`
    - `if (error) return <section className={styles.servicos}><p className={styles.status}>
      {error}</p></section>;`
    - `if (servicos.length === 0) return <section className={styles.servicos}><p
      className={styles.status}>Nenhum serviço disponível no momento.</p></section>;`
  - Manter o restante da estrutura (`useHasHover`, `active`/`setActive`, `motion.div`,
    `RiScissors2Fill`) inalterado — só a fonte dos dados e os campos exibidos mudam.
- Notes/Constraints:
  - `description`, `price` e `duration` vêm do Prisma como campos obrigatórios (`String`,
    `Float`, `Int`) — não é necessário fallback/optional chaining para eles, mas o `try/catch` do
    fetch cobre falha de rede/API fora do ar.
  - Não introduzir nova lib (sem SWR/React Query) — manter `useState`/`useEffect` puro, como já é
    convenção no projeto (`agendamento/page.tsx`).
- Reuse:
  - Padrão de fetch de `barbearia-shelby-frontend/src/app/agendamento/page.tsx:40-54`.
  - Client axios único `barbearia-shelby-frontend/src/services/api.ts`.

### `barbearia-shelby-frontend/src/components/Servicos/servicos.module.scss`
- Changes:
  - Adicionar classe `.meta` para a linha de preço/duração: fonte pequena, cor de destaque
    (reaproveitar a cor de acento já usada no arquivo, `#f67366`, para diferenciar de `.text`),
    sempre visível (sem `opacity: 0`/`max-height: 0` como `.text` tem), margem pequena para
    separar do `h3`.
  - Adicionar classe `.status` para as mensagens de loading/erro/vazio: texto centralizado,
    padding vertical, cor neutra (`#cfcfcf`, já usada em `.text`), para ficar consistente com a
    paleta escura do restante do arquivo.
- Notes/Constraints:
  - Não alterar `.card`, `.grid`, `.header`, `.icon`, `.text` existentes — apenas adicionar as
    duas classes novas, para minimizar risco de regressão visual no hover/active já existentes.
- Reuse:
  - Paleta de cores já usada no arquivo (`#f67366` acento, `#cfcfcf` texto secundário, `#fff`
    título).

## Files to Create
Nenhum arquivo novo é necessário.

## Backend — Revisão (sem mudança de código esperada)

### `barbearia-backend/src/routes/service.routes.ts`
- Changes:
  - Nenhuma mudança de código esperada. Ler o arquivo por completo e confirmar:
    - `router.get("/", serviceController.listAll)` — sem `authMiddleware`/`requireRole` (rota
      pública, necessária para `/Servicos` funcionar sem login).
    - `router.get("/:id", serviceController.getById)` — idem, pública.
    - `router.post("/", authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'),
      serviceController.create)` — protegida.
    - `router.put("/:id", authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'),
      serviceController.update)` — protegida.
    - `router.delete("/:id", authMiddleware, requireRole('BARBEIRO', 'DONO', 'ADMIN'),
      serviceController.delete)` — protegida.
  - Se qualquer uma dessas 5 linhas divergir do que está documentado acima (achado inesperado),
    parar e reportar como mismatch (não corrigir silenciosamente uma mudança de segurança sem
    registrar) — mas a pesquisa da Fase 1/2 do SDD já confirmou que está correto.
- Notes/Constraints:
  - Strings de role devem bater exatamente com `enum UserRole` (`prisma/schema.prisma:8-13`):
    `CLIENTE`, `BARBEIRO`, `DONO`, `ADMIN`.
- Reuse:
  - `barbearia-backend/src/middlewares/authMiddleware` e
    `barbearia-backend/src/middlewares/requireRole.middleware.ts` já existentes, sem mudança.

## Implementation Order (recommended)
1. `service.routes.ts` — revisão/confirmação (rápido, sem código, desbloqueia certeza sobre a API
   pública antes de codar o frontend).
2. `servicos.tsx` — trocar array estático por fetch real + estados de loading/erro/vazio.
3. `servicos.module.scss` — adicionar `.meta` e `.status`.
4. Build/lint do frontend e do backend.
5. Validação manual (E2E) do fluxo completo: criar/editar/excluir serviço via `/barber` e
   conferir reflexo em `/Servicos`.

## Validation (commands / checks)
- `cd barbearia-backend && npm run build`
- `cd barbearia-shelby-frontend && npm run build`
- `cd barbearia-shelby-frontend && npx eslint src/components/Servicos/servicos.tsx
  src/app/Servicos/page.tsx`
- Manual: `GET /api/services` sem header `Authorization` → `200`; `POST /api/services` sem
  header `Authorization` → `401`/`403`.
- Manual: navegar `/Servicos` deslogado e confirmar dados reais; criar/editar/excluir serviço via
  `/barber` e confirmar reflexo em `/Servicos` após reload.

## Notes
- Esta spec não introduz nenhuma mudança de contrato de API (payload/rota/status code) — apenas
  passa a consumir uma rota já existente e pública (`GET /services`) de um novo lugar do
  frontend. Não há necessidade de sinalizar mudança de contrato entre os dois repositórios.
