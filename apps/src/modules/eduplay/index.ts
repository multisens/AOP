import express, { Router, Request, Response } from "express";
import { nanoid } from "nanoid";

const router: Router = express.Router();

const HOST_IP = process.env.HOST_IP || "localhost";

// Rota para o apresentador do quiz
router.get("/", (req: Request, res: Response) => {
  const roomId = nanoid(6).toUpperCase();

  const playerUrl = `${req.protocol}://${HOST_IP}:${process.env.PORT || 8081}/eduplay/play/${roomId}`;
  const logicServerUrl = `${req.protocol}://${HOST_IP}:8082`;

  res.render("quiz-presenter", {
    pageTitle: "Eduplay - SetExpo Quiz",
    roomId,
    playerUrl,
    logicServerUrl,
  });
});

// Rota para o player do quiz
router.get("/play/:roomId", (req: Request, res: Response) => {
  const { roomId } = req.params;
  const logicServerUrl = `${req.protocol}://${req.hostname}:8082`;

  res.render("quiz-player", {
    pageTitle: "Play - SetExpo Quiz",
    roomId,
    logicServerUrl,
  });
});

export default router;
