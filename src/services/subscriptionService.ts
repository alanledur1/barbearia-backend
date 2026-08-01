import { CustomError } from '../utils/customErrors';
import { prisma } from './prisma.service';
import { resolveCurrentCycle } from '../utils/subscriptionCycle';

type SubscriptionWithPlan = {
    id: number;
    status: string;
    startDate: Date;
    currentCycleStart: Date;
    cutsUsedInCycle: number;
    plan: {
        id: number;
        name: string;
        description: string | null;
        cutsPerCycle: number;
        price: number;
        benefits: string | null;
        active: boolean;
    };
};

export class SubscriptionService {
    async subscribe(clientId: number, planId: number) {
        const plan = await prisma.plan.findUnique({ where: { id: planId } });
        if (!plan || !plan.active) {
            throw new CustomError('Plano não encontrado ou indisponível.', 404);
        }

        const existingActive = await prisma.clientSubscription.findFirst({
            where: { clientId, status: 'ACTIVE' },
        });
        if (existingActive) {
            throw new CustomError(
                'Você já possui uma assinatura ativa. Cancele-a antes de assinar outro plano.',
                409
            );
        }

        const now = new Date();
        const subscription = await prisma.clientSubscription.create({
            data: {
                clientId,
                planId,
                status: 'ACTIVE',
                startDate: now,
                currentCycleStart: now,
                cutsUsedInCycle: 0,
            },
            include: { plan: true },
        });

        return this.toSummary(subscription, now);
    }

    async getMine(clientId: number) {
        const subscription = await prisma.clientSubscription.findFirst({
            where: { clientId, status: 'ACTIVE' },
            include: { plan: true },
            orderBy: { createdAt: 'desc' },
        });
        if (!subscription) return null;

        return this.toSummary(subscription, new Date());
    }

    async cancelMine(clientId: number) {
        const subscription = await prisma.clientSubscription.findFirst({
            where: { clientId, status: 'ACTIVE' },
        });
        if (!subscription) {
            throw new CustomError('Você não possui uma assinatura ativa.', 404);
        }
        return prisma.clientSubscription.update({
            where: { id: subscription.id },
            data: { status: 'CANCELLED' },
        });
    }

    // Monta um resumo com o estado do ciclo vigente (sem persistir — a persistência do rollover
    // só acontece no momento de um consumo real, em AppointmentService.createAppointment).
    private toSummary(subscription: SubscriptionWithPlan, now: Date) {
        const { cycleStart, cycleEnd, cutsUsed } = resolveCurrentCycle(
            subscription.currentCycleStart,
            subscription.cutsUsedInCycle,
            now
        );
        return {
            id: subscription.id,
            status: subscription.status,
            startDate: subscription.startDate,
            plan: subscription.plan,
            cycleStart,
            cycleEnd,
            cutsUsed,
            cutsRemaining: Math.max(subscription.plan.cutsPerCycle - cutsUsed, 0),
        };
    }
}
