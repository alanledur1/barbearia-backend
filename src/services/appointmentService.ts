import { Prisma } from '@prisma/client';
import { CustomError } from '../utils/customErrors';
import { prisma } from '../services/prisma.service';
import { sendWhatsappMessage } from '../notifications/whatsapp.service';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';


// Tipos para os dados do payload
type ClientData = { name: string; email: string; phone: string; };
type CreateAppointmentPayload = {
    clientId?: number;
    clientData?: ClientData;
    serviceId: number;
    requestedDateTime: Date;
    adminId?: number;
    notes?: string;
};
type ListAllFilters = {
    date?: string;
    clientId?: number;
};

export class AppointmentService {

    private validateBusinessHours(start: Date, durationMinutes: number) {
        const businessOpenHour = 9; // Início do horário de funcionamento
        const businessCloseHour = 20; // Fim do horário de funcionamento
        const endDate = new Date(start.getTime() + durationMinutes * 60 * 1000);

        if (start.getHours() < businessOpenHour) {
            throw new CustomError(`Agendamentos permitidos apenas a partir das ${businessOpenHour}:00.`, 400);
        }

        if (endDate.getHours() > businessCloseHour ||
            (endDate.getHours() === businessCloseHour && endDate.getMinutes() > 0)) {
            throw new CustomError(`Agendamentos permitidos até as ${businessCloseHour}:00.`, 400);
        }
    }

    async checkAvailability(
        startDateTime: Date,
        endDateTime: Date, // <-- Recebe a data final
        excludeAppointmentId?: number
    ): Promise<boolean> {

        // Esta query faz TUDO no banco de dados.
        const overlappingCount = await prisma.appointment.count({
            where: {
                id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
                status: 'CONFIRMED',
                AND: [
                    { date: { lt: endDateTime } },      // Começa ANTES do novo terminar
                    { endDate: { gt: startDateTime } } // Termina DEPOIS do novo começar
                ]
            }
        });

        // Se a contagem for 0, o horário está disponível.
        return overlappingCount === 0;
    }


    async listAll(filters: ListAllFilters) {
        const where: Prisma.AppointmentWhereInput = {};

        // Se um clientId foi fornecido, adiciona ao filtro
        if (filters.clientId) {
            where.clientId = filters.clientId;
        }

        // Se uma data foi fornecida, filtra os agendamentos para aquele dia específico
        if (filters.date) {
            const startDate = new Date(filters.date);
            startDate.setUTCHours(0, 0, 0, 0);

            const endDate = new Date(startDate);
            endDate.setUTCDate(startDate.getUTCDate() + 1);

            where.date = {
                gte: startDate,
                lt: endDate,
            };
        }

        return await prisma.appointment.findMany({
            where, // Aplica os filtros construídos
            select: {
                id: true,
                date: true,
                durationMinutes: true,
                status: true,
                notes: true,
                // Garante que os campos de convidado sejam retornados
                guestName: true,
                guestEmail: true,
                guestPhone: true,
                // Mantém o retorno dos relacionamentos
                client: true,
                service: true,
                serviceId: true,
                admin: {
                    select: {
                        // Seleciona apenas os campos seguros do admin, evitando a senha
                        id: true,
                        name: true,
                        email: true,
                    }
                }
            },
            orderBy: { date: 'asc' }, // Ordena por data crescente
        });
    }

    async findById(id: number) {
        return await prisma.appointment.findUnique({
            where: { id },
            include: {
                client: true,
                service: true,
                admin: true,
            },
        });
    }

