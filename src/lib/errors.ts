export class BsaleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BsaleAuthError";
  }
}

export class BsaleRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BsaleRateLimitError";
  }
}

export class BsaleServerError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "BsaleServerError";
  }
}

export class ResendAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResendAuthError";
  }
}

export class ResendRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResendRateLimitError";
  }
}

export class ResendValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResendValidationError";
  }
}

export class ResendServerError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "ResendServerError";
  }
}
