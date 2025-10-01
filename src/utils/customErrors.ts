export class CustomError extends Error {
  statusCode: number;
  details?: any; // Informação opcional adicional sobre o erro

  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'CustomError';
    this.statusCode = statusCode;
    this.details = details;
    // Capturando o stack trace para melhor depuração (opcional, mas bom)
    Error.captureStackTrace(this, CustomError);
  }
}