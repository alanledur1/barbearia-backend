/*import cron from 'node-cron';
import { prisma } from '../services/prisma.service';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// 🕘 Executa todos os dias às 09:00 da manhã
cron.schedule('0 9 * * *', async () => {
  console.log("⏰ Verificando agendamentos para amanhã...");

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const start = new Date(tomorrow.setHours(0, 0, 0, 0));
  const end = new Date(tomorrow.setHours(23, 59, 59, 999));

  const appointments = await prisma.appointment.findMany({
    where: {
      date: { gte: start, lte: end },
      status: 'CONFIRMED',
    },
    include: { client: true },
  });

  if (appointments.length === 0) {
    console.log("📭 Nenhum agendamento confirmado para amanhã.");
    return;
  }

  for (const app of appointments) {
    const phone = app.guestPhone || app.client?.phone;
    if (!phone) continue;

    const name = app.guestName || app.client?.name || 'cliente';
    const formattedDate = format(app.date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const message = `📅 Olá ${name}! Lembrando que você tem um horário amanhã (${formattedDate}) na Barbearia. Esperamos por você! 💈`;

    await sendWhatsappMessage(phone, message);
  }

  console.log(`✅ ${appointments.length} lembretes enviados com sucesso!`);
});
*/