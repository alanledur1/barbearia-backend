import { Prisma } from '@prisma/client';
import { CustomError } from '../utils/customErrors';
import { prisma } from '../services/prisma.service';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Tipos
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
// Tipo de update para incluir o endDate opcional
type UpdateAppointmentData = {
    status?: 'COMPLETED' | 'CANCELLED';
    date?: string | Date;
    durationMinutes?: number;
    endDate?: Date;
};

export class AppointmentService {

    private validateBusinessHours(start: Date, durationMinutes: number) {
        const businessOpenHour = 9;
        const businessCloseHour = 20;
        const endDate = new Date(start.getTime() + durationMinutes * 60 * 1000);

        if (start.getHours() < businessOpenHour) {
            throw new CustomError(`Agendamentos permitidos apenas a partir das ${businessOpenHour}:00.`, 400);
        }

        if (endDate.getHours() > businessCloseHour ||
            (endDate.getHours() === businessCloseHour && endDate.getMinutes() > 0)) {
            throw new CustomError(`Agendamentos permitidos até as ${businessCloseHour}:00.`, 400);
        }
    }

    // Função de check correta (apenas 2 parâmetros de data)
    async checkAvailability(
        startDateTime: Date,
        endDateTime: Date,
        excludeAppointmentId?: number
    ): Promise<boolean> {

        const overlappingCount = await prisma.appointment.count({
            where: {
                id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
                status: 'CONFIRMED',
                AND: [
                    { date: { lt: endDateTime } },
                    { endDate: { gt: startDateTime } }
                ]
            }
        });

        return overlappingCount === 0;
    }


    async listAll(filters: ListAllFilters) {
        const where: Prisma.AppointmentWhereInput = {};

        if (filters.clientId) {
            where.clientId = filters.clientId;
        }
        if (filters.date) {
            const startDate = new Date(filters.date);
            startDate.setUTCHours(0, 0, 0, 0);
            const endDate = new Date(startDate);
            endDate.setUTCDate(startDate.getUTCDate() + 1);
            where.date = { gte: startDate, lt: endDate };
        }

        return await prisma.appointment.findMany({
            where,
            select: {
                id: true,
                date: true,
                endDate: true, // Incluído
                durationMinutes: true,
                status: true,
                notes: true,
                guestName: true,
                guestEmail: true,
                guestPhone: true,
                client: true,
                service: true,
                serviceId: true,
                admin: { select: { id: true, name: true, email: true } }
            },
            orderBy: { date: 'asc' },
        });
    }

    async findById(id: number) {
        return await prisma.appointment.findUnique({
            where: { id },
            include: { client: true, service: true, admin: true },
        });
    }

    async createAppointment(payload: CreateAppointmentPayload): Promise<any> {
        const { clientId, clientData, serviceId, requestedDateTime, adminId, notes } = payload;

        if (requestedDateTime < new Date()) {
            throw new CustomError('A data/hora do agendamento deve ser no futuro.', 400);
        }

        const service = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new CustomError('Serviço não encontrado.', 404);

        // Calcula o endDate
        const endDateTime = new Date(requestedDateTime.getTime() + service.duration * 60 * 1000);

        this.validateBusinessHours(requestedDateTime, service.duration);

        // Chama o checkAvailability da forma correta
        const isAvailable = await this.checkAvailability(requestedDateTime, endDateTime);
        if (!isAvailable) throw new CustomError('Horário selecionado não está disponível.', 409);

        const appointmentData: Prisma.AppointmentCreateInput = {
            date: requestedDateTime,
            endDate: endDateTime, // Salva o endDate
            durationMinutes: service.duration,
            status: 'CONFIRMED',
            notes,
            service: { connect: { id: serviceId } },
        };

        // Lógica de Admin
        let assignedAdminId = adminId;
        if (!assignedAdminId) {
            const defaultAdmin = await prisma.admin.findFirst();
            if (!defaultAdmin) throw new CustomError('Nenhum profissional configurado.', 500);
            assignedAdminId = defaultAdmin.id;
        }
        appointmentData.admin = { connect: { id: assignedAdminId } };

        // Lógica de Cliente
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

        const appointment = await prisma.$transaction(async (tx: any) => {
            const overlapping = await tx.appointment.count({
                where: {
                    status: 'CONFIRMED',
                    AND: [
                        { date: { lt: endDateTime } },
                        { endDate: { gt: requestedDateTime } }
                    ]
                }
            });

            if (overlapping > 0) {
                throw new CustomError('Horário selecionado não está disponível.', 409);
            }

            return tx.appointment.create({
                data: appointmentData,
                include: { client: true, service: true, admin: true },
            });
        });
        return appointment;
    }

    async update(id: number, dataToUpdate: UpdateAppointmentData) {
        const existing = await prisma.appointment.findUnique({ where: { id } });
        if (!existing) {
            throw new CustomError('Agendamento não encontrado.', 404);
        }

        if (dataToUpdate.status === 'CANCELLED') {
            const now = new Date();
            const appointmentDate = new Date(existing.date);
            const hoursDifference = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

            if (hoursDifference < 1) {
                throw new CustomError('Cancelamentos devem ser feitos com pelo menos 1 hora de antecedência.', 400);
            }
        }

        const isRescheduling = dataToUpdate.date || dataToUpdate.durationMinutes;

        if (isRescheduling) {
            const newStartDate = dataToUpdate.date ? new Date(dataToUpdate.date) : existing.date;
            const newDuration = typeof dataToUpdate.durationMinutes === 'number' ? dataToUpdate.durationMinutes : existing.durationMinutes;

            const newEndDate = new Date(newStartDate.getTime() + newDuration * 60 * 1000);

            this.validateBusinessHours(newStartDate, newDuration);

            // Chamada correta (com ID para excluir ele mesmo da verificação)
            const isAvailable = await this.checkAvailability(newStartDate, newEndDate, id);
            if (!isAvailable) {
                throw new CustomError('Horário selecionado não está disponível para reagendamento.', 409);
            }

            dataToUpdate.endDate = newEndDate;
        }

        return prisma.appointment.update({ where: { id }, data: dataToUpdate });
    }

    async delete(id: number) {
        try {
            return await prisma.appointment.delete({ where: { id } });
        } catch (error: any) {
            console.error("Error deleting appointment in service:", error);
            if (error.code === 'P2025') throw new CustomError('Agendamento não encontrado para exclusão.', 404);
            throw error;
        }
    }
}

