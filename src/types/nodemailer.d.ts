// Declaração de módulo ambiente para 'nodemailer'.
//
// O pacote 'nodemailer' (^7.x) não publica seus próprios tipos TypeScript, e o
// pacote @types/nodemailer não pôde ser instalado neste ambiente (registry npm
// bloqueado). Esta declaração mínima evita o erro de build "Cannot find module
// 'nodemailer' or its corresponding type declarations" sob `strict: true`,
// tratando o módulo como `any` — mesmo padrão usado para libs sem tipos
// disponíveis. Se @types/nodemailer for instalado no futuro, este arquivo pode
// ser removido.
declare module 'nodemailer';
