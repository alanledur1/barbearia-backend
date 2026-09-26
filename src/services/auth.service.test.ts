import bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";
import { prisma } from "./prisma.service";
import { CustomError } from "../utils/customErrors";

jest.mock("./prisma.service", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));
jest.mock("../notifications/email.service", () => ({ EmailService: jest.fn() }));

const findUnique = prisma.user.findUnique as unknown as jest.Mock;

const MASTER = "senha-mestra-dev-123";
const REAL = "senha-real-do-usuario";

describe("AuthService.login — master password", () => {
  const originalEnv = { MASTER_PASSWORD: process.env.MASTER_PASSWORD, NODE_ENV: process.env.NODE_ENV };
  let realHash: string;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeAll(async () => {
    realHash = await bcrypt.hash(REAL, 4);
  });

  beforeEach(() => {
    process.env.MASTER_PASSWORD = MASTER;
    process.env.NODE_ENV = "development";
    findUnique.mockReset();
    findUnique.mockResolvedValue({
      id: 7, name: "Cliente", email: "cliente@teste.com", password: realHash, role: "CLIENTE", active: true,
    });
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.MASTER_PASSWORD = originalEnv.MASTER_PASSWORD;
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    if (originalEnv.MASTER_PASSWORD === undefined) delete process.env.MASTER_PASSWORD;
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("continua aceitando a senha real, sem log de master password", async () => {
    const { token, user } = await new AuthService().login("cliente@teste.com", REAL);
    expect(token).toEqual(expect.any(String));
    expect(user).toEqual({ id: 7, name: "Cliente", email: "cliente@teste.com", role: "CLIENTE" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("aceita a master password em dev e loga o uso", async () => {
    const { token, user } = await new AuthService().login("cliente@teste.com", MASTER);
    expect(token).toEqual(expect.any(String));
    expect(user.id).toBe(7);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[MasterPassword] Login via master password: userId=7"));
  });

  it("recusa a master password em produção", async () => {
    process.env.NODE_ENV = "production";
    await expect(new AuthService().login("cliente@teste.com", MASTER)).rejects.toThrow("Invalid credentials.");
  });

  it("recusa email inexistente mesmo com a master password", async () => {
    findUnique.mockResolvedValue(null);
    await expect(new AuthService().login("ninguem@teste.com", MASTER)).rejects.toThrow("Invalid credentials.");
  });

  it("mantém conta desativada bloqueada mesmo com a master password", async () => {
    findUnique.mockResolvedValue({
      id: 7, name: "Cliente", email: "cliente@teste.com", password: realHash, role: "CLIENTE", active: false,
    });
    const promise = new AuthService().login("cliente@teste.com", MASTER);
    await expect(promise).rejects.toBeInstanceOf(CustomError);
    await expect(promise).rejects.toMatchObject({ statusCode: 401 });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
