const emailService = require("../services/emailService");

/**
 * Controller for dummy/test endpoints
 */
const sendMarketingEmail = async (req, res) => {
  try {
    const { to, uniqueId } = req.body;
    if (!to) {
      return res
        .status(400)
        .json({ success: false, message: "to is required" });
    }

    // uniqueId is optional; when omitted the email links to the "new"
    // application route on the apply frontend.
    const result = await emailService.sendMarketingTemplateEmail(
      to,
      uniqueId || "new"
    );
    res.json(result);
  } catch (error) {
    console.error("Error sending marketing email:", error);
    res
      .status(500)
      .json({
        success: false,
        message: error.message || "Internal server error",
      });
  }
};

module.exports = {
  sendMarketingEmail,
};
