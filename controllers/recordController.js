const path = require("path");
const Record = require("../models/Record");
const cloudinary = require("../config/cloudinary");

// =============================================
// DELETE RECORD
// =============================================
const deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;

    // =============================================
    // FIND RECORD
    // =============================================
    const record = await Record.findById(id);

    if (!record) {
      return res.status(404).json({
        message: "Record not found.",
      });
    }

    // =============================================
    // DELETE FILE FROM CLOUDINARY
    // =============================================
    if (record.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(record.cloudinaryPublicId, {
          resource_type: record.cloudinaryResourceType || "raw",
        });

        console.log("Cloudinary document deleted:", record.cloudinaryPublicId);
      } catch (cloudinaryError) {
        console.error("Cloudinary Delete Error:", cloudinaryError);
      }
    }

    // =============================================
    // DELETE RECORD FROM MONGODB
    // =============================================
    await Record.findByIdAndDelete(id);

    // =============================================
    // RESPONSE
    // =============================================
    return res.status(200).json({
      message: "Record and document deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Record Error:", error);

    return res.status(500).json({
      message: "Unable to delete the record.",
    });
  }
};

// =============================================
// SUBMIT RECORD
// =============================================
const submitRecord = async (req, res) => {
  try {
    const { dairyNo, documentName, date } = req.body;

    // =============================================
    // VALIDATE FIELDS
    // =============================================
    if (!dairyNo || !documentName || !date) {
      return res.status(400).json({
        message: "Dairy No, Document Name, and Date are required.",
      });
    }

    // =============================================
    // VALIDATE FILE
    // =============================================
    if (!req.file) {
      return res.status(400).json({
        message: "Document is required.",
      });
    }

    // =============================================
    // CHECK DUPLICATE DAIRY NUMBER
    // =============================================
    const existingRecord = await Record.findOne({
      dairyNo: dairyNo.trim(),
    });

    if (existingRecord) {
      return res.status(400).json({
        message: "A record with this Dairy No already exists.",
      });
    }

    // =============================================
    // FILE INFORMATION
    // =============================================

    const originalFileName = req.file.originalname;

    // Example:
    // "annual-report.pdf"
    // ".pdf"
    const fileExtension = path.extname(originalFileName).toLowerCase();

    // MIME / Content Type
    //
    // Examples:
    // application/pdf
    // image/jpeg
    // application/zip
    // application/vnd.openxmlformats-officedocument.wordprocessingml.document
    //
    const documentType = req.file.mimetype || "application/octet-stream";

    // =============================================
    // DETERMINE CLOUDINARY RESOURCE TYPE
    // =============================================
    //
    // Cloudinary:
    //
    // Images -> image
    // Videos -> video
    // Other files -> raw
    //
    let cloudinaryResourceType = "raw";

    if (documentType.startsWith("image/")) {
      cloudinaryResourceType = "image";
    } else if (documentType.startsWith("video/")) {
      cloudinaryResourceType = "video";
    }

    // =============================================
    // UPLOAD TO CLOUDINARY
    // =============================================
    const uploadToCloudinary = () => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "kemu-digital-records",

            // IMPORTANT:
            // Images -> image
            // Videos -> video
            // Documents/archives -> raw
            resource_type: cloudinaryResourceType,

            // Let Cloudinary generate unique public ID
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

        uploadStream.end(req.file.buffer);
      });
    };

    const cloudinaryResult = await uploadToCloudinary();

    // =============================================
    // VERIFY CLOUDINARY RESPONSE
    // =============================================
    if (!cloudinaryResult) {
      return res.status(500).json({
        message: "Cloudinary did not return an upload result.",
      });
    }

    console.log("Cloudinary Upload Successful:", {
      publicId: cloudinaryResult.public_id,
      resourceType: cloudinaryResult.resource_type,
      secureUrl: cloudinaryResult.secure_url,
      format: cloudinaryResult.format,
    });

    // =============================================
    // SAVE RECORD IN MONGODB
    // =============================================
    const record = await Record.create({
      dairyNo: dairyNo.trim(),

      documentName: documentName.trim(),

      date,

      // Cloudinary URL
      documentUrl: cloudinaryResult.secure_url,

      // Cloudinary Public ID
      cloudinaryPublicId: cloudinaryResult.public_id,

      // image / video / raw
      cloudinaryResourceType:
        cloudinaryResult.resource_type || cloudinaryResourceType,

      // Original file name
      originalFileName,

      // MIME / Content Type
      documentType,

      // File extension
      fileExtension,

      // User
      uploadedBy: req.user.id,
    });

    // =============================================
    // RESPONSE
    // =============================================
    return res.status(201).json({
      message: "Record submitted successfully.",
      record,
    });
  } catch (error) {
    console.error("Submit Record Error:", error);

    // =============================================
    // CLEANUP CLOUDINARY FILE IF DB SAVE FAILS
    // =============================================
    //
    // If Cloudinary upload succeeded but MongoDB
    // failed, try to remove the uploaded file.
    //
    if (error.cloudinaryPublicId && error.cloudinaryResourceType) {
      try {
        await cloudinary.uploader.destroy(error.cloudinaryPublicId, {
          resource_type: error.cloudinaryResourceType,
        });
      } catch (cleanupError) {
        console.error("Cloudinary Cleanup Error:", cleanupError);
      }
    }

    return res.status(500).json({
      message: "Server error while submitting record.",
    });
  }
};

