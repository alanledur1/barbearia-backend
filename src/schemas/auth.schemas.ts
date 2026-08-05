import { z } from 'zod';

export const forgotPasswordSchema = z.object({
    body: z.object({
        email: z.string().email('Email inválido.'),
    }),
});

export const verifyResetOtpSchema = z.object({
    body: z.object({
        email: z.string().email('Email inválido.'),
        code: z.string().length(6, 'O código deve ter 6 dígitos.'),
    }),
});

export const resetPasswordSchema = z.object({
    body: z.object({
        email: z.string().email('Email inválido.'),
        code: z.string().length(6, 'O código deve ter 6 dígitos.'),
        newPassword: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
    }),
});
