// Em src/server.ts (ou onde você inicia o servidor)
import app from "./app";
import dotenv from "dotenv"; // Importe dotenv se ainda não estiver
dotenv.config(); // Carrega variáveis (embora Railway injete também)

// LOG PARA VERIFICAR A URL
console.log("--- Verificando DATABASE_URL ---");
console.log("URL do Banco de Dados:", process.env.DATABASE_URL); 
console.log("--- Fim da Verificação ---");

const PORT = process.env.PORT || 8080; // Railway geralmente usa 8080 ou define PORT

app.listen(PORT, () => {
  // É importante ouvir em 0.0.0.0 (implícito por padrão no Node) ou na porta da Railway
  console.log(`🚀 Server is running on port ${PORT}`);
});