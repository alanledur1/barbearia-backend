import { Prisma } from '@prisma/client';
import { CustomError } from '../utils/customErrors';
import { prisma } from '../services/prisma.service';

// Tipos para os dados do payload
type ClientData = { name: string; email: string; phone: string; };
type CreateAppointmentPayload = {
    clientId?: number;
    clientData?: ClientData;
    serviceId: number;
    requestedDateTime: Date;
    adminId?: number;
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
        durationMinutes: number,
        excludeAppointmentId?: number
    ): Promise<boolean> {
        const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);

        // Encontrar agendamentos existentes que se sobrepoem ao periodo desejado
        const overlappingAppointments: { id: number; date: Date; durationMinutes: number }[] = await prisma.appointment.findMany({
            where: {
                id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
                status: { in: ['CONFIRMED'] },
                date: {
                    lt: endDateTime,
                    gte: new Date(startDateTime.getFullYear(), startDateTime.getMonth(), startDateTime.getDate())
                }
            },
            select: { id: true, date: true, durationMinutes: true }
        });

        // Fazer a verificação precisa de sobreposicao em memoria
        return !overlappingAppointments.some(existing => {
            const existingStart = existing.date;
            const existingEnd = new Date(existingStart.getTime() + existing.durationMinutes * 60 * 1000);
            return existingStart < endDateTime && existingEnd > startDateTime;
        });
    }


    async listAll() {
        return await prisma.appointment.findMany({
            include: {
                client: true,
                service: true,
                admin: true,
            },
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
        const { clientId, clientData, serviceId, requestedDateTime, adminId } = payload;
        let finalClientId: number;

        if (clientId) {
            // Usuário logado
            const clientExists = await prisma.client.findUnique({ where: { id: clientId } });
            if (!clientExists) throw new CustomError('Cliente logado não encontrado no sistema.', 404);
            finalClientId = clientId;
        } else if (clientData) {
            // Convidado: encontrar ou criar pelo email
            let client = await prisma.client.findUnique({ where: { email: clientData.email } });
            if (!client) {
                client = await prisma.client.create({ data: {
                    name: clientData.name,
                    email: clientData.email,
                    phone: clientData.phone,
                }});
            }
            finalClientId = client.id;
        } else {
            throw new CustomError('Dados do cliente insuficientes para o agendamento.', 400);
        }

        // Admin: usa o adminId fornecido ou o padrão
        let assignedAdminId = adminId;
        if (!assignedAdminId) {
            const defaultAdmin = await prisma.admin.findFirst();
            if (!defaultAdmin) throw new CustomError('Nenhum barbeiro configurado no sistema.', 500);
            assignedAdminId = defaultAdmin.id;
        }

        const service = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new CustomError('Serviço não encontrado.', 404);

        // Valida horário de funcionamento
        this.validateBusinessHours(requestedDateTime, service.duration);

        // Disponibilidade
        const isAvailable = await this.checkAvailability(requestedDateTime, service.duration);
        if (!isAvailable) throw new CustomError('Horário selecionado não está disponível.', 409);

        const newAppointment = await prisma.appointment.create({
            data: {
                clientId: finalClientId,
                serviceId,
                adminId: assignedAdminId,
                durationMinutes: service.duration,
                date: requestedDateTime,
                status: 'CONFIRMED',
            },
        });

        return newAppointment;
    }

    // Adicione os métodos update e delete para Appointment, com IDs como 'number'
    async update(id: number, dataToUpdate: any) {
        const existing = await prisma.appointment.findUnique({ where: { id } });
        if (!existing) throw new CustomError('Agendamento não encontrado.', 404);

        const newStartDate = existing.date
            ? new Date(dataToUpdate.date as string | Date)
            : existing.date;

        const newDuration = typeof dataToUpdate.durationMinutes === 'number'
            ? dataToUpdate.durationMinutes
            : existing.durationMinutes;

        this.validateBusinessHours(newStartDate, newDuration);

        if (newStartDate.getTime() !== existing.date.getTime() || newDuration !== existing.durationMinutes) {
            const isAvailable = await this.checkAvailability(newStartDate, newDuration, id);
            if (!isAvailable) throw new CustomError('Horário selecionado não está disponível.', 409);
        }

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

