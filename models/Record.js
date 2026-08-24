const mongoose = require("mongoose");

const recordSchema = new mongoose.Schema(
  {
    dairyNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    date: {
      type: Date,
      required: true,
    },

    document: {
      type: String,
      required: true,
    },

    originalFileName: {
      type: String,
      required: true,
    },

    documentType: {
      type: String,
      required: true,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Record", recordSchema);
