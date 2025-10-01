# Barbearia Backend

API backend para gerenciamento de barbearia (clientes, serviços, agendamentos e administradores).

## Pré-requisitos
- Node.js (v16+ recomendado)
- npm
- PostgreSQL
- (Opcional) `npx` (vem com npm)

## Instalação
No PowerShell, na raiz do projeto:

```powershell
# Instalar dependências
npm install

# Gerar o client do prisma (caso necessário)
npx prisma generate
```

## Variáveis de ambiente
Crie um arquivo `.env` na raiz do projeto com as variáveis abaixo (exemplo):

```powershell
@"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE_NAME"
JWT_SECRET="uma_chave_secreta_super_segura"
PORT=3001
NODE_ENV=development
"@" | Out-File -Encoding utf8 .env
```

Observações:
- `DATABASE_URL` deve apontar para seu banco PostgreSQL.
- `JWT_SECRET` é a chave usada para assinar tokens JWT. Mantenha-a secreta.
- `PORT` é opcional; padrão é 3001.

## Banco de dados (Prisma)
Se for a primeira execução, crie e aplique migrations (desenvolvimento):

```powershell
# Cria e aplica migrations e gera cliente Prisma
npx prisma migrate dev --name init
npx prisma generate

# Abre o Prisma Studio (UI para visualizar dados)
npx prisma studio
```

## Scripts úteis
- `npm run dev` — inicia o servidor em modo desenvolvimento (ts-node-dev)
- `npm run build` — compila TypeScript para `dist`
- `npm start` — executa `node dist/server.js` (após build)

Exemplo (desenvolvimento):

```powershell
# Roda o servidor em modo dev
npm run dev
```

## Endpoints principais
As rotas estão expostas sob o prefixo `/api`:

- Autenticação
  - POST /api/auth/register — registrar administrador
  - POST /api/auth/login — login administrador

- Admins (protegido por JWT)
  - GET /api/admins
  - GET /api/admins/:id
  - PUT /api/admins/:id
  - DELETE /api/admins/:id

- Clientes
  - POST /api/clients/signup — criar cliente
  - POST /api/clients/login — login cliente
  - GET /api/clients
  - GET /api/clients/:id
  - PUT /api/clients/:id
  - DELETE /api/clients/:id

- Serviços
  - GET /api/services
  - POST /api/services
  - GET /api/services/:id
  - PUT /api/services/:id
  - DELETE /api/services/:id

- Agendamentos
  - POST /api/appointments
  - GET /api/appointments
  - GET /api/appointments/:id

## Exemplo rápido — Registrar cliente (curl)
No PowerShell você pode usar `curl` ou `Invoke-RestMethod`.

```powershell
curl -X POST http://localhost:3001/api/clients/signup -H "Content-Type: application/json" -d '{"name":"João","email":"joao@example.com","phone":"11999999999","password":"minhaSenha"}'
```

## Observações de segurança e boas práticas
- Nunca comite o arquivo `.env` no controle de versão.
- `JWT_SECRET` deve ser forte e armazenado em um gerenciador de segredos em produção.
- Há tanto `bcrypt` quanto `bcryptjs` nas dependências; é recomendável manter apenas uma para evitar confusão. `bcryptjs` é 100% JS e evita problemas de compilação nativa.
- O middleware de erro já faz tratamento de Zod e JWT — verifique `src/middlewares/error.middleware.ts`.

## Notas sobre desenvolvimento
- Arquivos TypeScript compilados saem em `dist/` quando rodar `npm run build`.
- Endpoints que retornam senhas nunca devem expor o campo `password` (o projeto já evita isso em muitos lugares).

## Contribuindo
Sinta-se à vontade para abrir PRs com melhorias. Para mudanças que afetem banco ou modelos, atualize as migrations do Prisma.

---

Se quiser, posso:
- Remover a dependência duplicada (`bcrypt` ou `bcryptjs`) automaticamente.
- Adicionar um script de exemplo para popular dados iniciais (seed).
- Gerar um arquivo `.env.example` com as chaves esperadas.

Diga qual dessas tarefas quer que eu execute em seguida.