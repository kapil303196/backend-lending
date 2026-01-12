const emailService = require("../services/emailService");

/**
 * Controller for dummy/test endpoints
 */
const sendMarketingEmail = async (req, res) => {
  try {
    const { to, uniqueId } = req.body;
    if (!to || !uniqueId) {
      return res
        .status(400)
        .json({ success: false, message: "to and uniqueId are required" });
    }

    const result = await emailService.sendMarketingTemplateEmail(to, uniqueId);
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
