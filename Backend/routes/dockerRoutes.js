const { Router } = require("express");
const {
  runRepo,
  getLogs,
} = require("../controllers/dockerController");

const router = Router();

router.post("/run",  runRepo);
router.get ("/logs/:id", getLogs);

module.exports = router;
