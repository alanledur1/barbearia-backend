import { prisma } from '../services/prisma.service';
import { EmailService } from '../notifications/email.service';

const emailService = new EmailService();

// Epic 11 — Configurações do admin: auditoria e filas.
//
// Este job não se auto-registra mais via cron.schedule no import (como fazia antes, comentado).
// Quem decide quando rodar é o schedulerManager, conforme o JobConfig (jobKey = 'appointmentReminder')
// configurável pelo admin. O canal de notificação passou de WhatsApp (whatsappService, que
// permanece comentado/morto) para email real, via EmailService (Epic 10).
export async function runAppointmentReminderJob(): Promise<void> {
    console.log('⏰ [appointmentReminder] Verificando agendamentos para amanhã...');

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
        include: { client: true, service: true, admin: true },
    });

    if (appointments.length === 0) {
        console.log('📭 [appointmentReminder] Nenhum agendamento confirmado para amanhã.');
        return;
    }

    let sent = 0;
    for (const appointment of appointments) {
        const email = appointment.guestEmail || appointment.client?.email;
        if (!email) continue;

        const name = appointment.guestName || appointment.client?.name || 'cliente';
        try {
            await emailService.sendAppointmentReminder(email, {
                clientName: name,
                serviceName: appointment.service.name,
                date: appointment.date,
                barberName: appointment.admin?.name,
            });
            sent++;
        } catch (err) {
            console.error(`[appointmentReminder] Falha ao enviar lembrete para ${email}:`, err);
        }
    }

    console.log(`✅ [appointmentReminder] ${sent}/${appointments.length} lembrete(s) enviado(s).`);
}
