import bcrypt from "bcryptjs";
import { prisma } from "./prisma.service";
import { signUserToken } from "../utils/jwt";

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
                }
            });

            if (!user) {
                throw new Error("Invalid credentials.");
            }

            const isPasswordValid = await bcrypt.compare(passwordPlain, user.password);

            if (!isPasswordValid) {
                throw new Error("Invalid credentials.");
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
}
