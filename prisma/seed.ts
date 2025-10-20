import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // Define a senha padrão (você pode alterar depois)
  const passwordHash = await bcrypt.hash("admin123", 10);

  // Cria o admin se ainda não existir
  const admin = await prisma.admin.upsert({
    where: { email: "admin@barbearia.com" },
    update: {}, // não altera se já existir
    create: {
      name: "Administrador",
      email: "admin@barbearia.com",
      password: passwordHash,
      phone: "(00) 00000-0000",
    },
  });

  console.log("✅ Admin criado com sucesso:");
  console.log(admin);
}

main()
  .catch((e) => {
    console.error("❌ Erro ao criar admin:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
