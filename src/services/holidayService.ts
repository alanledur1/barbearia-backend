import { CustomError } from '../utils/customErrors';
import { prisma } from './prisma.service';

export class HolidayService {
    async listAll() {
        return prisma.holiday.findMany({ orderBy: { date: 'asc' } });
    }

    async create(data: { date: string; reason?: string }) {
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
            return await prisma.holiday.create({
                data: { date: dateOnly, reason: data.reason },
            });
        } catch (error: any) {
            if (error.code === 'P2002') {
                throw new CustomError('Já existe um feriado cadastrado para esta data.', 409);
            }
            throw error;
        }
    }

    async delete(id: number) {
        try {
            return await prisma.holiday.delete({ where: { id } });
        } catch (error: any) {
            if (error.code === 'P2025') {
                throw new CustomError('Feriado não encontrado.', 404);
            }
            throw error;
        }
    }
}
