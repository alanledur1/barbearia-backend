import { Router } from "express";
import { ClientController } from "../controllers/clientController";

const router = Router();
const clientController = new ClientController();

router.post("/", clientController.register);
router.get("/", clientController.listAll);
router.get("/:id", clientController.getById);
router.put("/:id", clientController.update);
router.delete("/:id", clientController.delete);

export default router;