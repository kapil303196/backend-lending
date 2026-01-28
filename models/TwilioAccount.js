const mongoose = require("mongoose");

const phoneNumberSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true }, // E.164 format preferred
    label: { type: String, default: "" }, // e.g. "Sales Line", "Support Line"
    isPrimary: { type: Boolean, default: false }, // candidate for inbound routing
    isOutboundCallerId: { type: Boolean, default: true }, // can be used as callerId
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const twilioAccountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // human-friendly label

    // Core Twilio credentials
    accountSid: { type: String, required: true },
    authToken: { type: String, required: true },
    apiKey: { type: String, default: "" },
    apiSecret: { type: String, default: "" },

    // Numbers associated with this account
    phoneNumbers: {
      type: [phoneNumberSchema],
      default: [],
    },

    // Flags
    isDefault: { type: Boolean, default: false }, // used as global default if set

    // Recording behaviour toggles (account-specific)
    recordings: {
      enabled: { type: Boolean, default: true },
      recordInbound: { type: Boolean, default: true },
      recordOutbound: { type: Boolean, default: true },
    },

    // Optional shared secret used to validate webhook requests (account-specific)
    webhookSecret: { type: String, default: "" },
  },
  { timestamps: true }
);

/**
 * Ensure only one account is marked as default at a time.
 * Use async pre hook without `next` callback (Mongoose 6/7 style).
 */
twilioAccountSchema.pre("save", async function () {
  if (this.isModified("isDefault") && this.isDefault) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id }, isDefault: true },
      { $set: { isDefault: false } }
    );
  }
});

module.exports = mongoose.model("TwilioAccount", twilioAccountSchema);

