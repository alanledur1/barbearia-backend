import { prisma } from "../services/prisma.service";
import { Request, Response } from "express";
import { AppointmentService } from "../services/appointmentService";

export class BillingController {
    async getSummary(req: Request, res: Response) {
        try {
            // 1. Busca todos os agendamentos concluídos, incluindo o serviço relacionado
            const completedAppointments = await prisma.appointment.findMany({
                where: { status: 'COMPLETED' },
                include: { service: true },
            });

            if (!completedAppointments || completedAppointments.length === 0) {
                return res.status(200).json({
                    totalRevenue: 0,
                    totalAppointments: 0,
                    averageTicket: 0,
                    servicesBreakdown: {},
                });
            }

            // 2. Calcula as metricas
            // Corrigido: Tipagem explícita para 'sum' (number) e 'app' (tipo do retorno do Prisma)
            const totalRevenue = completedAppointments.reduce(
                (sum: number, app: any) => {
                    return sum + (app.service?.price || 0);
                },
                0
            );

            const totalAppointments = completedAppointments.length;
            const averageTicket = totalAppointments > 0 ? totalRevenue / totalAppointments : 0;

            // 3. Agrupa os serviços para análise 
            const servicesBreakdown: { [key: string]: { count: number; revenue: number; } } = {};

            // Corrigido: O TypeScript agora infere 'app' corretamente do array 'completedAppointments'
            completedAppointments.forEach((app: any) => {
                const serviceName = app.service?.name || 'Serviço Removido';
                if (!servicesBreakdown[serviceName]) {
                    servicesBreakdown[serviceName] = { count: 0, revenue: 0 };
                }
                servicesBreakdown[serviceName].count++;
                servicesBreakdown[serviceName].revenue += app.service?.price || 0;
            });

            // 4. Retorna o objeto de resumo
            return res.status(200).json({
                totalRevenue,
                totalAppointments,
                averageTicket,
                servicesBreakdown,
            });
        } catch (error) {
            console.error("Erro ao gerar resumo de faturamento:", error);
            return res.status(500).json({ error: "Falha ao gerar resumo." });
        }
    }

    // Resumo de faturamento agregado por barbeiro (adminId), restrito a dono/admin.
    async getSummaryByBarber(req: Request, res: Response) {
        try {
            const appointmentService = new AppointmentService();

            const [completedAppointments, barbers] = await Promise.all([
                prisma.appointment.findMany({
                    where: { status: 'COMPLETED' },
                    include: {
                        service: true,
                        admin: { select: { id: true, name: true, role: true } },
                    },
                }),
                appointmentService.listBookableBarbers(),
            ]);

            type BarberStats = {
                adminId: number | null;
                name: string;
                role: string | null;
                totalRevenue: number;
                totalAppointments: number;
                averageTicket: number;
            };

            const statsByKey = new Map<number | 'unassigned', BarberStats>();

            // Semeia com todos os barbeiros (role BARBEIRO), inclusive os sem nenhum atendimento.
            for (const barber of barbers) {
                statsByKey.set(barber.id, {
                    adminId: barber.id,
                    name: barber.name,
                    role: 'BARBEIRO',
                    totalRevenue: 0,
                    totalAppointments: 0,
                    averageTicket: 0,
                });
            }

            for (const app of completedAppointments as any[]) {
                const key: number | 'unassigned' = app.adminId ?? 'unassigned';
                if (!statsByKey.has(key)) {
                    statsByKey.set(key, {
                        adminId: app.adminId ?? null,
                        name: app.admin?.name ?? 'Sem profissional atribuído',
                        role: app.admin?.role ?? null,
                        totalRevenue: 0,
                        totalAppointments: 0,
                        averageTicket: 0,
                    });
                }
                const entry = statsByKey.get(key)!;
                entry.totalAppointments += 1;
                entry.totalRevenue += app.service?.price || 0;
            }

            const barberStats = Array.from(statsByKey.values()).map((entry) => ({
                ...entry,
                averageTicket: entry.totalAppointments > 0 ? entry.totalRevenue / entry.totalAppointments : 0,
            })).sort((a, b) => b.totalRevenue - a.totalRevenue || a.name.localeCompare(b.name));

            const overallRevenue = barberStats.reduce((sum, b) => sum + b.totalRevenue, 0);
            const overallAppointments = barberStats.reduce((sum, b) => sum + b.totalAppointments, 0);
            const overallAverageTicket = overallAppointments > 0 ? overallRevenue / overallAppointments : 0;

            return res.status(200).json({
                overall: {
                    totalRevenue: overallRevenue,
                    totalAppointments: overallAppointments,
                    averageTicket: overallAverageTicket,
                },
                barbers: barberStats,
            });
        } catch (error) {
            console.error("Erro ao gerar resumo de faturamento por barbeiro:", error);
            return res.status(500).json({ error: "Falha ao gerar resumo por barbeiro." });
        }
    }
}