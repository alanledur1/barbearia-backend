// src/controllers/admin.controller.ts
import { Request, Response } from 'express';
import { AdminService } from '../services/adminService'; // Vamos criar este serviço em seguida
import { Prisma } from '@prisma/client'; // Importar tipos Prisma para tipagem segura
// import { adminSchema } from '../schemas/adminSchema'; // Se você criar um schema Zod para validação

export class AdminController {
    private adminService: AdminService;

    constructor() {
        this.adminService = new AdminService();
    }

    // 1. Listar todos os Administradores
    async listAll(_req: Request, res: Response): Promise<Response> {
        try {
            const admins = await this.adminService.listAll();
            return res.status(200).json(admins);
        } catch (error: any) {
            console.error("Error listing admins:", error);
            return res.status(500).json({ error: "Failed to fetch admins." });
        }
    }

    // 2. Obter Administrador por ID
    async getById(req: Request, res: Response): Promise<Response> {
        try {
            const { id } = req.params;
            const adminId = parseInt(id as string, 10);

            if (isNaN(adminId)) {
                return res.status(400).json({ error: 'Invalid admin ID format.' });
            }

            const admin = await this.adminService.findById(adminId);

            if (!admin) {
                return res.status(404).json({ error: 'Admin not found.' });
            }
            return res.status(200).json(admin);
        } catch (error: any) {
            console.error("Error getting admin by ID:", error);
            return res.status(500).json({ error: "Failed to fetch admin." });
        }
    }

    // 3. Atualizar Administrador por ID
    // NOTA: Para atualização de senha, geralmente é um endpoint separado por segurança.
    // Esta atualização seria para nome, email (com cuidado), etc.
    async update(req: Request, res: Response): Promise<Response> {
        try {
            const { id } = req.params;
            const adminId = parseInt(id as string, 10);

            if (isNaN(adminId)) {
                return res.status(400).json({ error: 'Invalid admin ID format.' });
            }

            // Você pode usar um schema Zod aqui para validar os dados do corpo da requisição
            // const validatedData = adminSchema.partial().parse(req.body);
            // const dataToUpdate: Prisma.AdminUpdateInput = validatedData;
            const dataToUpdate: Prisma.AdminUpdateInput = req.body; // Apenas para exemplo sem Zod

            // **IMPORTANTE**: Não permita a atualização direta da senha por aqui sem hashing.
            // Se 'password' estiver em dataToUpdate, remova ou trate-o.
            if (dataToUpdate.password) {
                 // **AVISO**: Para atualização de senha, você precisaria de um fluxo
                 // separado com validação de senha atual e hashing da nova senha.
                 // Não é seguro simplesmente passar a senha em texto puro aqui.
                 // Por enquanto, podemos ignorar ou lançar um erro.
                return res.status(400).json({ error: "Password cannot be updated via this endpoint." });
            }


            const updatedAdmin = await this.adminService.update(adminId, dataToUpdate);

            if (!updatedAdmin) {
                return res.status(404).json({ error: 'Admin not found or nothing to update.' });
            }
            return res.status(200).json(updatedAdmin);
        } catch (error: any) {
            console.error("Error updating admin:", error);
            // Se usar Zod, pode adicionar error.name === 'ZodError'
            return res.status(400).json({ error: error.message || "Failed to update admin." });
        }
    }

    // 4. Deletar Administrador por ID
    async delete(req: Request, res: Response): Promise<Response> {
        try {
            const { id } = req.params;
            const adminId = parseInt(id as string, 10);

            if (isNaN(adminId)) {
                return res.status(400).json({ error: 'Invalid admin ID format.' });
            }

            const deletedAdmin = await this.adminService.delete(adminId);

            if (!deletedAdmin) {
                return res.status(404).json({ error: 'Admin not found.' });
            }
            return res.status(204).send(); // 204 No Content para deleções bem-sucedidas
        } catch (error: any) {
            console.error("Error deleting admin:", error);
            return res.status(500).json({ error: error.message || "Failed to delete admin." });
        }
    }
}