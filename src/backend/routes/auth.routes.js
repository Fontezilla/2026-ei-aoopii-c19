const { Router } = require("express");
const { login, register, logout, me, updateAvatar } = require("../services/auth.service");
const { requireAuth } = require("../middlewares/auth.middleware");
const { uploadAvatar } = require("../middlewares/upload.middleware");

const router = Router();

router.get("/me", requireAuth, me);
router.post("/login", login);
router.post("/register", register);
router.post("/logout", logout);

router.patch("/avatar", requireAuth, uploadAvatar.single("avatar"), updateAvatar);

module.exports = router;
