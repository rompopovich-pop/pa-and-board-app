import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { signAuthToken } from "../utils/jwt";
import { requireAuth } from "../middleware/auth";

const router = Router();

const SALT_ROUNDS = 10;

function toPublicUser(user: { id: string; email: string; name: string; phone: string | null; timezone: string | null; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    timezone: user.timezone,
    createdAt: user.createdAt,
  };
}

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

router.post("/signup", async (req, res) => {
  const parsed = signUpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  const token = signAuthToken({ userId: user.id });
  res.status(201).json({ token, user: toPublicUser(user) });
});

const logInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

router.post("/login", async (req, res) => {
  const parsed = logInSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signAuthToken({ userId: user.id });
  res.json({ token, user: toPublicUser(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ user: toPublicUser(user) });
});

export default router;
