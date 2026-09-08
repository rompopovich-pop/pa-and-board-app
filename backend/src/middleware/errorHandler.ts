import { NextFunction, Request, Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  res.status(500).json({ error: message });
}
