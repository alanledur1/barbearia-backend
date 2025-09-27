import { Prisma } from '@prisma/client';
import { Appointment } from '@prisma/client';
import { Service } from '../models/service';
import { CustomError } from '../utils/customErrors';
import { prisma } from '../services/prisma.service';


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

    async createAppointment(
        clientId: number, serviceId: number, adminId: number | undefined, requestedDateTime: Date): Promise<Appointment> {

        let assignedAdminId = adminId;

        // Se nenhum adminId foi fornecido, encontre o barbeiro padrão
        if (!assignedAdminId) {
            const defaultAdmin = await prisma.admin.findFirst(); // Pega o primeiro admin da tabela
            if (!defaultAdmin) {
                throw new CustomError('Nenhum barbeiro configurado no sistema.', 500);
            }
            assignedAdminId = defaultAdmin.id;
        }

        // Valida se o cliente e o serviço existem
        const client = await prisma.client.findUnique({ where: { id: clientId } });
        if (!client) throw new CustomError('Cliente não encontrado.', 404);

        const service = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new CustomError('Serviço não encontrado.', 404);

        // Obter a duração do serviço
        const serviceDuration = service.duration;
        this.validateBusinessHours(requestedDateTime, serviceDuration);

        // 2. Verificar disponibilidade de horário
        const isAvailable = await this.checkAvailability(requestedDateTime, serviceDuration, assignedAdminId);
        if (!isAvailable) throw new CustomError('Horário selecionado não está disponível.', 409);


        // 4. Se tudo estiver ok, cria o agendamento
        const newAppointment = await prisma.appointment.create({
            data: {
                clientId,
                serviceId,
                adminId: assignedAdminId, // <-- Salva o ID do barbeiro correto
                durationMinutes: serviceDuration,
                date: requestedDateTime,
                status: 'CONFIRMED',
            },
        });

        return newAppointment as Appointment;
    }

    async checkAvailability(
        startDateTime: Date,
        durationMinutes: number,
        excludeAppointmentId?: number
    ): Promise<boolean> {
        const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);

        // Encontrar agendamentos existentes que se sobrepoem ao periodo desejado
        const overlappingAppointments = await prisma.appointment.findMany({
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

    // Adicione os métodos update e delete para Appointment, com IDs como 'number'
    async update(id: number, dataToUpdate: Prisma.AppointmentUpdateInput) {
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

