const multer = require("multer");
const path = require("path");
const fs = require("fs");

// =============================================
// UPLOAD DIRECTORY
// =============================================

const uploadDirectory = path.join(process.cwd(), "uploads");

// Create uploads folder automatically
// if it does not already exist
if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

// =============================================
// STORAGE CONFIGURATION
// =============================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);

    // Get original file extension
    const extension = path.extname(file.originalname);

    // Example:
    // Original: Annual Report.docx
    // Stored:   1757245123456-123456789.docx

    cb(null, uniqueName + extension);
  },
});

// =============================================
// FILE FILTER
// =============================================
// Accept ALL file types.
//
// Examples:
//
// Images:
// .jpg
// .jpeg
// .png
// .gif
// .bmp
// .webp
// .svg
// .tiff
//
// Documents:
// .pdf
// .doc
// .docx
// .docm
// .txt
// .rtf
//
// Excel:
// .xls
// .xlsx
// .xlsm
// .xlsb
// .csv
//
// PowerPoint:
// .ppt
// .pptx
// .pptm
// .pps
// .ppsx
//
// Archives:
// .zip
// .rar
// .7z
//
// And other file types.
//
// =============================================

const fileFilter = (req, file, cb) => {
  cb(null, true);
};

// =============================================
// MULTER CONFIGURATION
// =============================================

const upload = multer({
  storage: storage,

  fileFilter: fileFilter,

  limits: {
    // Maximum file size = 100 MB

    fileSize: 100 * 1024 * 1024,
  },
});

// =============================================
// EXPORT
// =============================================

module.exports = upload;
