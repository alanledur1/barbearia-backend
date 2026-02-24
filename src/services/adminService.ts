// src/services/admin.service.ts
import { prisma } from './prisma.service'; // Importa a instância do Prisma Client
import { Prisma } from '@prisma/client'; // Importa os tipos do Prisma para tipagem segura
import bcrypt from 'bcryptjs'; // Necessário para hash de senha se você permitir update de senha por aqui

export class AdminService {

    // 1. Listar todos os Administradores
    async listAll() {
        // Busca todos os admins. É crucial NÃO retornar a senha hasheada aqui!
        return await prisma.admin.findMany({
            select: { // Seleciona apenas os campos seguros para retornar
                id: true,
                name: true,
                email: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    // 2. Obter Administrador por ID
    async findById(id: number) {
        // Busca um admin único por ID. Também sem a senha.
        return await prisma.admin.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

    // 3. Atualizar Administrador por ID
    // Este método recebe um ID e um objeto com os dados a serem atualizados.
    // **Importante**: Se a senha for atualizada, ela deve ser hasheada AQUI no service.
    async update(id: number, dataToUpdate: Prisma.AdminUpdateInput) {
        try {
            // Se houver uma senha nova para atualizar, ela PRECISA ser hasheada aqui
            if (dataToUpdate.password && typeof dataToUpdate.password === 'string') {
                dataToUpdate.password = await bcrypt.hash(dataToUpdate.password, 10);
            }

            const updatedAdmin = await prisma.admin.update({
                where: { id },
                data: dataToUpdate,
                select: { // Retorna o admin atualizado sem a senha
                    id: true,
                    name: true,
                    email: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            return updatedAdmin;
        } catch (error: any) {
            // Prisma.PrismaClientKnownRequestError para erros conhecidos do Prisma
            if (error.code === 'P2025') { // Registro não encontrado
                return null; // Retorna null para indicar que não foi encontrado para atualização
            }
            if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
                throw new Error('Email already taken.'); // Email duplicado
            }
            console.error("Error updating admin in service:", error);
            throw error; // Relança outros erros inesperados
        }
    }

    // 4. Deletar Administrador por ID
    async delete(id: number) {
        try {
            const deletedAdmin = await prisma.admin.delete({
                where: { id },
                select: { // Opcional: retornar alguns dados do admin deletado, sem a senha
                    id: true,
                    name: true,
                    email: true,
                }
            });
            return deletedAdmin;
        } catch (error: any) {
            if (error.code === 'P2025') { // Registro não encontrado para deletar
                return null;
            }
            console.error("Error deleting admin in service:", error);
            throw error;
        }
    }
}