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

Antes do primeiro deploy, ou sempre que adicionar migrations em `prisma/migrations`, rode:

```bash
npm run migrate
```

Na Northflank, a forma mais segura e criar um job usando a mesma imagem/repo com o comando:

```bash
npm run migrate
```

Execute esse job antes de promover uma versao nova do servico.

Para um deploy simples com apenas uma instancia, tambem da para definir:

```env
RUN_MIGRATIONS_ON_START=true
```

Nesse modo o container roda `npm run migrate` antes de iniciar a API. Depois do primeiro deploy, volte para `false` se preferir controlar migrations manualmente por job.

## Comandos locais uteis

```bash
npm run build
npm run migrate
npm start
```

O comando `npm run deploy` agora executa apenas migrations e build. Ele nao executa seed.
