import { CustomError } from '../utils/customErrors';
import { prisma } from './prisma.service';
import { Prisma, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuditService, AuditActor } from './auditService';

const MANAGEABLE_ROLES: UserRole[] = ['CLIENTE', 'BARBEIRO', 'DONO'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SAFE_SELECT = {
    id: true,
    name: true,
    email: true,
    phone: true,
    role: true,
    active: true,
    createdAt: true,
    updatedAt: true,
} as const;

function assertManageableRole(role: unknown): asserts role is UserRole {
    if (typeof role !== 'string' || !MANAGEABLE_ROLES.includes(role as UserRole)) {
        throw new CustomError('Papel inválido. Use CLIENTE, BARBEIRO ou DONO.', 400);
    }
}

export type CreateUserData = {
    name: string;
    email: string;
    phone?: string;
    password: string;
    role: string;
};

export type UpdateUserData = Partial<{
    name: string;
    email: string;
    phone: string;
    password: string;
    role: string;
    active: boolean;
}>;

export class UserService {
    private auditService = new AuditService();

    // Lista usuários gerenciáveis por esta feature (cliente/barbeiro/dono), nunca admin.
    async listAll(roleFilter?: string) {
        if (roleFilter !== undefined) {
            assertManageableRole(roleFilter);
            return prisma.user.findMany({
                where: { role: roleFilter as UserRole },
                select: SAFE_SELECT,
                orderBy: { name: 'asc' },
            });
        }
        return prisma.user.findMany({
            where: { role: { in: MANAGEABLE_ROLES } },
            select: SAFE_SELECT,
            orderBy: { name: 'asc' },
        });
    }

    async findById(id: number) {
        const user = await prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
        if (!user || !MANAGEABLE_ROLES.includes(user.role)) {
            throw new CustomError('Usuário não encontrado.', 404);
        }
        return user;
    }

    async create(actor: AuditActor, data: CreateUserData) {
        if (!data.name || !data.email || !data.password) {
            throw new CustomError('Nome, email e senha são obrigatórios.', 400);
        }
        if (!EMAIL_REGEX.test(data.email)) {
            throw new CustomError('Email inválido.', 400);
        }
        if (data.password.length < 8) {
            throw new CustomError('A senha deve ter no mínimo 8 caracteres.', 400);
        }
        assertManageableRole(data.role);

        const existing = await prisma.user.findUnique({ where: { email: data.email } });
        if (existing) {
            throw new CustomError('Este email já está em uso.', 409);
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);
        const user = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                password: hashedPassword,
                role: data.role as UserRole,
            },
            select: SAFE_SELECT,
        });

        await this.auditService.log(actor, 'USERS', 'USER_CREATE', 'User', String(user.id), { role: user.role });
        return user;
    }

    // `actor.id` é o id do dono/admin autenticado fazendo a chamada; usado para bloquear auto-edição.
    async update(actor: AuditActor, targetId: number, data: UpdateUserData) {
        if (targetId === actor.id) {
            throw new CustomError('Você não pode editar a própria conta por aqui.', 400);
        }

        const target = await prisma.user.findUnique({ where: { id: targetId } });
        if (!target || !MANAGEABLE_ROLES.includes(target.role)) {
            throw new CustomError('Usuário não encontrado.', 404);
        }

        if (data.role !== undefined) {
            assertManageableRole(data.role);
        }
        if (data.email !== undefined && !EMAIL_REGEX.test(data.email)) {
            throw new CustomError('Email inválido.', 400);
        }
        if (data.password !== undefined && data.password.length < 8) {
            throw new CustomError('A senha deve ter no mínimo 8 caracteres.', 400);
        }

        const updateData: Prisma.UserUpdateInput = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.phone !== undefined) updateData.phone = data.phone;
        if (data.role !== undefined) updateData.role = data.role as UserRole;
        if (data.active !== undefined) updateData.active = data.active;
        if (data.password) {
            updateData.password = await bcrypt.hash(data.password, 10);
        }

        try {
            const user = await prisma.user.update({
                where: { id: targetId },
                data: updateData,
                select: SAFE_SELECT,
            });
            await this.auditService.log(actor, 'USERS', 'USER_UPDATE', 'User', String(targetId), { fields: Object.keys(updateData) });
            return user;
        } catch (error: any) {
            if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
                throw new CustomError('Este email já está em uso.', 409);
            }
            throw error;
        }
    }
}
