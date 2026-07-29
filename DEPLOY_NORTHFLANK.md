# Deploy na Northflank

Este projeto esta pronto para deploy na Northflank usando Docker e o banco PostgreSQL da Neon.

## Configuracao do servico

Crie um `Combined service` na Northflank com:

- Build type: `Dockerfile`
- Dockerfile location: `/Dockerfile`
- Build context: `/`
- Public port: `3001`
- Protocol: `HTTP`
- Health check HTTP: `/healthz`
- Start command: deixe o padrao da imagem

## Variaveis de ambiente

Configure estas variaveis no servico ou em um secret group:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
JWT_SECRET=troque_por_um_segredo_forte
RUN_MIGRATIONS_ON_START=false
```

Use a connection string da Neon em `DATABASE_URL`. Para este backend pequeno, a URL direta da Neon costuma ser a opcao mais simples, especialmente porque o mesmo valor pode ser usado pelo Prisma Migrate.

Se ativar e-mail ou WhatsApp, configure tambem:

```env
EMAIL_USER=
EMAIL_PASS=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
WHATSAPP_BUSINESS_ID=
```

## Migrations

O admin ja existe no banco, entao o deploy nao roda seed automaticamente.

### Pipeline seguro (recomendado)

Deixe `RUN_MIGRATIONS_ON_START=false` sempre. Configure um **Release Pipeline** na Northflank
(`Project → Release → Pipelines`) com os nos em sequencia:

1. **Build** — Dockerfile, como ja configurado.
2. **Job de migration** — mesma imagem buildada no passo 1, comando `npm run migrate`,
   usando o `DATABASE_URL` de producao.
3. **Promote/Deploy** — so executa se o no 2 (migration) terminar com sucesso.

Isso garante que o schema novo so aplica antes do codigo novo comecar a receber trafego, sem
depender de rodar migration manualmente nem de correr o risco de instancias concorrentes
rodando `migrate deploy` ao mesmo tempo (o que pode acontecer com `RUN_MIGRATIONS_ON_START=true`
em servicos com mais de uma replica).

### Checagem automatica antes do merge

O workflow `.github/workflows/migrate-check.yml` roda em todo PR/push que mexe em `prisma/**`:
sobe um Postgres descartavel, aplica as migrations commitadas e roda `npm run migrate:check`
(`prisma migrate diff --exit-code`) pra falhar o CI se o `schema.prisma` tiver mudanca sem
migration correspondente gerada. Isso pega o erro mais comum de quebrar producao: editar o
schema e esquecer de rodar `prisma migrate dev` pra gerar o arquivo de migration.

> **Atencao — commit direto na main:** como nao tem passo de aprovacao manual entre a
> migration e o promote, o `migrate-check` roda em paralelo com o pipeline da Northflank,
> nao antes. Ele **avisa** (check no GitHub) mas **nao bloqueia** o deploy. Na pratica isso
> quer dizer: depois de dar push, olhar o resultado do Actions **antes** de considerar o
> deploy confirmado, e seguir a risca as regras de seguranca da migration abaixo — elas sao
> a unica rede de protecao real nesse fluxo, ja que nao ha gate automatico travando o
> promote se o schema e as migrations ficarem dessincronizados.

### Regras de seguranca ao escrever uma migration

Antes de gerar/commitar uma migration, revisar o SQL gerado em
`prisma/migrations/<timestamp>_<nome>/migration.sql` e confirmar:

- **Nunca** `DROP COLUMN` / `DROP TABLE` na mesma migration que ainda esta em uso pelo codigo
  em producao. Primeiro remove o uso no codigo e faz deploy, so depois remove a coluna/tabela
  (padrao expand/contract).
- Coluna nova obrigatoria (`NOT NULL`) em tabela que ja tem dados precisa de `DEFAULT` ou
  passo de backfill antes do `NOT NULL` — nunca adicionar `NOT NULL` direto em coluna nova
  sem default numa tabela com linhas existentes (a migration falha ou trava a tabela).
- Renomear coluna/tabela quebra o Prisma Client antigo ainda rodando durante o deploy —
  preferir "criar nova coluna, migrar dado, remover a antiga depois" em vez de rename direto.
- Adicionar `UNIQUE` ou `FOREIGN KEY` numa tabela grande pode travar a tabela por bastante
  tempo — testar localmente com volume de dados parecido com producao antes de aplicar.
- Sempre rodar `npx prisma migrate dev` localmente (nunca escrever o SQL da migration a mao)
  pra manter `schema.prisma` e o historico de migrations sincronizados.
- Migration destrutiva (drop/truncate) so vai pra main com aviso explicito ao usuario e
  confirmacao de backup do banco antes do deploy.

## Comandos locais uteis

```bash
npm run build
npm run migrate
npm start
```

O comando `npm run deploy` agora executa apenas migrations e build. Ele nao executa seed.
