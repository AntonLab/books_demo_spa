export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: number | string) {
    super(`${resource} ${id} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(field: string) {
    super(`${field} is already taken`, 409, { field });
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown) {
    super('Request validation failed', 400, details);
  }
}

// A well-formed request that breaks a domain rule the schema cannot express,
// such as crediting an account that does not hold the author role.
export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

// The request is valid but the resource's current state refuses it, such as
// removing a book's last Co-author. ConflictError is the narrower "this value
// is already taken" and keeps its field-shaped message.
export class StateConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Unsupported image type') {
    super(message, 415);
  }
}
