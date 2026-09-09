import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { verifyOAuthState } from "../utils/jwt";
import {
  buildGoogleConnectUrl,
  completeGoogleConnection,
  disconnectGoogle,
  getGoogleConnection,
  isGoogleConfigured,
} from "../services/google";

const router = Router();

router.get("/google/start", requireAuth, (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(503).json({ error: "Google integration isn't configured on this server yet" });
  }
  res.json({ url: buildGoogleConnectUrl(req.userId as string) });
});

router.get("/google/status", requireAuth, async (req, res) => {
  const connection = isGoogleConfigured() ? await getGoogleConnection(req.userId as string) : null;
  res.json({
    configured: isGoogleConfigured(),
    connected: Boolean(connection),
    email: connection?.accountEmail ?? null,
  });
});

router.delete("/google", requireAuth, async (req, res) => {
  await disconnectGoogle(req.userId as string);
  res.json({ ok: true });
});

function resultPage(title: string, body: string): string {
  // Matches the app's warm palette (app/src/theme/tokens.ts) so the browser
  // hop doesn't feel like leaving the product.
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #FBF3EA; color: #3A2E27; font-family: Nunito, -apple-system, system-ui, sans-serif; }
  main { max-width: 420px; padding: 32px; background: #fff; border-radius: 24px; border: 1px solid #EAD9C4;
         box-shadow: 0 4px 12px rgba(58,46,39,0.08); text-align: center; }
  h1 { font-size: 24px; margin: 0 0 12px; }
  p { color: #8A7768; line-height: 1.5; margin: 0; }
</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
}

// Google redirects here after consent. No app session is involved - the
// signed `state` identifies the user, which is what makes this work for a
// WhatsApp-only user who tapped a link the PA sent.
router.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error || typeof code !== "string" || typeof state !== "string") {
    return res
      .status(400)
      .send(resultPage("That didn't go through", "Google didn't finish connecting. Head back and try again whenever you like."));
  }

  try {
    const userId = verifyOAuthState(state);
    const email = await completeGoogleConnection(userId, code);
    res.send(
      resultPage(
        "You're connected",
        `${email ? `${email} is` : "Gmail and Calendar are"} now linked to your assistant. You can close this and head back to the app or WhatsApp.`,
      ),
    );
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    res
      .status(400)
      .send(resultPage("That link has expired", "Ask your assistant for a fresh Google connect link and try again."));
  }
});

export default router;
