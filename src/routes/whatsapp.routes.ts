/* import { Router } from "express";

const router = Router();

router.post("/webhook/whatsapp", (req, res) => {
  const entry = req.body.entry?.[0];
  const message = entry?.changes?.[0]?.value?.messages?.[0];

  if (message?.text) {
    // aqui você responderá futuramente
    console.log("Mensagem recebida:", message.text.body);
  }

  res.sendStatus(200);
});

export default router;
 */