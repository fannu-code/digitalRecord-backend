const express = require("express");

const {
  submitRecord,
  searchRecord,
  downloadDocument,
  deleteRecord
} = require("../controllers/recordController");

const protect = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

// =================================
// SUBMIT RECORD
// =================================
router.post(
  "/submit",
  protect,
  (req, res, next) => {
    upload.single("document")(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          message: error.message,
        });
      }

      next();
    });
  },
  submitRecord,
);

// =================================
// SEARCH RECORD
// Example:
// /api/records/search?dairyNo=729/ADMIN/KEMU
// =================================
router.get("/search", protect, searchRecord);

// =================================
// DOWNLOAD DOCUMENT
// =================================
router.get("/download/:id", protect, downloadDocument);

router.delete("/:id", protect, deleteRecord);

module.exports = router;