// =============================================
// SEARCH RECORDS
// =============================================
const searchRecord = async (req, res) => {
  try {
    const { dairyNo, documentName, year } = req.query;

    const cleanDairyNo = dairyNo?.trim();

    const cleanDocumentName = documentName?.trim();

    const cleanYear = year?.trim();

    // =============================================
    // VALIDATE SEARCH PARAMETERS
    // =============================================
    if (!cleanDairyNo && !cleanDocumentName && !cleanYear) {
      return res.status(400).json({
        message: "Please provide Dairy No, Document Name, or Year to search.",
      });
    }

    // =============================================
    // BUILD QUERY
    // =============================================
    const query = {};

    // =============================================
    // DAIRY NUMBER
    // =============================================
    if (cleanDairyNo) {
      query.dairyNo = cleanDairyNo;
    }

    // =============================================
    // DOCUMENT NAME
    // =============================================
    if (cleanDocumentName) {
      query.documentName = {
        $regex: `^${escapeRegex(cleanDocumentName)}$`,
        $options: "i",
      };
    }

    // =============================================
    // YEAR
    // =============================================
    if (cleanYear) {
      const selectedYear = Number(cleanYear);

      // Allow all valid four-digit years,
      // including years before 2000.
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

    // =============================================
    // FIND RECORDS
    // =============================================
    const records = await Record.find(query)
      .populate("uploadedBy", "username")
      .sort({
        date: 1,
        dairyNo: 1,
      });

    // =============================================
    // NO RECORDS
    // =============================================
    if (!records || records.length === 0) {
      return res.status(404).json({
        message: "No matching records found.",
        records: [],
      });
    }

    // =============================================
    // SUCCESS
    // =============================================
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

// =============================================
// GET AVAILABLE YEARS
// =============================================
const getAvailableYears = async (req, res) => {
  try {
    const records = await Record.find(
      {},
      {
        date: 1,
      },
    ).lean();

    // =============================================
    // EXTRACT UNIQUE YEARS
    // =============================================
    const yearsSet = new Set();

    records.forEach((record) => {
      if (record.date) {
        const year = new Date(record.date).getUTCFullYear();

        if (year > 0) {
          yearsSet.add(year);
        }
      }
    });

    // =============================================
    // SORT YEARS
    // NEWEST FIRST
    // =============================================
    const years = Array.from(yearsSet).sort((a, b) => b - a);

    // =============================================
    // RESPONSE
    // =============================================
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

// =============================================
// ESCAPE REGEX
// =============================================
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// =============================================
// SANITIZE FILE NAME
// =============================================
const sanitizeFileName = (fileName) => {
  return fileName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
};

// =============================================
// DOWNLOAD DOCUMENT
// =============================================
const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // =============================================
    // FIND RECORD
    // =============================================
    const record = await Record.findById(id);

    if (!record) {
      return res.status(404).json({
        message: "Record not found.",
      });
    }

    // =============================================
    // CHECK CLOUDINARY PUBLIC ID
    // =============================================
    if (!record.cloudinaryPublicId) {
      return res.status(404).json({
        message: "Cloudinary document ID not found.",
      });
    }

    // =============================================
    // FILE INFORMATION
    // =============================================
    const safeFileName = sanitizeFileName(
      record.originalFileName || "document",
    );

    const contentType = record.documentType || "application/octet-stream";

    const resourceType = record.cloudinaryResourceType || "raw";

    // =============================================
    // GENERATE CLOUDINARY DELIVERY URL
    // =============================================
    //
    // IMPORTANT:
    //
    // Cloudinary has different delivery paths:
    //
    // image -> /image/upload/
    // video -> /video/upload/
    // raw   -> /raw/upload/
    //
    // This is the key difference between
    // images and files such as:
    //
    // PDF
    // DOC
    // DOCX
    // XLS
    // XLSX
    // PPT
    // PPTX
    // ZIP
    // RAR
    // 7Z
    // TXT
    // RTF
    //
    const downloadUrl = cloudinary.url(record.cloudinaryPublicId, {
      resource_type: resourceType,

      type: "upload",

      secure: true,

      // Force browser download
      flags: "attachment",

      // Keep original extension when
      // Cloudinary URL needs it.
      format: record.fileExtension
        ? record.fileExtension.replace(".", "")
        : undefined,
    });

    console.log("Generated Cloudinary Download URL:", {
      recordId: record._id.toString(),

      fileName: record.originalFileName,

      mimeType: record.documentType,

      extension: record.fileExtension,

      resourceType,

      publicId: record.cloudinaryPublicId,

      downloadUrl,
    });

    // =============================================
    // SET RESPONSE HEADERS
    // =============================================
    res.setHeader("Content-Type", contentType);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}"`,
    );

    res.setHeader(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate",
    );

    // =============================================
    // REDIRECT TO CLOUDINARY
    // =============================================
    //
    // Browser will download the file directly
    // from Cloudinary.
    //
    return res.redirect(downloadUrl);
  } catch (error) {
    console.error("Download Document Error:", error);

    // =============================================
    // GENERAL ERROR
    // =============================================
    if (!res.headersSent) {
      return res.status(500).json({
        message: "Server error while downloading document.",
      });
    }
  }
};

// =============================================
// EXPORT
// =============================================
module.exports = {
  submitRecord,
  searchRecord,
  getAvailableYears,
  downloadDocument,
  deleteRecord,
};
