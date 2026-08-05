import { CustomError } from '../utils/customErrors';
import { prisma } from './prisma.service';
import { AuditService, AuditActor } from './auditService';

export class HolidayService {
    private auditService = new AuditService();

    async listAll() {
        return prisma.holiday.findMany({ orderBy: { date: 'asc' } });
    }

    async create(actor: AuditActor, data: { date: string; reason?: string }) {
        const parsedDate = new Date(data.date);
        if (isNaN(parsedDate.getTime())) {
            throw new CustomError('Data inválida.', 400);
        }
        const dateOnly = new Date(Date.UTC(
            parsedDate.getUTCFullYear(),
            parsedDate.getUTCMonth(),
            parsedDate.getUTCDate()
        ));

        try {
            const holiday = await prisma.holiday.create({
                data: { date: dateOnly, reason: data.reason },
            });
            await this.auditService.log(actor, 'HOLIDAYS', 'HOLIDAY_CREATE', 'Holiday', String(holiday.id), { date: data.date });
            return holiday;
        } catch (error: any) {
            if (error.code === 'P2002') {
                throw new CustomError('Já existe um feriado cadastrado para esta data.', 409);
            }
            throw error;
        }
    }

    async delete(actor: AuditActor, id: number) {
        try {
            const deleted = await prisma.holiday.delete({ where: { id } });
            await this.auditService.log(actor, 'HOLIDAYS', 'HOLIDAY_DELETE', 'Holiday', String(id));
            return deleted;
        } catch (error: any) {
            if (error.code === 'P2025') {
                throw new CustomError('Feriado não encontrado.', 404);
            }
            throw error;
        }
    }
}
