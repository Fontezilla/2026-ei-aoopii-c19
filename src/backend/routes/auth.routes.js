const { Router } = require("express");
const { login, register, logout, me } = require("../services/auth.service");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = Router();

router.get("/me", requireAuth, me);
router.post("/login", login);
router.post("/register", register);
router.post("/logout", logout);

module.exports = router;
