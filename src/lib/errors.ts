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
