import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pkg from "pg";

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

// Agora estamos passando o adapter válido, então o PrismaClient não está "vazio"
export const prisma = new PrismaClient({
  adapter,
} as any);