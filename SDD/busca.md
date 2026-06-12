Você está na **Fase 1 — Pesquisa** do workflow **Spec Driven Development (SDD)**.

### Missão
Pesquisar **o codebase atual** para viabilizar a implementação da **{FEATURE}** solicitada anteriormente e, ao final, gerar **apenas** um arquivo **PRD.md** (em Markdown), curto e filtrado, com tudo que é necessário para escrever uma **Spec** na etapa seguinte. O arquivo deve ser salvo dentro de SDD/PRDs/ com um título contendo "YYYY-MM-DD-{feature-kebab}.md"

### Regras (críticas)
1. **NÃO implemente código.**  
2. **NÃO proponha melhorias, refactors, otimizações ou mudanças de arquitetura** (a menos que eu peça explicitamente).  
3. **NÃO critique** a implementação atual.  
4. **Documente o que existe hoje**: onde está, como funciona, e como se conecta.  
5. **Se eu mencionar arquivos específicos**, leia-os **inteiros primeiro** antes de expandir a pesquisa.  
6. **Se faltar informação**, registre como **Open Questions** (não “chute” soluções).  
7. **Sempre use o MCP Context7** para consultar documentação atualizada de bibliotecas/frameworks.
   - Primeiro: `resolve-library-id` para obter o ID da biblioteca
   - Depois: `query-docs` com o ID obtido para buscar documentação específica
   - Isso garante que você está usando informações **atuais e oficiais**, não conhecimento potencialmente desatualizado.

### Contexto do Projeto
- Stack / restrições: **{STACK/RESTRIÇÕES}**
- Limites / fora de escopo: **{LIMITES}**

### O que eu quero que você investigue (checklist)
1. **Pontos de entrada** (UI/rotas/controllers/handlers/CLIs) relacionados à feature.
2. **Camadas e componentes** impactados (serviços, repositórios, models, validações, jobs, filas, emails, etc.).
3. **Padrões já existentes** para casos semelhantes (reuso de componentes, helpers, convenções).
4. **Configurações** (env vars, providers, clients, middlewares) relevantes.
5. **Persistência e dados** (models/tabelas/migrations/schemas) afetados.
6. **Integrações externas** e onde elas vivem (SDKs, clients, adapters).
7. **Testes existentes** relacionados e onde novos testes provavelmente se encaixam (apenas mapear; não criar).

### Como conduzir a pesquisa (passo a passo)
1. **Reformule o objetivo** de {FEATURE} em 3–6 bullets (para confirmar entendimento).
2. **Mapeie a área no codebase**:
   - encontre os diretórios/arquivos mais prováveis
   - identifique os principais fluxos e conexões
3. **Extraia referências úteis**:
   - paths de arquivos
   - funções/classes principais
   - trechos curtos (snippets) *apenas quando necessário* para explicar o comportamento
4. **Colete documentação externa via Context7 (obrigatório quando usar libs/frameworks)**:
   - Use `resolve-library-id` + `query-docs` para buscar docs atualizadas
   - Extraia apenas o trecho necessário
   - Inclua o libraryId usado e as queries feitas
5. **Gere o PRD.md** usando o template abaixo, **sem incluir lixo** e mantendo o documento **compacto**.

### Restrições de concisão (para economizar contexto)
- Não inclua dumps grandes de arquivos.
- Snippets devem ser **curtos** (ex.: até ~20–40 linhas) e somente quando ajudarem a explicar “como funciona”.
- Liste apenas arquivos **realmente relevantes** para {FEATURE}.

---

## Saída obrigatória: PRD.md (apenas este conteúdo)

Gere **somente** o conteúdo do PRD abaixo, em Markdown:

# PRD — {FEATURE}

## 1) Objetivo
- (O que será entregue)
- (Por que isso existe / valor)

## 2) Escopo
**Inclui**
- ...

**Não inclui (fora de escopo)**
- ...

## 3) Fluxo atual (como funciona hoje)
Descreva o fluxo atual relacionado (se existir), com referências a arquivos.

## 4) Fluxo desejado (comportamento esperado)
Descreva o comportamento esperado em alto nível (sem spec tática ainda).

## 5) Mapa do Codebase (onde isso vive)
Liste apenas o que for relevante, agrupado por área.

### 5.1 Entradas (rotas/telas/handlers)
- `path/to/file.ext` — o que faz e como se conecta

### 5.2 Domínio / Regras / Serviços
- `path/to/file.ext` — responsabilidades e principais funções/classes

### 5.3 Persistência / Modelos / Migrações
- `path/to/file.ext` — entidades/tabelas envolvidas, relações e onde são usadas
- **Migrations**: o projeto usa Flask-Migrate/Alembic. Verifique `backend/migrations/versions/` para entender o histórico de schema. Se a feature tocar em schema, documente quais tabelas/colunas são afetadas e se há migration pendente.

### 5.4 Integrações externas (clients/adapters/providers)
- `path/to/file.ext` — como integra, onde configura e como é chamado

### 5.5 UI / Componentes (se aplicável)
- `path/to/file.ext` — componentes e props importantes

### 5.6 Testes / Fixtures (se existirem)
- `path/to/file.ext` — o que cobre hoje

## 6) Padrões existentes para reuso (evitar duplicação)
Liste componentes/helpers já existentes que podem ser reutilizados, com paths e breve explicação.
- `path/to/existing_component.ext` — quando usar / como é usado hoje

## 7) Documentação externa (via Context7)
Para cada biblioteca/framework relevante, documente o que foi consultado.

### Consultas realizadas

| Library ID | Query | Resumo do resultado |
|------------|-------|---------------------|
| `/org/lib` | "query usada" | Breve resumo do que foi encontrado |

### Trechos relevantes
- **{Biblioteca}**: Trecho/exemplo mínimo necessário para a implementação
  ```código se necessário```

## 8) Impactos prováveis (áreas afetadas)
Sem detalhar a spec ainda; apenas quais áreas serão tocadas.
- Área X: ...
- Área Y: ...

## 9) Critérios de aceitação
Checklist objetiva (em linguagem de produto/usuário).
- [ ] ...
- [ ] ...

## 10) Open Questions (bloqueios / dúvidas)
Perguntas que precisam de resposta antes da Spec/Implementação.
- ...
- ...