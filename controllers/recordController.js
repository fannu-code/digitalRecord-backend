const path = require("path");
const fs = require("fs");
const Record = require("../models/Record");
const cloudinary = require("../config/cloudinary");
const axios = require("axios");

// =================================
// DELETE RECORD
// =================================
const deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;

    // =================================
    // FIND RECORD
    // =================================

    const record = await Record.findById(id);

    if (!record) {
      return res.status(404).json({
        message: "Record not found.",
      });
    }

    // =================================
    // DELETE FROM CLOUDINARY
    // =================================

    if (record.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(record.cloudinaryPublicId, {
          resource_type: record.cloudinaryResourceType,
        });
      } catch (cloudinaryError) {
        console.error("Cloudinary Delete Error:", cloudinaryError);
      }
    }

    // =================================
    // DELETE FROM MONGODB
    // =================================

    await Record.findByIdAndDelete(id);

    // =================================
    // RESPONSE
    // =================================

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

    // =================================
    // VALIDATE FIELDS
    // =================================

    if (!dairyNo || !documentName || !date) {
      return res.status(400).json({
        message: "Dairy No, Document Name, and Date are required",
      });
    }

    // =================================
    // VALIDATE FILE
    // =================================

    if (!req.file) {
      return res.status(400).json({
        message: "Document is required",
      });
    }

    // =================================
    // CHECK DUPLICATE DAIRY NUMBER
    // =================================

    const existingRecord = await Record.findOne({
      dairyNo: dairyNo.trim(),
    });

    if (existingRecord) {
      return res.status(400).json({
        message: "A record with this Dairy No already exists",
      });
    }

    // =================================
    // UPLOAD TO CLOUDINARY
    // =================================

    const uploadToCloudinary = () => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "kemu-digital-records",
            resource_type: "auto",
            use_filename: false,
            unique_filename: true,
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          },
        );

        stream.end(req.file.buffer);
      });
    };

    const cloudinaryResult = await uploadToCloudinary();

    // =================================
    // SAVE RECORD IN MONGODB
    // =================================

    const record = await Record.create({
      dairyNo: dairyNo.trim(),

      documentName: documentName.trim(),

      date,

      documentUrl: cloudinaryResult.secure_url,

      cloudinaryPublicId: cloudinaryResult.public_id,

      cloudinaryResourceType: cloudinaryResult.resource_type,

      originalFileName: req.file.originalname,

      documentType: req.file.mimetype,

      uploadedBy: req.user.id,
    });

    // =================================
    // RESPONSE
    // =================================

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
// SANITIZE FILE NAME
// =================================
const sanitizeFileName = (fileName) => {
  return fileName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
};

// =================================
// DOWNLOAD DOCUMENT
// =================================
const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // =================================
    // FIND RECORD
    // =================================
    const record = await Record.findById(id);

    if (!record) {
      return res.status(404).json({
        message: "Record not found.",
      });
    }

    // =================================
    // CHECK CLOUDINARY URL
    // =================================
    if (!record.documentUrl) {
      return res.status(404).json({
        message: "Document URL not found.",
      });
    }

    console.log("Starting document download:", {
      recordId: record._id.toString(),
      fileName: record.originalFileName,
      documentUrl: record.documentUrl,
      resourceType: record.cloudinaryResourceType,
    });

    // =================================
    // REQUEST FILE FROM CLOUDINARY
    // =================================
    const cloudinaryResponse = await axios.get(record.documentUrl, {
      responseType: "stream",
      timeout: 120000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // =================================
    // FILE NAME
    // =================================
    const safeFileName = sanitizeFileName(
      record.originalFileName || "document",
    );

    // =================================
    // CONTENT TYPE
    // =================================
    const contentType =
      record.documentType ||
      cloudinaryResponse.headers["content-type"] ||
      "application/octet-stream";

    res.setHeader("Content-Type", contentType);

    // =================================
    // FORCE DOWNLOAD
    // =================================
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}"`,
    );

    // =================================
    // CONTENT LENGTH
    // =================================
    const contentLength = cloudinaryResponse.headers["content-length"];

    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    // =================================
    // CACHE CONTROL
    // =================================
    res.setHeader(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate",
    );

    // =================================
    // STREAM CLOUDINARY → BROWSER
    // =================================
    cloudinaryResponse.data.on("error", (streamError) => {
      console.error("Cloudinary Stream Error:", streamError);

      if (!res.headersSent) {
        return res.status(500).json({
          message: "Error while streaming document.",
        });
      }

      res.destroy(streamError);
    });

    cloudinaryResponse.data.pipe(res);
  } catch (error) {
    console.error("Download Document Error:", error);

    // =================================
    // CLOUDINARY / AXIOS ERROR
    // =================================
    if (error.response) {
      console.error("Cloudinary Status:", error.response.status);

      console.error("Cloudinary Headers:", error.response.headers);

      if (!res.headersSent) {
        return res.status(error.response.status || 500).json({
          message: "Unable to retrieve document from Cloudinary.",
        });
      }

      return;
    }

    // =================================
    // TIMEOUT
    // =================================
    if (error.code === "ECONNABORTED") {
      if (!res.headersSent) {
        return res.status(504).json({
          message: "Document download timed out.",
        });
      }

      return;
    }

    // =================================
    // GENERAL ERROR
    // =================================
    if (!res.headersSent) {
      return res.status(500).json({
        message: "Server error while downloading document.",
      });
    }
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
