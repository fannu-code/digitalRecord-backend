const path = require("path");
const fs = require("fs");
const Record = require("../models/Record");

// =================================
// DELETE RECORD
// =================================
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
    const filePath = path.join(process.cwd(), "uploads", record.document);

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
    const { dairyNo, documentName, date } = req.body;

    if (!dairyNo || !documentName || !date) {
      return res.status(400).json({
        message: "Dairy No, Document Name, and Date are required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Document is required",
      });
    }

    // Check if Dairy No already exists
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
      documentName: documentName.trim(),
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
// SEARCH RECORDS
//
// Supported:
//
// Dairy No
// Document Name
// Year
//
// Or any combination:
//
// Dairy No + Document Name
// Dairy No + Year
// Document Name + Year
// Dairy No + Document Name + Year
// =================================
const searchRecord = async (req, res) => {
  try {
    const { dairyNo, documentName, year } = req.query;

    const cleanDairyNo = dairyNo?.trim();
    const cleanDocumentName = documentName?.trim();
    const cleanYear = year?.trim();

    // =================================
    // VALIDATE SEARCH PARAMETERS
    // =================================
    if (!cleanDairyNo && !cleanDocumentName && !cleanYear) {
      return res.status(400).json({
        message: "Please provide Dairy No, Document Name, or Year to search.",
      });
    }

    // =================================
    // BUILD MONGODB QUERY
    // =================================
    const query = {};

    // =================================
    // DAIRY NUMBER
    // =================================
    if (cleanDairyNo) {
      query.dairyNo = cleanDairyNo;
    }

    // =================================
    // DOCUMENT NAME
    // =================================
    if (cleanDocumentName) {
      query.documentName = {
        $regex: `^${escapeRegex(cleanDocumentName)}$`,
        $options: "i",
      };
    }

    // =================================
    // YEAR
    // =================================
    if (cleanYear) {
      const selectedYear = Number(cleanYear);

      if (
        !Number.isInteger(selectedYear) ||
        selectedYear < 1 ||
        selectedYear > 9999
      ) {
        return res.status(400).json({
          message: "Please provide a valid year.",
        });
      }

      // Start of selected year
      const startDate = new Date(Date.UTC(selectedYear, 0, 1));

      // Start of next year
      const endDate = new Date(Date.UTC(selectedYear + 1, 0, 1));

      query.date = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    // =================================
    // FIND RECORDS
    // =================================
    const records = await Record.find(query)
      .populate("uploadedBy", "username")
      .sort({
        date: 1,
        dairyNo: 1,
      });

    // =================================
    // NO RECORDS
    // =================================
    if (!records || records.length === 0) {
      return res.status(404).json({
        message: "No matching records found.",
        records: [],
      });
    }

    // =================================
    // SUCCESS
    // =================================
    return res.status(200).json({
      message: `${records.length} record(s) found successfully.`,
      count: records.length,
      records,
    });
  } catch (error) {
    console.error("Search Record Error:", error);

    return res.status(500).json({
      message: "Server error while searching records.",
      records: [],
    });
  }
};

// =================================
// GET AVAILABLE YEARS
//
// Returns only years that actually
// exist in the Record collection.
//
// Example:
//
// {
//   "years": [2026, 2025, 2000, 1999, 1987]
// }
// =================================
const getAvailableYears = async (req, res) => {
  try {
    const records = await Record.find(
      {},
      {
        date: 1,
      },
    ).lean();

    // =================================
    // Extract unique years
    // =================================
    const yearsSet = new Set();

    records.forEach((record) => {
      if (record.date) {
        const year = new Date(record.date).getUTCFullYear();

        if (year > 0) {
          yearsSet.add(year);
        }
      }
    });

    // =================================
    // Convert Set to Array
    // Newest year first
    // =================================
    const years = Array.from(yearsSet).sort((a, b) => b - a);

    return res.status(200).json({
      message: "Available years retrieved successfully.",
      years,
    });
  } catch (error) {
    console.error("Get Available Years Error:", error);

    return res.status(500).json({
      message: "Server error while retrieving available years.",
      years: [],
    });
  }
};

// =================================
// ESCAPE REGEX
// =================================
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    // =================================
    // CHECK FILE
    // =================================
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        message: "Document file not found on server",
      });
    }

    // =================================
    // DOWNLOAD
    // =================================
    res.download(filePath, record.originalFileName);
  } catch (error) {
    console.error("Download Document Error:", error);

    res.status(500).json({
      message: "Server error while downloading document",
    });
  }
};

// =================================
// EXPORT
// =================================
module.exports = {
  submitRecord,
  searchRecord,
  getAvailableYears,
  downloadDocument,
  deleteRecord,
};
