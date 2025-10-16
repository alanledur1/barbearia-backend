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

        // Rejeita a criação de agendamentos no passado
        if (requestedDateTime < new Date()) {
            throw new CustomError('A data/hora do agendamento deve ser no futuro.', 400);
        }

        const service = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new CustomError('Serviço não encontrado.', 404);

        // Validações de horário (permanecem as mesmas)
        this.validateBusinessHours(requestedDateTime, service.duration);
        const isAvailable = await this.checkAvailability(requestedDateTime, service.duration);
        if (!isAvailable) throw new CustomError('Horário selecionado não está disponível.', 409);

        // --- LÓGICA DE CLIENTE ATUALIZADA ---
        const appointmentData: Prisma.AppointmentCreateInput = {
            date: requestedDateTime,
            durationMinutes: service.duration,
            status: 'CONFIRMED',
            notes: notes,
            service: { connect: { id: serviceId } },
        };

        // Define quem é o profissional responsável (admin)
        let assignedAdminId = adminId;
        if (!assignedAdminId) {
            const defaultAdmin = await prisma.admin.findFirst();
            if (!defaultAdmin) throw new CustomError('Nenhum profissional configurado no sistema.', 500);
            assignedAdminId = defaultAdmin.id;
        }
        appointmentData.admin = { connect: { id: assignedAdminId } };
        
        // Define para qual cliente é o agendamento
        if (clientId) {
            // Caso 1: Cliente está logado. Associa o agendamento ao seu ID.
            const clientExists = await prisma.client.findUnique({ where: { id: clientId } });
            if (!clientExists) throw new CustomError('Cliente logado não encontrado no sistema.', 404);
            appointmentData.client = { connect: { id: clientId } };

        } else if (clientData?.phone) {
            // Caso 2: Cliente convidado OU o admin está criando o agendamento para um cliente específico.
            const existingClient = await prisma.client.findFirst({
                where: { phone: clientData.phone },
            });

            if (existingClient) {
                // Se o cliente já existe, associa o agendamento a ele.
                appointmentData.client = { connect: { id: existingClient.id } };
            } else {
                // Se não existe, salva os dados do convidado diretamente no agendamento.
                // **NÃO CRIA UM NOVO CLIENTE.**
                appointmentData.guestName = clientData.name;
                appointmentData.guestEmail = clientData.email;
                appointmentData.guestPhone = clientData.phone;
            }
        } else {
            throw new CustomError('Dados do cliente insuficientes para o agendamento.', 400);
        }
        // Cria o agendamento no banco de dados
        const newAppointment = await prisma.appointment.create({
            data: appointmentData,
        });

        return newAppointment;
    }

    // Adicione os métodos update e delete para Appointment, com IDs como 'number'
    async update(id: number, dataToUpdate: { status?: 'COMPLETED' | 'CANCELLED', date?: string | Date, durationMinutes?: number }) {
        const existing = await prisma.appointment.findUnique({ where: { id } });
        if (!existing) {
            throw new CustomError('Agendamento não encontrado.', 404);
        }

        // --- LÓGICA DE ATUALIZAÇÃO CORRIGIDA ---

        // 1. Verifica se a data ou a duração estão sendo alteradas
        const isRescheduling = dataToUpdate.date || dataToUpdate.durationMinutes;

        if (isRescheduling) {
            // 2. Se for um reagendamento, executa a validação de horário
            const newStartDate = dataToUpdate.date ? new Date(dataToUpdate.date) : existing.date;
            const newDuration = typeof dataToUpdate.durationMinutes === 'number' ? dataToUpdate.durationMinutes : existing.durationMinutes;

            this.validateBusinessHours(newStartDate, newDuration);

            const isAvailable = await this.checkAvailability(newStartDate, newDuration, id);
            if (!isAvailable) {
                throw new CustomError('Horário selecionado não está disponível para reagendamento.', 409);
            }
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

