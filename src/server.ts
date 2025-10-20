import app from "./app";
import dotenv from "dotenv";
dotenv.config();

console.log("--- Verificando DATABASE_URL ---");
console.log("URL do Banco de Dados:", process.env.DATABASE_URL);
console.log("--- Fim da Verificação ---");

const PORT = Number(process.env.PORT) || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

// Captura erros globais (para descobrir se algo encerra o processo)
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Unhandled Rejection:", reason);
});
