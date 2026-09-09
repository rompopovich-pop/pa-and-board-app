export {};

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      /** Raw request body bytes, captured for WhatsApp webhook signature verification. */
      rawBody?: Buffer;
    }
  }
}
