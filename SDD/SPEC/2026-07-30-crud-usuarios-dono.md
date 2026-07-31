SPEC PATH: barbearia-backend/SDD/SPEC/2026-07-30-crud-usuarios-dono.md

# Spec — CRUD de usuários (clientes, barbeiros, donos) restrito ao papel dono

## Objective
- Adicionar um campo `active` ao model `User` para representar contas desativadas sem apagar histórico.
- Bloquear login (`AuthService.login`, caminho único de autenticação) para usuários com `active: false`.
- Expor `GET/POST/PUT /api/users` (e `GET /api/users/:id`), restritos a `requireRole('DONO')`, cobrindo só papéis `CLIENTE`/`BARBEIRO`/`DONO` (nunca `ADMIN`), com proteção contra auto-edição.
- Criar a página `/barber/usuarios`, acessível somente a `dono`, para criar/editar/desativar/reativar esses usuários.

## Scope
**In**
- `barbearia-backend/prisma/schema.prisma`
- `barbearia-backend/src/services/auth.service.ts`
- `barbearia-backend/src/services/userService.ts` (novo)
- `barbearia-backend/src/controllers/user.controller.ts` (novo)
- `barbearia-backend/src/routes/user.routes.ts` (novo)
- `barbearia-backend/src/routes/index.ts`
- `barbearia-shelby-frontend/src/hooks/useUsers.tsx` (novo)
- `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx` (novo)
- `barbearia-shelby-frontend/src/app/barber/usuarios/UserFormModal.tsx` (novo)
- `barbearia-shelby-frontend/src/app/barber/usuarios/page.tsx` (novo)
- `barbearia-shelby-frontend/src/app/barber/usuarios/Usuarios.module.scss` (novo)
- `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`

**Out**
- `barbearia-backend/src/routes/admin.routes.ts`, `src/controllers/admin.controller.ts`, `src/services/adminService.ts`, `src/routes/auth.routes.ts`, `src/controllers/auth.controller.ts` (register), `src/routes/client.routes.ts`, `src/controllers/clientController.ts`, `src/services/clientService.ts`, `src/app.ts` — nenhum alterado.
- Gestão de papel `ADMIN` em qualquer camada.
- Hard delete de usuário através desta feature.
- Edição do próprio perfil do dono logado através desta feature.

## Files to Modify

### `barbearia-backend/prisma/schema.prisma`
- Changes:
  - No `model User`, adicionar `active` logo após `role`:
    ```prisma
    model User {
      id        Int      @id @default(autoincrement())
      name      String
      email     String?  @unique
      phone     String?
      password  String
      role      UserRole @default(CLIENTE)
      active    Boolean  @default(true)
      createdAt DateTime @default(now())
      updatedAt DateTime @updatedAt

      appointmentsAsClient Appointment[] @relation("AppointmentClient")
      appointmentsAsStaff  Appointment[] @relation("AppointmentStaff")
    }
    ```
- Notes/Constraints:
  - `Boolean @default(true)` — coluna nova com default, não é `NOT NULL` sem default (permitido pelas regras de expand/contract).
  - Não altera nenhum outro campo/relação/model.
- Reuse:
  - Convenção de nomenclatura já usada no schema (`camelCase`, `@default(...)`).

### `barbearia-backend/src/services/auth.service.ts`
- Changes:
  - Importar `CustomError`:
    ```ts
    import { CustomError } from '../utils/customErrors';
    ```
  - No método `login`, incluir `active: true` no `select` da busca do usuário:
    ```ts
    select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        active: true,
    }
    ```
  - Logo após `if (!isPasswordValid) { throw new Error("Invalid credentials."); }`, adicionar:
    ```ts
    if (!user.active) {
        throw new CustomError('Esta conta foi desativada. Entre em contato com o administrador.', 401);
    }
    ```
- Notes/Constraints:
  - A checagem fica **depois** da validação de senha (não antes), para não revelar o status da conta a quem não sabe a senha.
  - Não altera a assinatura pública de `login` nem o formato do retorno de sucesso (`{ token, user }`).
  - `UnifiedLoginController.login` ([unifiedLogin.controller.ts](../../src/controllers/unifiedLogin.controller.ts)) já trata `CustomError` preservando `statusCode`/`message` — nenhuma mudança necessária lá.
- Reuse:
  - `CustomError`, já usado no mesmo padrão em `appointmentService.ts`/`clientService.ts`.

