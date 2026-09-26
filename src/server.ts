import "dotenv/config";
import app from "./app";
import { bootstrap as bootstrapSchedulers } from "./schedulers/schedulerManager";
import { logMasterPasswordStatus } from "./utils/masterPassword";
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

logMasterPasswordStatus();

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server is running on ${HOST}:${PORT}`);
});

bootstrapSchedulers().catch((err) => {
  console.error('[Scheduler] Falha ao inicializar jobs agendados:', err);
});
