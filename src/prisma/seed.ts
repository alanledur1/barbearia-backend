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

  const weekdays = [0, 1, 2, 3, 4, 5, 6];
  for (const dayOfWeek of weekdays) {
    await prisma.businessHours.upsert({
      where: { dayOfWeek },
      update: {},
      create: { dayOfWeek, openTime: "09:00", closeTime: "20:00", isClosed: false },
    });
  }
  console.log("✅ Horário de funcionamento padrão (9h-20h, todo dia) garantido.");

  const serviceCount = await prisma.service.count();
  if (serviceCount === 0) {
    await prisma.service.createMany({
      data: [
        { name: "Corte Masculino", description: "Corte tradicional ou degradê, com acabamento.", price: 40, duration: 40 },
        { name: "Barba", description: "Aparo e desenho de barba com toalha quente.", price: 30, duration: 30 },
        { name: "Combo Corte + Barba", description: "Corte masculino e barba no mesmo horário.", price: 65, duration: 70 },
        { name: "Degradê", description: "Degradê navalhado com acabamento na régua.", price: 45, duration: 45 },
        { name: "Sobrancelha", description: "Design de sobrancelha na navalha.", price: 15, duration: 15 },
      ],
    });
    console.log("✅ Serviços padrão criados.");
  } else {
    console.log("↷ Serviços já existentes, seed de serviços ignorado.");
  }
}

main()
  .catch((e) => {
    console.error("❌ Erro ao criar usuários:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