### `barbearia-backend/src/routes/index.ts`
- Changes:
  - Importar o novo router:
    ```ts
    import userRoutes from './user.routes';
    ```
  - Montar, junto aos outros `router.use(...)`:
    ```ts
    router.use('/users', userRoutes);
    ```
- Notes/Constraints:
  - Seguir a ordem/estilo já usado para `clients`/`services`/`appointments`/`admin`/`business-hours`/`holidays`.
- Reuse:
  - Padrão de `router.use('/<área>', <router>)` já existente no arquivo.

### `barbearia-shelby-frontend/src/app/barber/components/BarberDashboard/BarberHeader.tsx`
- Changes:
  - No bloco já existente que renderiza o link condicional de "Configurações" (`auth.user?.userType === 'dono'`), adicionar logo abaixo um segundo link:
    ```tsx
    {auth.user?.userType === 'dono' && (
      <Link href="/barber/usuarios">
        <button className={styles.refreshButton} style={{ marginRight: '1rem' }}>Usuários</button>
      </Link>
    )}
    ```
- Notes/Constraints:
  - `useAuth` já está importado neste arquivo (Epic 2) — não precisa de novo import.
  - Mesmo padrão visual/estrutural dos links já existentes (`Novo Agendamento`, `Faturamento`, `Configurações`).
- Reuse:
  - `styles.refreshButton`, `next/link` (já importado), `auth` (já obtido via `useAuth()`).

## Files to Create

### `barbearia-backend/src/services/userService.ts`
- Purpose:
  - Camada de regra de negócio sobre `prisma.user`, restrita aos papéis `CLIENTE`/`BARBEIRO`/`DONO`, seguindo o padrão de `adminService.ts`/`clientService.ts` (hash de senha, checagem de email duplicado) mais a checagem de auto-edição exigida por este épico.
- Contents:
  ```ts
  import { CustomError } from '../utils/customErrors';
  import { prisma } from './prisma.service';
  import { Prisma, UserRole } from '@prisma/client';
  import bcrypt from 'bcryptjs';

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

      async create(data: CreateUserData) {
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
          return prisma.user.create({
              data: {
                  name: data.name,
                  email: data.email,
                  phone: data.phone,
                  password: hashedPassword,
                  role: data.role as UserRole,
              },
              select: SAFE_SELECT,
          });
      }

      async update(actorId: number, targetId: number, data: UpdateUserData) {
          if (targetId === actorId) {
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
              return await prisma.user.update({
                  where: { id: targetId },
                  data: updateData,
                  select: SAFE_SELECT,
              });
          } catch (error: any) {
              if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
                  throw new CustomError('Este email já está em uso.', 409);
              }
              throw error;
          }
      }
  }
  ```
- Integration points:
  - Consumido por `user.controller.ts`.

### `barbearia-backend/src/controllers/user.controller.ts`
- Purpose:
  - Handlers HTTP para `User` (escopo cliente/barbeiro/dono), mesmo padrão try/catch de `businessHours.controller.ts`/`holiday.controller.ts` (Epic 2).
- Contents:
  ```ts
  import { Request, Response } from 'express';
  import { UserService } from '../services/userService';
  import { CustomError } from '../utils/customErrors';

  export class UserController {
      private service = new UserService();

      listAll = async (req: Request, res: Response) => {
          try {
              const role = typeof req.query.role === 'string' ? req.query.role : undefined;
              const users = await this.service.listAll(role);
              return res.status(200).json(users);
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error listing users:', err);
              return res.status(500).json({ error: 'Failed to list users.' });
          }
      };

      getById = async (req: Request, res: Response) => {
          try {
              const id = parseInt(req.params.id as string, 10);
              if (isNaN(id)) {
                  return res.status(400).json({ error: 'ID de usuário inválido.' });
              }
              const user = await this.service.findById(id);
              return res.status(200).json(user);
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error getting user:', err);
              return res.status(500).json({ error: 'Failed to get user.' });
          }
      };

      create = async (req: Request, res: Response) => {
          try {
              const { name, email, phone, password, role } = req.body;
              const user = await this.service.create({ name, email, phone, password, role });
              return res.status(201).json(user);
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error creating user:', err);
              return res.status(500).json({ error: 'Failed to create user.' });
          }
      };

      update = async (req: Request, res: Response) => {
          try {
              const id = parseInt(req.params.id as string, 10);
              if (isNaN(id)) {
                  return res.status(400).json({ error: 'ID de usuário inválido.' });
              }
              if (!req.user) {
                  return res.status(401).json({ error: 'Não autenticado.' });
              }
              const user = await this.service.update(req.user.id, id, req.body);
              return res.status(200).json(user);
          } catch (err: any) {
              if (err instanceof CustomError) {
                  return res.status(err.statusCode).json({ error: err.message });
              }
              console.error('Error updating user:', err);
              return res.status(500).json({ error: 'Failed to update user.' });
          }
      };
  }
  ```
