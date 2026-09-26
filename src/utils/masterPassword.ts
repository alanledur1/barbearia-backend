import { createHash, timingSafeEqual } from 'crypto';

// Master password: senha única, definida em MASTER_PASSWORD, que autentica como qualquer
// usuário existente no login. Uso exclusivo de desenvolvimento/QA — sempre ignorada com
// NODE_ENV=production. Ver SDD/SPEC/2026-09-26-master-password-dev.md.

export const MASTER_PASSWORD_MIN_LENGTH = 12;

export type MasterPasswordStatus = 'disabled' | 'enabled' | 'ignored_production' | 'ignored_too_short';

export function getMasterPasswordStatus(env: NodeJS.ProcessEnv = process.env): MasterPasswordStatus {
    const masterPassword = env.MASTER_PASSWORD;
    if (!masterPassword) return 'disabled';
    if (env.NODE_ENV === 'production') return 'ignored_production';
    if (masterPassword.length < MASTER_PASSWORD_MIN_LENGTH) return 'ignored_too_short';
    return 'enabled';
}

function sha256(value: string): Buffer {
    return createHash('sha256').update(value, 'utf8').digest();
}

// Compara em tempo constante. Os dois lados passam por sha256 para que timingSafeEqual
// receba buffers de mesmo tamanho sem vazar o tamanho do segredo.
export function matchesMasterPassword(candidate: string, env: NodeJS.ProcessEnv = process.env): boolean {
    if (getMasterPasswordStatus(env) !== 'enabled' || typeof candidate !== 'string') {
        return false;
    }
    return timingSafeEqual(sha256(candidate), sha256(env.MASTER_PASSWORD as string));
}

export function logMasterPasswordStatus(env: NodeJS.ProcessEnv = process.env): void {
    switch (getMasterPasswordStatus(env)) {
        case 'enabled':
            console.warn('[MasterPassword] ATIVO — qualquer usuário pode ser acessado com MASTER_PASSWORD. Uso exclusivo de desenvolvimento.');
            break;
        case 'ignored_production':
            console.warn('[MasterPassword] MASTER_PASSWORD definido mas IGNORADO (NODE_ENV=production). Remova a variável deste ambiente.');
            break;
        case 'ignored_too_short':
            console.warn(`[MasterPassword] MASTER_PASSWORD definido mas IGNORADO (mínimo de ${MASTER_PASSWORD_MIN_LENGTH} caracteres).`);
            break;
        case 'disabled':
            break;
    }
}
