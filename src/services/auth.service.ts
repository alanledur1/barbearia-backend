import bcrypt from "bcryptjs";
import { prisma } from "./prisma.service";
import { signUserToken } from "../utils/jwt";
import { CustomError } from "../utils/customErrors";
import { EmailService } from "../notifications/email.service";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos

function generateOtpCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

type RegisterStaffData = {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role: 'BARBEIRO' | 'DONO' | 'ADMIN';
};

export class AuthService {
    async register(data: RegisterStaffData) {
        try {
            // Verifica se um usuário com esse email já existe
            const existingUser = await prisma.user.findUnique({
                where: { email: data.email },
            });

            if (existingUser) {
                throw new Error("Email already in use.");
            }

            const hashedPassword = await bcrypt.hash(data.password, 10);

            const newUser = await prisma.user.create({
                data: {
                    name: data.name,
                    email: data.email,
                    password: hashedPassword,
                    phone: data.phone,
                    role: data.role,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    role: true,
                    createdAt: true,
                    updatedAt: true,
                }
            });
            return newUser;
        }   catch (error: any) {
            console.error("Error registering user:", error);
            throw error;
        }
    }

    async login(email: string, passwordPlain: string) {
        try {
            const user = await prisma.user.findUnique({
                where: { email },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    password: true,
                    role: true,
                    active: true,
                }
            });

            if (!user) {
                throw new Error("Invalid credentials.");
            }

            const isPasswordValid = await bcrypt.compare(passwordPlain, user.password);

            if (!isPasswordValid) {
                throw new Error("Invalid credentials.");
            }

            // Checagem feita depois da validação de senha, para não revelar o status
            // da conta a quem não sabe a senha.
            if (!user.active) {
                throw new CustomError('Esta conta foi desativada. Entre em contato com o administrador.', 401);
            }

            const token = signUserToken({ userId: user.id, role: user.role, email: user.email }, "8h");

            return {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
            };
        } catch (error: any) {
            console.error("Error logging in user:", error);
            throw error;
        }
    }

    async findById(id: number) {
        return await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
        })
    }

    // Passo 1 do fluxo "Esqueci Senha": gera e envia um código OTP de 6 dígitos.
    // Não lança erro para email inexistente — quem não existe simplesmente não recebe
    // nada, e o controller responde de forma genérica em ambos os casos (evita
    // enumeração de usuários). Só propaga erro se o envio do email falhar (o usuário
    // precisa saber que o código não foi enviado por falha de infraestrutura).
    async forgotPassword(email: string): Promise<void> {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return;
        }

        // Invalida qualquer código anterior ainda válido para este email.
        await prisma.otp.deleteMany({ where: { email } });

        const code = generateOtpCode();
        await prisma.otp.create({
            data: {
                email,
                code,
                expiresAt: new Date(Date.now() + OTP_TTL_MS),
            },
        });

        await new EmailService().sendPasswordResetOtp(email, code);
    }

    // Passo 2: valida o código digitado, sem consumi-lo (o consumo definitivo
    // acontece em resetPassword, no passo 3).
    async verifyResetOtp(email: string, code: string): Promise<void> {
        const otp = await prisma.otp.findFirst({
            where: { email, code },
            orderBy: { createdAt: 'desc' },
        });

        if (!otp || otp.expiresAt < new Date()) {
            throw new CustomError('Código inválido ou expirado.', 400);
        }
    }

    // Passo 3: revalida o código e, se válido, troca a senha e invalida o(s) OTP(s)
    // daquele email (uso único).
    async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
        const otp = await prisma.otp.findFirst({
            where: { email, code },
            orderBy: { createdAt: 'desc' },
        });

        if (!otp || otp.expiresAt < new Date()) {
            throw new CustomError('Código inválido ou expirado.', 400);
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { email },
            data: { password: hashedPassword },
        });

        await prisma.otp.deleteMany({ where: { email } });
    }
}