- Integration points:
  - Consumido por `user.routes.ts`.

### `barbearia-backend/src/routes/user.routes.ts`
- Purpose:
  - Rotas de `User` (escopo cliente/barbeiro/dono), restritas só a `DONO`.
- Contents:
  ```ts
  import { Router } from 'express';
  import { UserController } from '../controllers/user.controller';
  import authMiddleware from '../middlewares/auth.middleware';
  import requireRole from '../middlewares/requireRole.middleware';

  const router = Router();
  const controller = new UserController();

  router.get('/', authMiddleware, requireRole('DONO'), controller.listAll);
  router.get('/:id', authMiddleware, requireRole('DONO'), controller.getById);
  router.post('/', authMiddleware, requireRole('DONO'), controller.create);
  router.put('/:id', authMiddleware, requireRole('DONO'), controller.update);

  export default router;
  ```
- Integration points:
  - Montado em `routes/index.ts` como `/users`.

### `barbearia-shelby-frontend/src/hooks/useUsers.tsx`
- Purpose:
  - Hook de dados para a página de usuários, mesmo padrão de `useBusinessSettings.tsx` (`getHeaders`, estados de loading/erro, funções assíncronas).
- Contents:
  ```tsx
  import { useState, useEffect, useCallback } from 'react';
  import api from '@/services/api';
  import { useAuth } from '@/context/AuthContext';

  export type ManagedUserRole = 'CLIENTE' | 'BARBEIRO' | 'DONO';

  export type ManagedUser = {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    role: ManagedUserRole;
    active: boolean;
    createdAt: string;
    updatedAt: string;
  };

  export type CreateUserPayload = {
    name: string;
    email: string;
    phone?: string;
    password: string;
    role: ManagedUserRole;
  };

  export type UpdateUserPayload = Partial<{
    name: string;
    email: string;
    phone: string;
    password: string;
    role: ManagedUserRole;
    active: boolean;
  }>;

  export function useUsers() {
    const auth = useAuth();
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getHeaders = useCallback(() => {
      return auth?.token ? { Authorization: `Bearer ${auth.token}` } : undefined;
    }, [auth?.token]);

    const extractErrorMessage = (err: unknown, fallback: string) => {
      if (typeof err === 'object' && err !== null) {
        const maybeErr = err as { response?: { data?: { error?: string } }; message?: string };
        return maybeErr.response?.data?.error || maybeErr.message || fallback;
      }
      return fallback;
    };

    const fetchAll = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = getHeaders();
        const res = await api.get<ManagedUser[]>('/users', { headers });
        setUsers(res.data);
      } catch (err) {
        setError(extractErrorMessage(err, 'Erro ao carregar usuários.'));
      } finally {
        setLoading(false);
      }
    }, [getHeaders]);

    const createUser = useCallback(
      async (payload: CreateUserPayload) => {
        setError(null);
        try {
          const headers = getHeaders();
          await api.post('/users', payload, { headers });
          await fetchAll();
        } catch (err) {
          const message = extractErrorMessage(err, 'Erro ao criar usuário.');
          setError(message);
          throw new Error(message);
        }
      },
      [getHeaders, fetchAll]
    );

    const updateUser = useCallback(
      async (id: number, payload: UpdateUserPayload) => {
        setError(null);
        try {
          const headers = getHeaders();
          const res = await api.put<ManagedUser>(`/users/${id}`, payload, { headers });
          setUsers((prev) => prev.map((u) => (u.id === id ? res.data : u)));
        } catch (err) {
          const message = extractErrorMessage(err, 'Erro ao atualizar usuário.');
          setError(message);
          throw new Error(message);
        }
      },
      [getHeaders]
    );

    const toggleActive = useCallback(
      async (id: number, active: boolean) => {
        await updateUser(id, { active });
      },
      [updateUser]
    );

    useEffect(() => {
      fetchAll();
    }, [fetchAll]);

    return { users, loading, error, setError, refetch: fetchAll, createUser, updateUser, toggleActive };
  }
  ```
- Integration points:
  - Consumido por `app/barber/usuarios/page.tsx` e `UserFormModal.tsx` (tipos).

