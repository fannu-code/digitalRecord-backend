const multer = require("multer");
const path = require("path");

// =============================================
// MEMORY STORAGE
// =============================================
// Keep the uploaded file in memory.
// recordController.js will send req.file.buffer
// to Cloudinary.

const storage = multer.memoryStorage();

// =============================================
// ALLOWED FILE EXTENSIONS
// =============================================

const allowedExtensions = new Set([
  // ===========================================
  // IMAGES
  // ===========================================
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
  ".tif",
  ".tiff",
  ".ico",

  // ===========================================
  // PDF
  // ===========================================
  ".pdf",

  // ===========================================
  // MICROSOFT WORD
  // ===========================================
  ".doc",
  ".docx",
  ".docm",
  ".dot",
  ".dotx",
  ".dotm",

  // ===========================================
  // MICROSOFT EXCEL
  // ===========================================
  ".xls",
  ".xlsx",
  ".xlsm",
  ".xlsb",
  ".csv",

  // ===========================================
  // MICROSOFT POWERPOINT
  // ===========================================
  ".ppt",
  ".pptx",
  ".pptm",
  ".pps",
  ".ppsx",
  ".pot",
  ".potx",
  ".potm",

  // ===========================================
  // ARCHIVES
  // ===========================================
  ".zip",
  ".rar",
  ".7z",

  // ===========================================
  // TEXT
  // ===========================================
  ".txt",
  ".rtf",
]);

// =============================================
// FILE FILTER
// =============================================
// We validate using the file extension rather
// than relying only on file.mimetype.
//
// This is important because ZIP, RAR, 7Z and
// some Microsoft Office files may have different
// MIME types depending on the browser/OS.

const fileFilter = (req, file, cb) => {
  try {
    // Get original extension
    const extension = path.extname(file.originalname || "").toLowerCase();

    // Check extension
    if (!allowedExtensions.has(extension)) {
      return cb(
        new Error(
          "Unsupported file type. Please upload an image, PDF, Word, Excel, PowerPoint, ZIP, RAR, 7Z, TXT, CSV or RTF file.",
        ),
        false,
      );
    }

    // File accepted
    cb(null, true);
  } catch (error) {
    console.error("File Filter Error:", error);

    cb(new Error("Unable to validate the uploaded file."), false);
  }
};

// =============================================
// MULTER CONFIGURATION
// =============================================

const upload = multer({
  storage,

  fileFilter,

  limits: {
    // Maximum file size = 10 MB
    fileSize: 10 * 1024 * 1024,
  },
});

// =============================================
// EXPORT
// =============================================

module.exports = upload;
