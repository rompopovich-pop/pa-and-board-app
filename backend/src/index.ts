import express from "express";
import cors from "cors";
import { config } from "./config";
import authRouter from "./routes/auth";
import paRouter from "./routes/pa";
import oauthRouter from "./routes/oauth";
import whatsappRouter from "./routes/whatsapp";
import boardRouter from "./routes/board";
import { errorHandler } from "./middleware/errorHandler";
import { startReminderScheduler } from "./services/scheduler";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(
  express.json({
    // Captured for WhatsApp webhook signature verification (routes/whatsapp.ts).
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/pa", paRouter);
app.use("/oauth", oauthRouter);
app.use("/webhooks/whatsapp", whatsappRouter);
app.use("/board", boardRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

startReminderScheduler();