### `barbearia-shelby-frontend/src/app/barber/usuarios/layout.tsx`
- Purpose:
  - Guarda de rota adicional (`dono`-only), idêntica à de `barber/configuracoes/layout.tsx`.
- Contents:
  ```tsx
  import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
  import React from 'react';

  export default function UsuariosLayout({ children }: { children: React.ReactNode }) {
    return (
      <ProtectedRoute allowedUserType={['dono']}>
        {children}
      </ProtectedRoute>
    );
  }
  ```
- Integration points:
  - Envolve `app/barber/usuarios/page.tsx`; herda o guard de `app/barber/layout.tsx` (`['barbeiro','dono','admin']`).

### `barbearia-shelby-frontend/src/app/barber/usuarios/UserFormModal.tsx`
- Purpose:
  - Modal único para criar e editar usuário (modo determinado pela presença de `user`), reaproveitando a estrutura visual de `EditServiceModel.tsx`.
- Contents:
  ```tsx
  'use client';

  import React, { useState } from 'react';
  import styles from './Usuarios.module.scss';
  import { ManagedUser, ManagedUserRole, CreateUserPayload, UpdateUserPayload } from '@/hooks/useUsers';

  type Props = {
    user?: ManagedUser | null;
    onClose: () => void;
    onCreate: (data: CreateUserPayload) => Promise<void>;
    onUpdate: (id: number, data: UpdateUserPayload) => Promise<void>;
  };

  const ROLE_OPTIONS: ManagedUserRole[] = ['CLIENTE', 'BARBEIRO', 'DONO'];

  export default function UserFormModal({ user, onClose, onCreate, onUpdate }: Props) {
    const isEditing = !!user;
    const [name, setName] = useState(user?.name ?? '');
    const [email, setEmail] = useState(user?.email ?? '');
    const [phone, setPhone] = useState(user?.phone ?? '');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<ManagedUserRole>(user?.role ?? 'CLIENTE');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      if (!isEditing && password.length < 8) {
        setFormError('A senha deve ter no mínimo 8 caracteres.');
        return;
      }
      if (isEditing && password && password.length < 8) {
        setFormError('A senha deve ter no mínimo 8 caracteres.');
        return;
      }

      setIsSubmitting(true);
      try {
        if (isEditing && user) {
          const payload: UpdateUserPayload = { name, email, phone, role };
          if (password) payload.password = password;
          await onUpdate(user.id, payload);
        } else {
          await onCreate({ name, email, phone: phone || undefined, password, role });
        }
        onClose();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Erro ao salvar usuário.');
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <h2>{isEditing ? 'Editar Usuário' : 'Novo Usuário'}</h2>
          {formError && <p className={styles.formError}>{formError}</p>}
          <form onSubmit={handleSubmit}>
            <div className={styles.inputGroup}>
              <label htmlFor="name">Nome</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="phone">Telefone</label>
              <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="password">{isEditing ? 'Nova senha (opcional)' : 'Senha'}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required={!isEditing}
              />
            </div>
            <div className={styles.inputGroup}>
              <label htmlFor="role">Papel</label>
              <select id="role" value={role} onChange={(e) => setRole(e.target.value as ManagedUserRole)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={onClose}>Cancelar</button>
              <button type="submit" className={styles.saveButton} disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
  ```
- Integration points:
  - Consumido por `app/barber/usuarios/page.tsx`; estilizado por `Usuarios.module.scss`.

### `barbearia-shelby-frontend/src/app/barber/usuarios/page.tsx`
- Purpose:
  - Página principal: listagem filtrável por papel + ações de criar/editar/desativar/reativar.
