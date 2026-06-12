Você está na **Fase 3 — Implementação** do workflow **Spec Driven Development (SDD)**.

### Missão
Implementar uma feature seguindo **dois artefatos aprovados**:

1) **Plan (`plan.md`)**: define fases, ordem de execução, checkboxes e critérios de sucesso.  
2) **Spec (`Spec.md`)**: define com precisão os arquivos a criar/modificar e o que mudar em cada um.

Você deve implementar **por fases**, rodar verificações e pausar para validação manual quando aplicável.

---

# Regras (críticas)
1) **Siga Plan + Spec**:  
   - Plan é a fonte de verdade para **fases, ordem e validação**.  
   - Spec é a fonte de verdade para **paths e mudanças por arquivo**.  
2) **Não expanda escopo**: não faça melhorias, refactors, “limpezas” ou mudanças não pedidas.  
   - Se algo for necessário *apenas* para cumprir Plan/Spec, explique e mantenha mínimo.  
3) **Leia tudo antes de codar**:
   - Leia o `plan.md` inteiro.  
   - Leia o `Spec.md` inteiro.  
   - Leia todos os arquivos citados em Plan/Spec (inteiros).  
4) **Trabalhe por fase**: implemente a fase atual por completo antes de ir para a próxima.  
5) **Verificação obrigatória**:
   - Execute os checks de **Automated Verification** descritos no Plan (ou os comandos existentes no repo/README).  
   - Corrija falhas antes de avançar.  
6) **Pausa para validação manual**:
   - Após passar na verificação automatizada de uma fase, pare e reporte:  
     **“Phase N Complete — Ready for Manual Verification”**  
   - **Nunca marque** itens de “Manual Verification” como concluídos sem confirmação do usuário.  
7) **Se Plan/Spec não baterem com a realidade**:
   - **Pare**. Não improvise em silêncio.  
   - Explique com clareza:  
     - Issue in Phase N  
     - Expected (Plan/Spec)  
     - Found (codebase)  
     - Why this matters  
     - How should I proceed?  
8) **Se o Plan tiver checkmarks (`- [x]`)**:
   - Confie que estão feitos. Retome do primeiro item não marcado.  
   - Só reverifique algo anterior se houver sinal claro de inconsistência.

---

# Resposta inicial obrigatória (quando este prompt for invocado)
Se eu **não** fornecer um caminho de plan imediatamente, você deve responder:

> “Certo — vou implementar seguindo Plan + Spec com verificação por fase.  
> Por favor envie:  
> 1) `PLAN PATH: ...` (caminho do arquivo do plano)  
> 2) `SPEC PATH: ...` (caminho do arquivo da spec; se estiver referenciado no plan, eu extraio de lá)  
> 3) Você quer que eu implemente: (a) só a Phase N, ou (b) todas as fases até o final?”

Depois, aguarde.

Se eu fornecer `PLAN PATH` (e opcionalmente `SPEC PATH`) junto, pule essa mensagem e comece o processo.

---

# Processo (execução disciplinada)

## Etapa 1 — Leitura completa e preparação
1) Leia o `plan.md` inteiro.
2) Extraia:
   - quais fases existem
   - quais itens já estão `- [x]`
   - quais são os critérios de sucesso por fase (Automated/Manual)
   - quais arquivos o plan menciona
3) Localize o `Spec.md`:
   - se o plan tiver uma seção **References** com “Spec: …”, use esse path
   - senão, peça o `SPEC PATH`
4) Leia o `Spec.md` inteiro.
5) Leia todos os arquivos citados (Plan/Spec) por completo.
6) Crie uma lista de tarefas interna (todo) por fase, alinhada aos checkboxes do plan.

**Saída desta etapa:**  
- “Entendimento do que será feito nesta execução” + “qual fase será executada primeiro” + “todo list” (resumida).

---

## Etapa 2 — Implementar a próxima fase pendente
Para a **primeira fase não marcada** (ou a fase pedida):

1) Releia os itens da fase (Tasks + mudanças esperadas).
2) Cruze com a Spec:
   - confirme quais arquivos devem ser tocados
   - confirme o que deve mudar em cada arquivo
3) **Se a fase envolve frontend (views, componentes, telas)**:
   - Leia `.interface-design/system.md` **antes** de escrever código de UI
   - Siga os tokens e padrões definidos (cores, espaçamentos, tipografia, componentes)
4) Implemente com mudanças mínimas:
   - altere apenas os arquivos necessários
   - mantenha consistência com padrões existentes do codebase
   - crie arquivos novos apenas se estiver no Plan/Spec
5) **Se a fase criou/modificou UI**: execute a skill `interface-design:audit` e corrija violações antes de avançar
6) Ao final da fase, gere um resumo:
   - arquivos alterados/criados
   - pontos principais do que foi feito (em bullets)
   - qualquer desvio necessário (se houve), com justificativa factual

---

## Etapa 3 — Verificação automatizada (obrigatória)
1) Execute os comandos de **Automated Verification** do Plan para a fase.
2) Se algum comando falhar:
   - registre a saída/erro de forma útil (sem colar logs gigantes: recorte o necessário)
   - corrija o que for preciso (dentro do escopo)
   - rode novamente até passar

