import app from "./app";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

console.log("--- Verificando DATABASE_URL ---");
console.log("URL do Banco de Dados:", process.env.DATABASE_URL);
console.log("--- Fim da Verificação ---");

const PORT = Number(process.env.PORT) || 8080;

(async () => {
  try {
    await prisma.$connect();
    console.log("✅ Banco conectado com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao conectar ao banco:", error);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
})();

// Captura erros globais (para segurança e logs)
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Unhandled Rejection:", reason);
});

process.on("SIGTERM", () => {
  console.log("⚠️ SIGTERM recebido — o container está sendo encerrado.");
});

process.on("exit", (code) => {
  console.log("🛑 Processo finalizado com código:", code);
});
