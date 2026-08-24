const path = require("path");
const fs = require("fs");
const Record = require("../models/Record");

const deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await Record.findById(id);

    if (!record) {
      return res.status(404).json({
        message: "Record not found.",
      });
    }

    // Path of uploaded document
    const filePath = path.join(
      process.cwd(),
      "uploads",
      record.document
    );

    // Delete physical document if it exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete record from MongoDB
    await Record.findByIdAndDelete(id);

    res.status(200).json({
      message: "Record and document deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Record Error:", error);

    res.status(500).json({
      message: "Unable to delete the record.",
    });
  }
};

// =================================
// SUBMIT RECORD
// =================================
const submitRecord = async (req, res) => {
  try {
    const { dairyNo, date } = req.body;

    if (!dairyNo || !date) {
      return res.status(400).json({
        message: "Dairy No and Date are required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Document is required",
      });
    }

    const existingRecord = await Record.findOne({
      dairyNo: dairyNo.trim(),
    });

    if (existingRecord) {
      return res.status(400).json({
        message: "A record with this Dairy No already exists",
      });
    }

    const record = await Record.create({
      dairyNo: dairyNo.trim(),
      date,
      document: req.file.filename,
      originalFileName: req.file.originalname,
      documentType: req.file.mimetype,
      uploadedBy: req.user.id,
    });

    res.status(201).json({
      message: "Record submitted successfully",
      record,
    });
  } catch (error) {
    console.error("Submit Record Error:", error);

    res.status(500).json({
      message: "Server error while submitting record",
    });
  }
};

// =================================
// SEARCH RECORD BY DAIRY NO
// =================================
const searchRecord = async (req, res) => {
  try {
    const { dairyNo } = req.query;

    if (!dairyNo) {
      return res.status(400).json({
        message: "Dairy No is required",
      });
    }

    const record = await Record.findOne({
      dairyNo: dairyNo.trim(),
    }).populate("uploadedBy", "username");

    if (!record) {
      return res.status(404).json({
        message: "No record found with this Dairy No",
      });
    }

    res.status(200).json({
      message: "Record found successfully",
      record,
    });
  } catch (error) {
    console.error("Search Record Error:", error);

    res.status(500).json({
      message: "Server error while searching record",
    });
  }
};

// =================================
// DOWNLOAD DOCUMENT
// =================================
const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const record = await Record.findById(id);

    if (!record) {
      return res.status(404).json({
        message: "Record not found",
      });
    }

    const filePath = path.join(__dirname, "..", "uploads", record.document);

    // Check if physical file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Document file not found on server",
      });
    }

    res.download(filePath, record.originalFileName);
  } catch (error) {
    console.error("Download Document Error:", error);

    res.status(500).json({
      message: "Server error while downloading document",
    });
  }
};

module.exports = {
  submitRecord,
  searchRecord,
  downloadDocument,
  deleteRecord
};