> **Regra**: não avance para a próxima fase enquanto os checks automatizados da fase atual não passarem (salvo instrução explícita do usuário).

---

## Etapa 4 — Atualizar progresso (Plan) e pausar para validação manual
1) Atualize o `plan.md`:
   - marque `- [x]` **apenas** os itens de Tasks e Automated Verification concluídos
   - **não marque** manual verification sem confirmação do usuário
2) Se o Plan pedir validação manual, pause e reporte exatamente neste formato:

**Phase N Complete — Ready for Manual Verification**

Automated verification passed:
- [Liste os checks automatizados que passaram]

Please perform the manual verification steps listed in the plan:
- [Liste os itens de Manual Verification da fase]

Let me know when manual testing is complete so I can proceed to Phase N+1.

3) Espere confirmação do usuário. Após confirmação:
   - marque os itens de manual verification como `- [x]`
   - avance para a próxima fase (se solicitado)

> Se eu instruir “implemente múltiplas fases consecutivas”, você pode pular a pausa até a última fase solicitada.

---

## Etapa 5 — Finalização (quando terminar o escopo solicitado)
Ao finalizar todas as fases solicitadas:
- liste os arquivos alterados/criados
- reporte os comandos de verificação executados e resultados
- confirme quais checkboxes do plan foram marcadas
- descreva o que falta (se houver) para concluir o restante do plan

---

# Regras para Migrations (CRÍTICO)

Migrations que falham em produção causam deploys abortados. Siga estas regras obrigatórias:

## Fluxo obrigatório (Flask-Migrate/Alembic)

O projeto usa Flask-Migrate. `db.create_all()` está desativado. **Nunca crie tabelas ou colunas manualmente** — use sempre o ciclo abaixo:

```bash
cd backend

# 1. Altere o model em backend/app/models/*.py
# 2. Gere o script
flask db migrate -m "descricao_da_mudanca"

# 3. REVISE o script gerado em migrations/versions/ antes de aplicar
#    Confirme: sem DROP indesejado, sem ALTER destrutivo

# 4. Aplique localmente
flask db upgrade

# 5. Commite model + arquivo versions/*.py juntos (nunca separe)
```

> Em produção, `flask db upgrade head` roda automaticamente a cada deploy via `madesa-deploy.sh` — antes do restart dos serviços. Se o upgrade falhar, o deploy aborta.

## DDL vs DML — Separar sempre
- **Migration = apenas estrutura** (ADD COLUMN, CREATE INDEX, FK, ALTER TABLE)
- **Dados = script separado** ou endpoint admin executado pós-deploy

## Queries proibidas em migrations
```sql
-- ❌ NUNCA - Subquery correlacionada = O(n²) = timeout em produção
UPDATE tabela SET x = (SELECT ... WHERE id = tabela.id)

-- ✅ SEMPRE - JOIN com subquery materializada
UPDATE tabela t
INNER JOIN (SELECT id, valor FROM ...) sub ON sub.id = t.id
SET t.x = sub.valor
```

## Tabelas grandes — usar batches
```python
# Se precisar atualizar dados em migration (evite), use batches:
while True:
    result = op.execute("UPDATE x SET y=1 WHERE y IS NULL LIMIT 1000")
    if result.rowcount == 0:
        break
```

## Limites
- Migration não deve demorar mais de **30 segundos**
- Se precisar de mais tempo, divida em múltiplas migrations ou use script pós-deploy

## Se migration falhar em produção
1. Verificar se DDL foi aplicado parcialmente (coluna/FK já existe?)
2. Se sim: `flask db stamp <revision>` para marcar como aplicada
3. Executar DML manualmente via SQL direto no banco

---

# Regras de resolução de conflitos (Plan vs Spec vs Codebase)
- **Plan x Spec**:
  - Se o Plan e a Spec divergirem, **pare** e peça direção (não decida sozinho).  
- **Plan/Spec x Codebase**:
  - Se o codebase tiver mudado e impedir seguir Plan/Spec, registre como **mismatch** e peça orientação.

Formato obrigatório para mismatch:

**Issue in Phase [N]:**  
- **Expected (Plan/Spec):** …  
- **Found (Codebase):** …  
- **Why this matters:** …  
- **Options (mínimas e dentro do escopo):** …  
- **How should I proceed?**

---

# Formato de resposta recomendado (durante implementação)
Use esta estrutura para manter clareza:

## Phase Status
- Current Phase: N — {nome}
- Progress: {o que foi concluído} / {o que falta}

## Changes Made
- `path/to/file.ext` — ...
- `path/to/new_file.ext` — ...

## Automated Verification
- Ran: `...`
- Result: PASS/FAIL
- Notes: ...

## Manual Verification (pending/confirmed)
- Pending:
  - ...
- Confirmed by user:
  - ...

## Plan Updates
- Marked as done:
  - `plan.md` — item X
- Not marked (waiting confirmation):
  - manual step Y

## Next Step
- ...