    async createAppointment(payload: CreateAppointmentPayload): Promise<any> {
        const { clientId, clientData, serviceId, requestedDateTime, adminId, notes } = payload;

        // Rejeita agendamentos no passado
        if (requestedDateTime < new Date()) {
            throw new CustomError('A data/hora do agendamento deve ser no futuro.', 400);
        }

        const service = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new CustomError('Serviço não encontrado.', 404);

        const endDateTime = new Date(requestedDateTime.getTime() + service.duration * 60 * 1000);

        // Valida horário e disponibilidade
        this.validateBusinessHours(requestedDateTime, service.duration);
        const isAvailable = await this.checkAvailability(requestedDateTime, endDateTime);
        if (!isAvailable) throw new CustomError('Horário selecionado não está disponível.', 409);

        // Monta o objeto do agendamento
        const appointmentData: Prisma.AppointmentCreateInput = {
            date: requestedDateTime,
            endDate: endDateTime,
            durationMinutes: service.duration,
            status: 'CONFIRMED',
            notes,
            service: { connect: { id: serviceId } },
        };

        // Define o admin
        let assignedAdminId = adminId;
        if (!assignedAdminId) {
            const defaultAdmin = await prisma.admin.findFirst();
            if (!defaultAdmin) throw new CustomError('Nenhum profissional configurado.', 500);
            assignedAdminId = defaultAdmin.id;
        }
        appointmentData.admin = { connect: { id: assignedAdminId } };

        // Define o cliente
        if (clientId) {
            appointmentData.client = { connect: { id: clientId } };
        } else if (clientData?.phone) {
            const existingClient = await prisma.client.findFirst({ where: { phone: clientData.phone } });

            if (existingClient) {
                appointmentData.client = { connect: { id: existingClient.id } };
            } else {
                appointmentData.guestName = clientData.name;
                appointmentData.guestEmail = clientData.email;
                appointmentData.guestPhone = clientData.phone;
            }
        } else {
            throw new CustomError('Dados do cliente insuficientes para o agendamento.', 400);
        }

        // ✅ Cria o agendamento no banco
        // Cria o agendamento no banco de dados
        const appointment = await prisma.appointment.create({
            data: appointmentData,
            include: {
                client: true,
                service: true,
                admin: true,
            },
        });

        // Envia mensagem no WhatsApp
        try {
            const formattedDate = format(new Date(appointment.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
            const phone = appointment.guestPhone || clientData?.phone || appointment.client?.phone;

            if (phone) {
                const name = appointment.guestName || clientData?.name || appointment.client?.name || "cliente";
                const message = `💈 Olá ${name}! Seu horário foi confirmado para ${formattedDate}. Estamos te esperando na Barbearia! ✂️`;

                await sendWhatsappMessage(phone, message);
            }
        } catch (error) {
            console.error("⚠️ Falha ao enviar mensagem no WhatsApp:", error);
        }

        return appointment;
    }


    // Adicione os métodos update e delete para Appointment, com IDs como 'number'
    async update(id: number, dataToUpdate: { status?: 'COMPLETED' | 'CANCELLED', date?: string | Date, durationMinutes?: number }) {
        const existing = await prisma.appointment.findUnique({ where: { id } });
        if (!existing) {
            throw new CustomError('Agendamento não encontrado.', 404);
        }

        if (dataToUpdate.status === 'CANCELLED') {
            const now = new Date();
            const appointmentDate = new Date(existing.date);
            const hoursDifference = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

            // Se a diferenca for menor que 1 hora, nao permite o cancelamento
            if (hoursDifference < 1) {
                throw new CustomError('Cancelamentos devem ser feitos com pelo menos 1 hora de antecedência.', 400);
            }
        }

        // 1. Verifica se a data ou a duração estão sendo alteradas
        const isRescheduling = dataToUpdate.date || dataToUpdate.durationMinutes;

        if (isRescheduling) {
            // 2. Se for um reagendamento, executa a validação de horário
            const newStartDate = dataToUpdate.date ? new Date(dataToUpdate.date) : existing.date;
            const newDuration = typeof dataToUpdate.durationMinutes === 'number' ? dataToUpdate.durationMinutes : existing.durationMinutes;

            const newEndDate = new Date(newStartDate.getTime() + newDuration * 60 * 1000);
            this.validateBusinessHours(newStartDate, newDuration);

            const isAvailable = await this.checkAvailability(newStartDate, newEndDate, id);
            if (!isAvailable) {
                throw new CustomError('Horário selecionado não está disponível para reagendamento.', 409);
            }

            // IMPORTANTE: Adicione o newEndDate aos dados para salvar
            // Precisamos forçar o tipo 'any' aqui para adicionar a propriedade
            (dataToUpdate as any).endDate = newEndDate;
        }

        // 3. Executa a atualização no banco de dados.
        // Isso funciona tanto para a mudança de status quanto para o reagendamento.
        return prisma.appointment.update({ where: { id }, data: dataToUpdate });
    }


    async delete(id: number) {
        try {
            const deletedAppointment = await prisma.appointment.delete({
                where: { id },
            });
            return deletedAppointment;
        } catch (error: any) {
            console.error("Error deleting appointment in service:", error);
            if (error.code === 'P2025') throw new CustomError('Agendamento não encontrado para exclusão.', 404);
            throw error;
        }
    }
}

