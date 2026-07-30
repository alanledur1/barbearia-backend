import "dotenv/config";
import { prisma } from "./db";
import bcrypt from "bcrypt";

async function main() {
  const donoPasswordHash = await bcrypt.hash("admin08983547", 10);
  const dono = await prisma.user.upsert({
    where: { email: "admin@barbearia.com" },
    update: {},
    create: {
      name: "Dono",
      email: "admin@barbearia.com",
      password: donoPasswordHash,
      phone: "51998177919",
      role: "DONO",
    },
  });

  const adminPasswordHash = await bcrypt.hash("admin08983547", 10);
  const admin = await prisma.user.upsert({
    where: { email: "admin.sistema@barbearia.com" },
    update: {},
    create: {
      name: "Admin Sistema",
      email: "admin.sistema@barbearia.com",
      password: adminPasswordHash,
      role: "ADMIN",
    },
  });

  const barbeiroPasswordHash = await bcrypt.hash("barbeiro12345", 10);
  const barbeiro = await prisma.user.upsert({
    where: { email: "barbeiro.exemplo@barbearia.com" },
    update: {},
    create: {
      name: "Barbeiro Exemplo",
      email: "barbeiro.exemplo@barbearia.com",
      password: barbeiroPasswordHash,
      role: "BARBEIRO",
    },
  });

  console.log("✅ Usuários criados com sucesso:");
  console.log({ dono, admin, barbeiro });
}

main()
  .catch((e) => {
    console.error("❌ Erro ao criar usuários:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