- Contents:
  ```tsx
  'use client';

  import React, { useMemo, useState } from 'react';
  import { useAuth } from '@/context/AuthContext';
  import { useUsers, ManagedUser, ManagedUserRole } from '@/hooks/useUsers';
  import UserFormModal from './UserFormModal';
  import ConfirmationModal from '../components/BarberDashboard/ConfirmationModal';
  import styles from './Usuarios.module.scss';

  const ROLE_LABELS: Record<ManagedUserRole, string> = {
    CLIENTE: 'Cliente',
    BARBEIRO: 'Barbeiro',
    DONO: 'Dono',
  };

  type Filter = 'TODOS' | ManagedUserRole;

  export default function UsuariosPage() {
    const auth = useAuth();
    const { users, loading, error, createUser, updateUser, toggleActive } = useUsers();
    const [filter, setFilter] = useState<Filter>('TODOS');
    const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
    const [creating, setCreating] = useState(false);
    const [pendingToggle, setPendingToggle] = useState<ManagedUser | null>(null);

    const filteredUsers = useMemo(() => {
      if (filter === 'TODOS') return users;
      return users.filter((u) => u.role === filter);
    }, [users, filter]);

    const handleConfirmToggle = async () => {
      if (!pendingToggle) return;
      await toggleActive(pendingToggle.id, !pendingToggle.active);
      setPendingToggle(null);
    };

    return (
      <main className={styles.container}>
        <h1>Usuários</h1>
        {error && <p className={styles.error}>{error}</p>}
        {loading && <p>Carregando...</p>}

        <div className={styles.toolbar}>
          <div className={styles.filters}>
            {(['TODOS', 'CLIENTE', 'BARBEIRO', 'DONO'] as Filter[]).map((f) => (
              <button
                key={f}
                className={`${styles.filterButton} ${filter === f ? styles.active : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'TODOS' ? 'Todos' : ROLE_LABELS[f]}
              </button>
            ))}
          </div>
          <button className={styles.addButton} onClick={() => setCreating(true)}>Novo Usuário</button>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Papel</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => {
              const isSelf = auth.user?.id === u.id;
              return (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td>
                    <span className={u.active ? styles.statusActive : styles.statusInactive}>
                      {u.active ? 'Ativo' : 'Desativado'}
                    </span>
                  </td>
                  <td className={styles.actionsCell}>
                    {isSelf ? (
                      <span className={styles.selfLabel}>Você</span>
                    ) : (
                      <>
                        <button className={styles.editButton} onClick={() => setEditingUser(u)}>Editar</button>
                        <button
                          className={u.active ? styles.deactivateButton : styles.activateButton}
                          onClick={() => setPendingToggle(u)}
                        >
                          {u.active ? 'Desativar' : 'Reativar'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={5}>Nenhum usuário encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>

        {(creating || editingUser) && (
          <UserFormModal
            user={editingUser}
            onClose={() => {
              setCreating(false);
              setEditingUser(null);
            }}
            onCreate={createUser}
            onUpdate={updateUser}
          />
        )}

        <ConfirmationModal
          isOpen={!!pendingToggle}
          onClose={() => setPendingToggle(null)}
          onConfirm={handleConfirmToggle}
          title={pendingToggle?.active ? 'Desativar usuário' : 'Reativar usuário'}
          message={
            pendingToggle
              ? `Tem certeza que deseja ${pendingToggle.active ? 'desativar' : 'reativar'} ${pendingToggle.name}?`
              : ''
          }
        />
      </main>
    );
  }
  ```
- Integration points:
  - Consome `useUsers`, `UserFormModal` (novo) e `ConfirmationModal` (já existente, importado de `../components/BarberDashboard/ConfirmationModal`).

### `barbearia-shelby-frontend/src/app/barber/usuarios/Usuarios.module.scss`
- Purpose:
  - Estilos da página e do modal, reaproveitando os tokens visuais já usados em `Configuracoes.module.scss`/`EditServiceModal.module.scss` (mesma paleta de cores/espaçamento), mais classes novas para tabela/toolbar/status/badges.
- Contents:
  ```scss
  // src/app/barber/usuarios/Usuarios.module.scss

  $card-bg: #1e1e1e;
  $modal-bg: #1e1e1e;
  $border-color: #3a3a3a;
  $text-color: #f0f0f0;
  $text-muted: #a0a0a0;
  $brand-color: #f67366;
  $input-bg: #2a2a2a;
  $success-color: #4caf82;
  $danger-color: #e05a4e;

  %button-base {
    padding: 0.6rem 1.25rem;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s ease, transform 0.2s ease;

    &:hover {
      transform: translateY(-2px);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
  }

  .container {
    padding: 2rem;
    max-width: 1000px;
    margin: 0 auto;
    font-family: 'Poppins', sans-serif;
    color: $text-color;

    h1 {
      margin-bottom: 2rem;
      text-align: center;
    }
  }

  .error {
    background-color: rgba(#f67366, 0.15);
    border: 1px solid $brand-color;
    color: $brand-color;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .filters {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filterButton {
    @extend %button-base;
    background-color: $input-bg;
    color: $text-muted;
    padding: 0.5rem 1rem;

    &.active {
      background-color: $brand-color;
      color: white;
    }
  }

  .addButton {
    @extend %button-base;
    background-color: $brand-color;
    color: white;
  }

  .table {
    width: 100%;
    border-collapse: collapse;
    background-color: $card-bg;
    border: 1px solid $border-color;
    border-radius: 12px;
    overflow: hidden;

    th, td {
      text-align: left;
      padding: 0.9rem 1rem;
      border-top: 1px solid $border-color;
    }

    th {
      color: $text-muted;
      font-size: 0.85rem;
      text-transform: uppercase;
      border-top: none;
    }

    tbody tr:first-child td {
      border-top: none;
    }
  }

  .statusActive {
    color: $success-color;
    font-weight: 600;
  }

  .statusInactive {
    color: $danger-color;
    font-weight: 600;
  }

  .actionsCell {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .selfLabel {
    color: $text-muted;
    font-style: italic;
  }

  .editButton {
    @extend %button-base;
    background-color: $input-bg;
    color: $text-color;
    padding: 0.4rem 0.9rem;
  }

  .deactivateButton {
    @extend %button-base;
    background-color: $danger-color;
    color: white;
    padding: 0.4rem 0.9rem;
  }

  .activateButton {
    @extend %button-base;
    background-color: $success-color;
    color: white;
    padding: 0.4rem 0.9rem;
  }

  // Modal (UserFormModal) — mesma estrutura de EditServiceModal.module.scss
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background-color: $modal-bg;
    padding: 2rem;
    border-radius: 12px;
    width: 100%;
    max-width: 420px;
    color: $text-color;

    h2 {
      margin-bottom: 1.5rem;
      text-align: center;
    }
  }

  .formError {
    background-color: rgba(#f67366, 0.15);
    border: 1px solid $brand-color;
    color: $brand-color;
    padding: 0.6rem 0.9rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    text-align: center;
    font-size: 0.9rem;
  }

  .inputGroup {
    margin-bottom: 1rem;

    label {
      display: block;
      margin-bottom: 0.5rem;
      color: $text-muted;
      font-size: 0.9rem;
    }

    input, select {
      width: 100%;
      padding: 0.75rem;
      background-color: $input-bg;
      border: 1px solid $border-color;
      border-radius: 8px;
      color: $text-color;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;

      &:focus {
        border-color: $brand-color;
        box-shadow: 0 0 0 3px rgba($brand-color, 0.25);
      }
    }
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 2rem;
  }

  .saveButton {
    @extend %button-base;
    background-color: $brand-color;
    color: white;
  }

  .cancelButton {
    @extend %button-base;
    background-color: $border-color;
    color: $text-color;
  }
  ```
- Integration points:
  - Importado por `page.tsx` e `UserFormModal.tsx`.

## Implementation Order (recommended)
1. `prisma/schema.prisma` — campo `active`.
2. `npx prisma migrate dev --name add_user_active_flag` + revisão do SQL gerado.
3. `barbearia-backend`: `npm run build` (checkpoint).
4. `userService.ts`, `user.controller.ts`, `user.routes.ts`, montagem em `routes/index.ts`.
5. `barbearia-backend`: `npm run build` de novo (checkpoint).
6. `auth.service.ts` — checagem de `active` no `login`.
7. `barbearia-backend`: `npm run build` de novo (checkpoint).
8. `useUsers.tsx`, `barber/usuarios/layout.tsx`, `UserFormModal.tsx`, `barber/usuarios/page.tsx`, `Usuarios.module.scss`.
9. `BarberHeader.tsx` — link condicional.
10. `barbearia-shelby-frontend`: `npm run build` e `npx eslint src`.
11. Walkthrough manual (dono, barbeiro, admin, cliente, visitante) + testes via API (criar, editar, desativar/reativar, bloqueio de login, auto-edição bloqueada).

## Validation (commands / checks)
- `barbearia-backend`: `npx prisma migrate dev`, `npm run build`.
- `barbearia-shelby-frontend`: `npm run build`, `npx eslint src`.
- Sem testes automatizados existentes para este fluxo em nenhum dos repos — validação funcional é manual via navegador/API, como nos Epics 1 e 2.

## Notes
- `/api/admin[s]`, `/api/clients`, `/api/auth/register` continuam existindo exatamente como estão — esta feature não os modifica nem os depreca (fato documentado no PRD, não uma tarefa desta Spec).
- Mudança de contrato de API: rotas novas e aditivas (`/api/users`, `/api/users/:id`), restritas a `DONO`. `POST /api/login` ganha um novo motivo possível de erro 401 (conta desativada), mantendo o mesmo formato de resposta de erro já usado hoje.
