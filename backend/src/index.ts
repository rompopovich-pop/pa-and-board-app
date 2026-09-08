import express from "express";
import cors from "cors";
import { config } from "./config";
import authRouter from "./routes/auth";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
