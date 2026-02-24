import { z } from 'zod';


export const createAdminSchema = z.object({
    body: z.object({
        email: z.string().email('Email inválido.').min(1, 'O email é obrigatório.'),
        password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.'),
    }),
});

export const updateAdminSchema = z.object({
    params: z.object({
        id: z.string().refine((val) => !isNaN(parseInt(val, 10)), {
            message: "ID de administrador inválido.",
        }),
    }),
    body: z.object({
        email: z.string().email('Email inválido.').optional(),
        password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.').optional(),
    }).partial(), // Permite que nenhum campo do body seja enviado, mas se for, deve ser válido.
});