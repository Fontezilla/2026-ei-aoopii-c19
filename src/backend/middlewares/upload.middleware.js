const multer = require("multer");

const storage = multer.memoryStorage();

const imageFileFilter = (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error("Formato de imagem inválido."));
    }

    cb(null, true);
};

const uploadAvatar = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024,
    },
});

module.exports = { uploadAvatar };