import { getMasterPasswordStatus, matchesMasterPassword } from "./masterPassword";

const VALID = "senha-mestra-dev-123";

describe("getMasterPasswordStatus", () => {
  it("fica desligado sem MASTER_PASSWORD", () => {
    expect(getMasterPasswordStatus({ NODE_ENV: "development" })).toBe("disabled");
    expect(getMasterPasswordStatus({ NODE_ENV: "development", MASTER_PASSWORD: "" })).toBe("disabled");
  });

  it("é ignorado em produção", () => {
    expect(getMasterPasswordStatus({ NODE_ENV: "production", MASTER_PASSWORD: VALID })).toBe("ignored_production");
  });

  it("é ignorado com valor curto demais", () => {
    expect(getMasterPasswordStatus({ NODE_ENV: "development", MASTER_PASSWORD: "curta" })).toBe("ignored_too_short");
  });

  it("fica ativo em dev e com NODE_ENV indefinido", () => {
    expect(getMasterPasswordStatus({ NODE_ENV: "development", MASTER_PASSWORD: VALID })).toBe("enabled");
    expect(getMasterPasswordStatus({ MASTER_PASSWORD: VALID })).toBe("enabled");
  });
});

describe("matchesMasterPassword", () => {
  const devEnv = { NODE_ENV: "development", MASTER_PASSWORD: VALID };

  it("aceita a master password correta", () => {
    expect(matchesMasterPassword(VALID, devEnv)).toBe(true);
  });

  it("recusa senha diferente", () => {
    expect(matchesMasterPassword("outra-senha-qualquer", devEnv)).toBe(false);
    expect(matchesMasterPassword("", devEnv)).toBe(false);
  });

  it("recusa em produção, com valor curto ou sem variável", () => {
    expect(matchesMasterPassword(VALID, { NODE_ENV: "production", MASTER_PASSWORD: VALID })).toBe(false);
    expect(matchesMasterPassword("curta", { NODE_ENV: "development", MASTER_PASSWORD: "curta" })).toBe(false);
    expect(matchesMasterPassword(VALID, { NODE_ENV: "development" })).toBe(false);
  });
});
