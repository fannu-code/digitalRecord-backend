const multer = require("multer");

// =============================================
// MEMORY STORAGE
// =============================================

const storage = multer.memoryStorage();

// =============================================
// FILE FILTER
// =============================================

const fileFilter = (req, file, cb) => {
  cb(null, true);
};

// =============================================
// MULTER CONFIGURATION
// =============================================

const upload = multer({
  storage,

  fileFilter,

  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});

module.exports = upload;
