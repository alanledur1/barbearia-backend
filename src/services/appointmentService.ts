import { Prisma } from '@prisma/client';
import { CustomError } from '../utils/customErrors';
import { prisma } from '../services/prisma.service';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function parseTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

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

    // Consulta o horário de funcionamento configurado (BusinessHours) para o dia da semana
    // (em BRT) do agendamento, e valida se o intervalo [start, start+duration] cabe nele.
    // Se não houver linha configurada para o dia (não deveria acontecer após o seed),
    // usa o fallback histórico (9h-20h) para não travar agendamentos.
    private async validateBusinessHours(start: Date, durationMinutes: number) {
        const endDate = new Date(start.getTime() + durationMinutes * 60 * 1000);

        // Subtrai 3 horas do horário UTC para obter o horário/dia correto de Brasília (UTC-3)
        const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
        const startBRT = new Date(start.getTime() - BRT_OFFSET_MS);
        const endBRT = new Date(endDate.getTime() - BRT_OFFSET_MS);

        const dayOfWeek = startBRT.getUTCDay();
        const startMinutes = startBRT.getUTCHours() * 60 + startBRT.getUTCMinutes();
        const endMinutes = endBRT.getUTCHours() * 60 + endBRT.getUTCMinutes();

        const businessHours = await prisma.businessHours.findUnique({ where: { dayOfWeek } });

        const openTime = businessHours?.openTime ?? '09:00';
        const closeTime = businessHours?.closeTime ?? '20:00';
        const isClosed = businessHours?.isClosed ?? false;

        if (isClosed) {
            throw new CustomError('A barbearia não funciona neste dia da semana.', 400);
        }

        if (startMinutes < parseTimeToMinutes(openTime)) {
            throw new CustomError(`Agendamentos permitidos apenas a partir das ${openTime}.`, 400);
        }

        if (endMinutes > parseTimeToMinutes(closeTime)) {
            throw new CustomError(`Agendamentos permitidos até as ${closeTime}.`, 400);
        }
    }

    // Bloqueia agendamento em datas cadastradas como feriado (Holiday), comparando
    // apenas o dia (em BRT), sem componente de hora.
    private async validateNotHoliday(start: Date) {
        const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
        const startBRT = new Date(start.getTime() - BRT_OFFSET_MS);
        const dateOnly = new Date(Date.UTC(startBRT.getUTCFullYear(), startBRT.getUTCMonth(), startBRT.getUTCDate()));

        const holiday = await prisma.holiday.findUnique({ where: { date: dateOnly } });
        if (holiday) {
            throw new CustomError('A barbearia está fechada nesta data (feriado).', 400);
        }
    }
    // Checa sobreposição de horário para um barbeiro (adminId) específico.
    async checkAvailability(
        startDateTime: Date,
        endDateTime: Date,
        adminId?: number | null,
        excludeAppointmentId?: number
    ): Promise<boolean> {

        const overlappingCount = await prisma.appointment.count({
            where: {
                id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
                status: 'CONFIRMED',
                ...(adminId ? { adminId } : {}),
                AND: [
                    { date: { lt: endDateTime } },
                    { endDate: { gt: startDateTime } }
                ]
            }
        });

        return overlappingCount === 0;
    }

    // Lista os barbeiros (role BARBEIRO) selecionáveis no fluxo de agendamento.
    async listBookableBarbers() {
        return await prisma.user.findMany({
            where: { role: 'BARBEIRO' },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
    }

    // Horários já ocupados (CONFIRMED) de um barbeiro numa data específica.
    // Não retorna nenhum dado de cliente (endpoint público).
    async getAvailabilityByBarber(adminId: number, date: string) {
        const startDate = new Date(date);
        startDate.setUTCHours(0, 0, 0, 0);
        const endDate = new Date(startDate);
        endDate.setUTCDate(startDate.getUTCDate() + 1);

        return await prisma.appointment.findMany({
            where: {
                adminId,
                status: 'CONFIRMED',
                date: { gte: startDate, lt: endDate },
            },
            select: { date: true, durationMinutes: true },
            orderBy: { date: 'asc' },
        });
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

        await this.validateBusinessHours(requestedDateTime, service.duration);
        await this.validateNotHoliday(requestedDateTime);

        // Lógica de Admin — resolvida ANTES da checagem de disponibilidade,
        // para que a checagem seja sempre filtrada pelo barbeiro correto.
        let assignedAdminId = adminId;
        if (assignedAdminId) {
            const chosenProfessional = await prisma.user.findUnique({ where: { id: assignedAdminId } });
            if (!chosenProfessional || chosenProfessional.role === 'CLIENTE') {
                throw new CustomError('Profissional selecionado inválido.', 400);
            }
        } else {
            const defaultBarber = await prisma.user.findFirst({ where: { role: 'BARBEIRO' } });
            const defaultAdmin = defaultBarber ?? await prisma.user.findFirst({ where: { role: { not: 'CLIENTE' } } });
            if (!defaultAdmin) throw new CustomError('Nenhum profissional configurado.', 500);
            assignedAdminId = defaultAdmin.id;
        }

        // Chama o checkAvailability já filtrando pelo barbeiro escolhido
        const isAvailable = await this.checkAvailability(requestedDateTime, endDateTime, assignedAdminId);
        if (!isAvailable) throw new CustomError('Horário selecionado não está disponível.', 409);

        const appointmentData: Prisma.AppointmentCreateInput = {
            date: requestedDateTime,
            endDate: endDateTime, // Salva o endDate
            durationMinutes: service.duration,
            status: 'CONFIRMED',
            notes,
            service: { connect: { id: serviceId } },
            admin: { connect: { id: assignedAdminId } },
        };

        // Lógica de Cliente
        if (clientId) {
            appointmentData.client = { connect: { id: clientId } };
        } else if (clientData?.phone) {
            const existingClient = await prisma.user.findFirst({ where: { phone: clientData.phone, role: 'CLIENTE' } });
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
                    adminId: assignedAdminId,
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

            await this.validateBusinessHours(newStartDate, newDuration);
            await this.validateNotHoliday(newStartDate);

            // Filtra pelo barbeiro do agendamento existente, excluindo-o da verificação
            const isAvailable = await this.checkAvailability(newStartDate, newEndDate, existing.adminId, id);
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

