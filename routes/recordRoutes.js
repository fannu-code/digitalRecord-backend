const express = require("express");

const {
  submitRecord,
  searchRecord,
  getAvailableYears,
  downloadDocument,
  deleteRecord,
} = require("../controllers/recordController");

const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

// =============================================
// SUBMIT RECORD
// =============================================
// POST /api/records/submit
//
// Authentication:
// protect
//
// File upload:
// upload.single("document")
//
// The "document" name MUST match:
// formData.append("document", selectedFile)
// in SubmitRecord.jsx
// =============================================
router.post(
  "/submit",
  protect,
  (req, res, next) => {
    upload.single("document")(req, res, (error) => {
      if (error) {
        console.error("File Upload Error:", error);

        return res.status(400).json({
          message: error.message || "Unable to upload the file.",
        });
      }

      next();
    });
  },
  submitRecord,
);

// =============================================
// SEARCH RECORDS
// =============================================
// GET /api/records/search
//
// Examples:
//
// /api/records/search?dairyNo=729/ADMIN/KEMU
//
// /api/records/search?documentName=Annual%20Report
//
// /api/records/search?year=1999
//
// /api/records/search?dairyNo=729/ADMIN/KEMU&year=1999
//
// Authentication:
// protect
// =============================================
router.get("/search", protect, searchRecord);

// =============================================
// GET AVAILABLE YEARS
// =============================================
// GET /api/records/years
//
// Returns only years that actually exist
// in the database.
//
// Example:
//
// {
//   "years": [
//      2026,
//      2025,
//      2000,
//      1999,
//      1987
//   ]
// }
//
// Authentication:
// protect
// =============================================
router.get("/years", protect, getAvailableYears);

// =============================================
// DOWNLOAD DOCUMENT
// =============================================
// GET /api/records/download/:id
//
// Authentication:
// protect
//
// The controller determines whether the file
// is an image, video, or raw document and
// generates the appropriate Cloudinary URL.
// =============================================
router.get("/download/:id", protect, downloadDocument);

// =============================================
// DELETE RECORD
// =============================================
// DELETE /api/records/:id
//
// Authentication:
// protect
//
// The controller deletes:
// 1. Cloudinary document
// 2. MongoDB record
// =============================================
router.delete("/:id", protect, deleteRecord);

// =============================================
// EXPORT
// =============================================
module.exports = router;
