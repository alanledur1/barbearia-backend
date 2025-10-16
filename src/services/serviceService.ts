import { CustomError } from '../utils/customErrors';
import { prisma } from './prisma.service';
import { Prisma } from '@prisma/client';

export class ServiceService {
    // Método para criar um novo serviço
    // Os dados de um serviço são name, description, price, duration (conforme seu schema.prisma)
    async create(data: { name: string; description: string; price: number; duration: number; }) {
        
        try {
            const newService = await prisma.service.create({
                data: {
                    name: data.name,
                    description: data.description,
                    price: data.price,
                    duration: data.duration,
                },
            });
            return newService;
        } catch (error: any) {
            console.error("Error creating service:", error);
            throw error;
        }
    }



    // Método para listar todos os serviços
    async listAll() {
        return await prisma.service.findMany({
            // Se você quiser incluir os agendamentos relacionados a cada serviço, use 'include'
            // include: {
            //     appointments: {
            //         include: {
            //             client: true,
            //             service: true, // Já é o próprio serviço, então não precisa aqui
            //             admin: true,
            //         },
            //     },
            // },
        });
    }

    // Método para buscar um serviço por ID
    // O ID de Service é 'number' (Int)
    async findById(id: number) {
        return await prisma.service.findUnique({
            where: { id },
            // Se quiser incluir os agendamentos relacionados, use 'include'
            // include: {
            //     appointments: {
            //         include: {
            //             client: true,
            //             service: true, // Já é o próprio serviço, então não precisa aqui
            //             admin: true,
            //         },
            //     },
            // }
        });
    }

    // Método para atualizar um serviço existente
    async update(
        id: number,
        dataToUpdate: Prisma.ServiceUpdateInput
    ) {
        const serviceExists = await prisma.service.findUnique({ where: { id } });
        if (!serviceExists) {
            throw new CustomError('Serviço não encontrado para atualização.', 404);
        }
        return await prisma.service.update({ where: { id }, data: dataToUpdate });
    }

    // Método para deletar um serviço
    async delete(id: number) {
        const serviceExists = await prisma.service.findUnique({ where: { id } });
        if (!serviceExists) {
            throw new CustomError('Serviço não encontrado para exclusão.', 404);
        }

        // --- VERIFICAÇÃO CORRIGIDA E MAIS PRECISA ---
        const relatedAppointments = await prisma.appointment.count({
            where: {
                serviceId: id,
                // Apenas status CONFIRMED bloqueia a exclusão
                status: 'CONFIRMED',
                // Apenas agendamentos futuros (ou de hoje) bloqueiam
                date: {
                    gte: new Date() // gte: "maior ou igual a" data/hora atual
                }
            },
        });

        if (relatedAppointments > 0) {
            throw new CustomError(
                `Não é possível excluir: serviço vinculado a ${relatedAppointments} agendamento(s) futuro(s).`,
                409
            );
        }

        // Se a verificação passar, prossegue com a exclusão.
        return await prisma.service.delete({ where: { id } });
    }
}