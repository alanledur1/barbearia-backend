import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma.service";
import jwt from 'jsonwebtoken'; 


export class AuthService {
    async register(data: Prisma.AdminCreateInput) {
        try {
            // Verifica se um admin com email já existe
            const existingAdmin = await prisma.admin.findUnique({
                where : { email: data.email },
            });

            if (existingAdmin) {
                throw new Error("Email already in use.");
            }

            // Gera um hash da senha antes de salvar no banco de dados
            // O '10' é o 'saltRounds', que define o custo computacional do hashing.
            // Quanto maior, mais seguro, mas mais lento. 10 é um bom valor padrão.
            const hashedPassword = await bcrypt.hash(data.password, 10);
            
            // Cria o admin no banco de dados com a senha hasheada
            const newAdmin = await prisma.admin.create({
                data: {
                    name: data.name,
                    email: data.email,
                    password: hashedPassword,
                    phone: data.phone, // Salva a senha hasheada
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    createdAt: true,
                    updatedAt: true,

                }
            });
            return newAdmin;
        }   catch (error: any) {
            console.error("Error registering admin:", error);
            throw error;
        }
    }

    async login(email: string, passwordPlain: string) {
        try {
            const admin =await prisma.admin.findUnique({
                where: { email },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    password: true,
                }
            });

            if (!admin) {
                throw new Error("Invalid credentials.");
            }

            // Compara a senha fornecida com a senha hasheada no banco de dados
            const isPasswordValid = await bcrypt.compare(passwordPlain, admin.password);

            if (!isPasswordValid) {
                throw new Error("Invalid credentials.");
            }

            const jwtSecret = process.env.JWT_SECRET || 'your_super_secret_fallback_key';

            // Se a senha for válida, gera um JSON Web Token (JWT)
            // 'process.env.JWT_SECRET' é uma variável de ambiente que contém a chave secreta do JWT
            // em suas variaveis de ambiente nunca devem ser compartilhadas com o código fonte
            const token = jwt.sign(
                { adminId: admin.id, email: admin.email },
                jwtSecret,
                { expiresIn: "8h" } // Expira em 1 hora
            );

            return {
                token,
                admin: {
                    id: admin.id,
                    name: admin.name,
                    email: admin.email,
                },
            };
        } catch (error: any) {
            console.error("Error logging in admin:", error);
            throw error;
        }
    }

    async findById(id: number) {
        return await prisma.admin.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
                updatedAt: true,
            },
        })
    }
}