import jwt from 'jsonwebtoken';

export type UserTokenPayload = {
    userId: number;
    role: string;
    email: string | null;
};

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';

export function signUserToken(payload: UserTokenPayload, expiresIn: string = '8h'): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export function verifyUserToken(token: string): UserTokenPayload {
    return jwt.verify(token, JWT_SECRET) as UserTokenPayload;
}
