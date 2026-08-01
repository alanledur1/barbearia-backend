import { CustomError } from '../utils/customErrors';
import { prisma } from './prisma.service';
import { Prisma } from '@prisma/client';

export type CreatePlanData = {
    name: string;
    description?: string;
    cutsPerCycle: number;
    price: number;
    benefits?: string;
};

export type UpdatePlanData = Partial<{
    name: string;
    description: string;
    cutsPerCycle: number;
    price: number;
    benefits: string;
    active: boolean;
}>;

function validateCutsAndPrice(cutsPerCycle: unknown, price: unknown) {
    if (typeof cutsPerCycle !== 'number' || !Number.isInteger(cutsPerCycle) || cutsPerCycle <= 0) {
        throw new CustomError('Cortes por ciclo deve ser um número inteiro maior que zero.', 400);
    }
    if (typeof price !== 'number' || price < 0) {
        throw new CustomError('Preço inválido.', 400);
    }
}

export class PlanService {
    // Lista pública — só planos ativos, para quem pode assinar.
    async listActive() {
        return prisma.plan.findMany({ where: { active: true }, orderBy: { price: 'asc' } });
    }

    // Lista completa (inclui inativos) — para a página de gestão (DONO/ADMIN).
    async listAll() {
        return prisma.plan.findMany({ orderBy: { createdAt: 'desc' } });
    }

    async findById(id: number) {
        const plan = await prisma.plan.findUnique({ where: { id } });
        if (!plan) throw new CustomError('Plano não encontrado.', 404);
        return plan;
    }

    async create(data: CreatePlanData) {
        if (!data.name) {
            throw new CustomError('Nome do plano é obrigatório.', 400);
        }
        validateCutsAndPrice(data.cutsPerCycle, data.price);

        return prisma.plan.create({
            data: {
                name: data.name,
                description: data.description,
                cutsPerCycle: data.cutsPerCycle,
                price: data.price,
                benefits: data.benefits,
            },
        });
    }

    async update(id: number, data: UpdatePlanData) {
        const existing = await prisma.plan.findUnique({ where: { id } });
        if (!existing) {
            throw new CustomError('Plano não encontrado.', 404);
        }

        if (data.cutsPerCycle !== undefined || data.price !== undefined) {
            validateCutsAndPrice(
                data.cutsPerCycle !== undefined ? data.cutsPerCycle : existing.cutsPerCycle,
                data.price !== undefined ? data.price : existing.price
            );
        }

        const updateData: Prisma.PlanUpdateInput = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.cutsPerCycle !== undefined) updateData.cutsPerCycle = data.cutsPerCycle;
        if (data.price !== undefined) updateData.price = data.price;
        if (data.benefits !== undefined) updateData.benefits = data.benefits;
        if (data.active !== undefined) updateData.active = data.active;

        return prisma.plan.update({ where: { id }, data: updateData });
    }
}
