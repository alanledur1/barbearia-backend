import { prisma } from "../services/prisma.service";
import { Request, Response } from "express";

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
}