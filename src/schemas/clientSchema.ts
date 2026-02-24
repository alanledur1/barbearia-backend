import { z } from 'zod';

export const clientSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8),
  password: z.string().min(6, "A senha deve ter no mínimo 8 caracteres"),
});
