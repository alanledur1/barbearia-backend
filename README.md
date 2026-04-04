<div align="center">

# Barbearia Shelby — Backend

API REST completa para gerenciamento de barbearia com autenticação, agendamentos, notificações automáticas e integração com WhatsApp.

[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-Express-green?style=flat-square&logo=node.js)](https://nodejs.org)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-banco%20de%20dados-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org)

🖥️ **[Repositório do Frontend](https://github.com/alanledur1/barbearia-shelby-frontend)**

</div>

---

## 📋 Sobre o projeto

Backend da plataforma **Barbearia Shelby**, responsável por toda a lógica de negócio da aplicação. A API gerencia clientes, administradores, serviços e agendamentos, além de automatizar notificações via WhatsApp e e-mail e gerar relatórios em PDF.

---

## ✨ Funcionalidades

- 🔐 **Autenticação JWT** — Login e controle de acesso separado para clientes e administradores
- 📅 **Gestão de agendamentos** — Criação, consulta e controle de horários
- 👥 **Gestão de clientes** — Cadastro e gerenciamento de clientes
- ✂️ **Gestão de serviços** — Cadastro e edição dos serviços oferecidos pela barbearia
- 📄 **Geração de PDF** — Relatórios gerados automaticamente com Puppeteer
- ⏰ **Tarefas agendadas** — Automações periódicas com node-cron
- 🛡️ **Segurança** — Senhas criptografadas com bcrypt, headers protegidos com Helmet e CORS configurado

### 🚧 Em desenvolvimento

- 💬 **Notificações via WhatsApp** — Envio automático de confirmações e lembretes de agendamento
- 📧 **Notificações via E-mail** — Envio de confirmações e comunicados

---

## 🚀 Tecnologias

| Tecnologia | Uso |
|---|---|
| [Node.js](https://nodejs.org) + [Express 5](https://expressjs.com) | Servidor e roteamento da API |
| [TypeScript](https://www.typescriptlang.org) | Tipagem estática em todo o projeto |
| [Prisma ORM](https://www.prisma.io) | Acesso e modelagem do banco de dados |
| [PostgreSQL](https://www.postgresql.org) | Banco de dados relacional |
| [JWT](https://jwt.io) | Autenticação e autorização |
| [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | Hash seguro de senhas |
| [Zod](https://zod.dev) | Validação de dados nas rotas |
| [whatsapp-web.js](https://wwebjs.dev) | Integração com WhatsApp |
| [Nodemailer](https://nodemailer.com) + [Resend](https://resend.com) | Envio de e-mails |
| [Puppeteer](https://pptr.dev) | Geração de PDFs |
| [node-cron](https://github.com/node-cron/node-cron) | Tarefas automáticas agendadas |
| [date-fns](https://date-fns.org) | Manipulação de datas |
| [Helmet](https://helmetjs.github.io) | Segurança de headers HTTP |

---

## 🗂️ Estrutura da API

A API expõe rotas sob o prefixo `/api`, organizadas pelos seguintes módulos:

| Módulo | Descrição |
|---|---|
| `/api/auth` | Autenticação de administradores |
| `/api/clients` | Cadastro e login de clientes |
| `/api/admins` | Gerenciamento de administradores (protegido) |
| `/api/services` | Gerenciamento dos serviços da barbearia |
| `/api/appointments` | Criação e consulta de agendamentos |

---

## 🔒 Segurança

- Senhas armazenadas com hash via **bcrypt**
- Rotas administrativas protegidas por **JWT**
- Headers HTTP protegidos com **Helmet**
- Validação de entrada com **Zod** em todas as rotas
- Variáveis sensíveis isoladas em `.env` (nunca versionadas)

---

## 👨‍💻 Autores

Desenvolvido por **Alan Ledur**

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Alan%20Ledur-blue?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/alan-ledur/)
[![GitHub](https://img.shields.io/badge/GitHub-alanledur1-black?style=flat-square&logo=github)](https://github.com/alanledur1)
[![Portfolio](https://img.shields.io/badge/Portfolio-alan--ledur.vercel.app-green?style=flat-square)](https://alan-ledur.vercel.app)

e **Carlos Henrique**

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Carlos%20Henrique-blue?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/carlos-henrique-tem-pass-finger-892001196/)
[![GitHub](https://img.shields.io/badge/GitHub-CarlosHTPF-black?style=flat-square&logo=github)](https://github.com/CarlosHTPF)
[![Portfolio](https://img.shields.io/badge/Portfolio-portifolio--nine--lake--33.vercel.app-green?style=flat-square)](https://portifolio-nine-lake-33.vercel.app)
