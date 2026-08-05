import { CustomError } from '../utils/customErrors';
import { prisma } from './prisma.service';
import { AuditService, AuditActor } from './auditService';

export type BusinessHoursEntry = {
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
};

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class BusinessHoursService {
    private auditService = new AuditService();

    async listAll() {
        return prisma.businessHours.findMany({ orderBy: { dayOfWeek: 'asc' } });
    }

    async updateBulk(actor: AuditActor, entries: BusinessHoursEntry[]) {
        if (!Array.isArray(entries) || entries.length !== 7) {
            throw new CustomError('É necessário enviar exatamente 7 entradas (uma por dia da semana).', 400);
        }

        const seenDays = new Set<number>();
        for (const entry of entries) {
            if (typeof entry.dayOfWeek !== 'number' || entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
                throw new CustomError('dayOfWeek inválido (deve ser 0-6).', 400);
            }
            if (seenDays.has(entry.dayOfWeek)) {
                throw new CustomError(`Dia da semana duplicado no payload: ${entry.dayOfWeek}.`, 400);
            }
            seenDays.add(entry.dayOfWeek);

            if (typeof entry.openTime !== 'string' || typeof entry.closeTime !== 'string' ||
                !TIME_REGEX.test(entry.openTime) || !TIME_REGEX.test(entry.closeTime)) {
                throw new CustomError('Horário inválido (formato esperado: HH:mm).', 400);
            }
            if (!entry.isClosed) {
                const [openH, openM] = entry.openTime.split(':').map(Number);
                const [closeH, closeM] = entry.closeTime.split(':').map(Number);
                if (openH * 60 + openM >= closeH * 60 + closeM) {
                    throw new CustomError(
                        `Horário de abertura deve ser antes do fechamento (dia ${entry.dayOfWeek}).`,
                        400
                    );
                }
            }
        }

        await prisma.$transaction(
            entries.map((entry) =>
                prisma.businessHours.upsert({
                    where: { dayOfWeek: entry.dayOfWeek },
                    update: {
                        openTime: entry.openTime,
                        closeTime: entry.closeTime,
                        isClosed: entry.isClosed,
                    },
                    create: {
                        dayOfWeek: entry.dayOfWeek,
                        openTime: entry.openTime,
                        closeTime: entry.closeTime,
                        isClosed: entry.isClosed,
                    },
                })
            )
        );

        await this.auditService.log(actor, 'BUSINESS_HOURS', 'BUSINESS_HOURS_UPDATE', 'BusinessHours', null, { days: entries.length });
        return this.listAll();
    }
}
