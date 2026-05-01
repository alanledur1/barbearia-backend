import "dotenv/config";
import app from "./app";
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server is running on ${HOST}:${PORT}`);
});
