import { Router } from "express";
import { ServiceController } from "../controllers/service.controller";


const router = Router();
const serviceController = new ServiceController();

router.post("/", serviceController.create);
router.get("/", serviceController.listAll);
router.get("/:id", serviceController.getById);
router.put("/:id", serviceController.update);
router.delete("/:id", serviceController.delete);

export default router;