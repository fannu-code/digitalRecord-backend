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

/**
 * DOWNLOAD DOCUMENT
 *
 * The browser does NOT directly download from Cloudinary.
 *
 * Flow:
 *
 * React
 *   ↓
 * Express /download/:id
 *   ↓
 * MongoDB
 *   ↓
 * Cloudinary
 *   ↓
 * Express stream
 *   ↓
 * Browser download
 */
const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the record.
    const record = await Record.findById(id);

    if (!record) {
      return res.status(404).json({
        message: "Record not found.",
      });
    }

    if (!record.documentUrl) {
      return res.status(404).json({
        message: "Document URL not found.",
      });
    }

    /*
     * Request the Cloudinary file as a stream.
     *
     * This allows us to control the response sent
     * back to the browser.
     */
    const cloudinaryResponse = await axios({
      method: "GET",
      url: record.documentUrl,
      responseType: "stream",
      timeout: 120000,
      maxRedirects: 5,
    });

    /*
     * Use the original MIME type saved during upload.
     */
    if (record.documentType) {
      res.setHeader("Content-Type", record.documentType);
    } else if (cloudinaryResponse.headers["content-type"]) {
      res.setHeader("Content-Type", cloudinaryResponse.headers["content-type"]);
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
    }

    /*
     * Force browser download.
     *
     * The filename comes from the original uploaded file.
     */
    const safeFileName = sanitizeFileName(
      record.originalFileName || "document",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}"`,
    );

    /*
     * If Cloudinary provides content length,
     * forward it to the browser.
     */
    if (cloudinaryResponse.headers["content-length"]) {
      res.setHeader(
        "Content-Length",
        cloudinaryResponse.headers["content-length"],
      );
    }

    /*
     * Prevent caching of protected downloads.
     */
    res.setHeader(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate",
    );

    /*
     * Stream Cloudinary → Express → Browser.
     */
    cloudinaryResponse.data.on("error", (streamError) => {
      console.error("Cloudinary Download Stream Error:", streamError);

      if (!res.headersSent) {
        return res.status(500).json({
          message: "Error while downloading document.",
        });
      }

      res.destroy(streamError);
    });

    cloudinaryResponse.data.pipe(res);
  } catch (error) {
    console.error("Download Document Error:", error);

    /*
     * Cloudinary/axios errors.
     */
    if (error.response) {
      console.error("Cloudinary Response Status:", error.response.status);

      if (!res.headersSent) {
        return res.status(404).json({
          message: "Unable to retrieve the document from Cloudinary.",
        });
      }
    }

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
