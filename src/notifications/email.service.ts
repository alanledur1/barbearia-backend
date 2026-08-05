import nodemailer from 'nodemailer';
import { ptBR } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';

// Serviço de envio de email via SMTP (nodemailer).
//
// Se SMTP_HOST estiver configurado no .env, usa o transporte SMTP real.
// Se não estiver (ex.: ambiente local sem credencial de produção), cria
// automaticamente uma conta de teste Ethereal na primeira chamada e loga a
// preview URL de cada email enviado — permite validar o fluxo fim a fim sem
// depender de credencial SMTP real.
//
// Nota: 'nodemailer' não publica tipos próprios e @types/nodemailer não pôde
// ser instalado neste ambiente (ver src/types/nodemailer.d.ts) — o módulo é
// tratado como `any`.
let cachedTransporter: any | null = null;
let usingEtherealFallback = false;

async function getTransporter(): Promise<any> {
    if (cachedTransporter) {
        return cachedTransporter;
    }

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    if (SMTP_HOST) {
        const port = Number(SMTP_PORT) || 587;
        cachedTransporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port,
            secure: port === 465,
            auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
        });
        usingEtherealFallback = false;
        return cachedTransporter;
    }

    // Fallback: sem SMTP_HOST configurado, usa uma conta de teste Ethereal.
    console.warn(
        '[EmailService] SMTP_HOST não configurado — usando conta de teste Ethereal (fallback). ' +
        'Configure SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM no .env para enviar emails reais.'
    );
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: { user: testAccount.user, pass: testAccount.pass },
    });
    usingEtherealFallback = true;
    return cachedTransporter;
}

function getFromAddress(): string {
    return process.env.SMTP_FROM || '"Barbearia Shelby" <no-reply@barbearia-shelby.local>';
}

function formatDateBR(date: Date): string {
    return formatInTimeZone(date, 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) + 'h';
}

export type AppointmentConfirmationData = {
    clientName: string;
    serviceName: string;
    date: Date;
    barberName?: string;
};

export class EmailService {
    private async send(to: string, subject: string, text: string, html: string): Promise<void> {
        const transporter = await getTransporter();
        const info = await transporter.sendMail({
            from: getFromAddress(),
            to,
            subject,
            text,
            html,
        });

        if (usingEtherealFallback) {
            const previewUrl = nodemailer.getTestMessageUrl(info);
            console.log(`[EmailService] (fallback Ethereal) Email "${subject}" para ${to} — preview: ${previewUrl}`);
        }
    }

    // Email de recuperação de senha (fluxo "Esqueci Senha") — código OTP de 6 dígitos.
    async sendPasswordResetOtp(to: string, code: string): Promise<void> {
        const subject = 'Código de recuperação de senha — Barbearia Shelby';
        const text =
            `Recebemos uma solicitação de recuperação de senha para sua conta na Barbearia Shelby.\n\n` +
            `Seu código de verificação é: ${code}\n\n` +
            `Este código expira em 10 minutos. Se você não solicitou essa alteração, ignore este email.`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                <h2 style="color: #f67366;">Recuperação de senha</h2>
                <p>Recebemos uma solicitação de recuperação de senha para sua conta na <strong>Barbearia Shelby</strong>.</p>
                <p>Seu código de verificação é:</p>
                <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; text-align: center; padding: 12px; background: #f0f0f0; border-radius: 8px;">${code}</p>
                <p>Este código expira em <strong>10 minutos</strong>.</p>
                <p style="color: #a0a0a0; font-size: 12px;">Se você não solicitou essa alteração, ignore este email.</p>
            </div>
        `;
        await this.send(to, subject, text, html);
    }

    // Email de confirmação de agendamento — disparado após criação bem-sucedida.
    async sendAppointmentConfirmation(to: string, data: AppointmentConfirmationData): Promise<void> {
        const subject = 'Agendamento confirmado — Barbearia Shelby';
        const dateFormatted = formatDateBR(data.date);
        const barberLine = data.barberName ? `Profissional: ${data.barberName}\n` : '';
        const barberHtmlLine = data.barberName ? `<p><strong>Profissional:</strong> ${data.barberName}</p>` : '';
        const text =
            `Olá, ${data.clientName}!\n\n` +
            `Seu agendamento na Barbearia Shelby foi confirmado:\n\n` +
            `Serviço: ${data.serviceName}\n` +
            `Data/Hora: ${dateFormatted}\n` +
            barberLine +
            `\nAté breve!`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                <h2 style="color: #f67366;">Agendamento confirmado</h2>
                <p>Olá, <strong>${data.clientName}</strong>!</p>
                <p>Seu agendamento na Barbearia Shelby foi confirmado:</p>
                <p><strong>Serviço:</strong> ${data.serviceName}</p>
                <p><strong>Data/Hora:</strong> ${dateFormatted}</p>
                ${barberHtmlLine}
                <p>Até breve!</p>
            </div>
        `;
        await this.send(to, subject, text, html);
    }

    // Email de lembrete de agendamento — disparado pelo job appointmentReminder (Epic 11, JobConfig).
    async sendAppointmentReminder(to: string, data: AppointmentConfirmationData): Promise<void> {
        const subject = 'Lembrete: seu agendamento é amanhã — Barbearia Shelby';
        const dateFormatted = formatDateBR(data.date);
        const barberLine = data.barberName ? `Profissional: ${data.barberName}\n` : '';
        const barberHtmlLine = data.barberName ? `<p><strong>Profissional:</strong> ${data.barberName}</p>` : '';
        const text =
            `Olá, ${data.clientName}!\n\n` +
            `Passando para lembrar do seu agendamento amanhã na Barbearia Shelby:\n\n` +
            `Serviço: ${data.serviceName}\n` +
            `Data/Hora: ${dateFormatted}\n` +
            barberLine +
            `\nAté breve!`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                <h2 style="color: #f67366;">Lembrete de agendamento</h2>
                <p>Olá, <strong>${data.clientName}</strong>!</p>
                <p>Passando para lembrar do seu agendamento <strong>amanhã</strong> na Barbearia Shelby:</p>
                <p><strong>Serviço:</strong> ${data.serviceName}</p>
                <p><strong>Data/Hora:</strong> ${dateFormatted}</p>
                ${barberHtmlLine}
                <p>Até breve!</p>
            </div>
        `;
        await this.send(to, subject, text, html);
    }

    // Email de boas-vindas — disparado após cadastro de cliente.
    async sendWelcomeEmail(to: string, name: string): Promise<void> {
        const subject = 'Bem-vindo à Barbearia Shelby';
        const text =
            `Olá, ${name}!\n\n` +
            `Sua conta na Barbearia Shelby foi criada com sucesso. Agora você já pode agendar seus horários pelo site.\n\n` +
            `Até breve!`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                <h2 style="color: #f67366;">Bem-vindo à Barbearia Shelby!</h2>
                <p>Olá, <strong>${name}</strong>!</p>
                <p>Sua conta foi criada com sucesso. Agora você já pode agendar seus horários pelo site.</p>
                <p>Até breve!</p>
            </div>
        `;
        await this.send(to, subject, text, html);
    }
}
