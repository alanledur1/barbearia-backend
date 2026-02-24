import { prisma } from "./db";
import bcrypt from "bcrypt";

async function main() {
  const passwordHash = await bcrypt.hash("admin08983547", 10);

  const admin = await prisma.admin.upsert({
    where: { email: "admin@barbearia.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@barbearia.com",
      password: passwordHash,
      phone: "51998177919",
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
