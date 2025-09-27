export class CustomError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'CustomError';
    this.statusCode = statusCode;
    // Capturando o stack trace para melhor depuração (opcional, mas bom)
    Error.captureStackTrace(this, CustomError);
  }
}