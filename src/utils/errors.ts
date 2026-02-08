/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date();

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize error to JSON for logging/API responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack }),
    };
  }
}

/**
 * Validation error (400)
 * Used when request data fails validation
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, true, context);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error (401)
 * Used when authentication fails or is missing
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', context?: Record<string, any>) {
    super(message, 401, true, context);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error (403)
 * Used when user lacks permission for an action
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Unauthorized access', context?: Record<string, any>) {
    super(message, 403, true, context);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not found error (404)
 * Used when a requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', context?: Record<string, any>) {
    super(message, 404, true, context);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict error (409)
 * Used when a resource already exists or there's a conflict
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict', context?: Record<string, any>) {
    super(message, 409, true, context);
    this.name = 'ConflictError';
  }
}

/**
 * Bot error (500)
 * Used for errors during bot automation
 */
export class BotError extends AppError {
  public readonly botType: string;
  public readonly screenshot?: string;
  public readonly pageUrl?: string;

  constructor(
    message: string,
    botType: string = 'unknown',
    screenshot?: string,
    pageUrl?: string,
    context?: Record<string, any>
  ) {
    super(message, 500, true, { ...context, botType, screenshot, pageUrl });
    this.name = 'BotError';
    this.botType = botType;
    this.screenshot = screenshot;
    this.pageUrl = pageUrl;
  }
}

/**
 * Enlace error (500)
 * Specific error for Enlace Operativo automation
 */
export class EnlaceError extends BotError {
  constructor(
    message: string,
    screenshot?: string,
    pageUrl?: string,
    context?: Record<string, any>
  ) {
    super(message, 'enlace', screenshot, pageUrl, context);
    this.name = 'EnlaceError';
  }
}

/**
 * External service error (502)
 * Used when external APIs/services fail
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(
    message: string,
    service: string,
    originalError?: Error,
    context?: Record<string, any>
  ) {
    super(message, 502, true, { ...context, service, originalError: originalError?.message });
    this.name = 'ExternalServiceError';
    this.service = service;
    this.originalError = originalError;
  }
}

/**
 * Database error (500)
 * Used for database operation failures
 */
export class DatabaseError extends AppError {
  public readonly operation: string;
  public readonly table?: string;

  constructor(
    message: string,
    operation: string,
    table?: string,
    context?: Record<string, any>
  ) {
    super(message, 500, true, { ...context, operation, table });
    this.name = 'DatabaseError';
    this.operation = operation;
    this.table = table;
  }
}

/**
 * Queue error (500)
 * Used for queue/job processing failures
 */
export class QueueError extends AppError {
  public readonly jobId?: string;
  public readonly queueName?: string;

  constructor(
    message: string,
    jobId?: string,
    queueName?: string,
    context?: Record<string, any>
  ) {
    super(message, 500, true, { ...context, jobId, queueName });
    this.name = 'QueueError';
    this.jobId = jobId;
    this.queueName = queueName;
  }
}

/**
 * Timeout error (408)
 * Used when operations exceed time limits
 */
export class TimeoutError extends AppError {
  public readonly timeout: number;

  constructor(message: string, timeout: number, context?: Record<string, any>) {
    super(message, 408, true, { ...context, timeout });
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }
}

/**
 * Rate limit error (429)
 * Used when rate limits are exceeded
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 429, true, { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Type guard to check if error is operational
 */
export function isOperationalError(error: Error): error is AppError {
  return error instanceof AppError && error.isOperational;
}

/**
 * Format error for API response
 */
export function formatErrorResponse(error: Error) {
  if (error instanceof AppError) {
    return {
      success: false,
      error: error.message,
      code: error.name,
      ...(error.context && { context: error.context }),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    };
  }

  // Unknown error
  return {
    success: false,
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && {
      originalError: error.message,
      stack: error.stack,
    }),
  };
}
