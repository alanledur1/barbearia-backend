// src/app.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes"; // <--- Importe como default
import mainRouter from "./routes/index"; // <--- Importe seu index.ts de rotas
import adminRoutes from './routes/admin.routes';
/* import whatsappRoutes from "./routes/whatsapp.routes"; */

dotenv.config();

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

// Rota para autenticação
app.use("/api/auth", authRoutes); // <--- Use authRoutes (com 'R' maiúsculo)

// Rotas de Administração de Admin (onde você vai listar, alterar, deletar)
app.use('/api/admins', adminRoutes); // <-- IMPORTANTE: Usar as rotas de admin

// Rotas principais da API (clients, services, appointments)
app.use("/api", mainRouter); // <--- Use mainRouter ou o nome que você deu para o Router principal do index.ts

/* app.use("/api", whatsappRoutes); */


// ... outras middlewares ou configurações

export default app;