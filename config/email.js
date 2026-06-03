module.exports = {
  // SendGrid API Key (Keep this in env for security)
  sendGridApiKey: process.env.SENDGRID_API_KEY,

  // Template IDs - Copy these from your SendGrid Dashboard
  templates: {
    welcome: "d-56aed0359a1147dbbbffb12607337dad", // Replace with your Welcome Email Template ID
    applicationConfirmation: "d-a24bfa239b254012b79e34abc2f622e5", // Replace with your Application Received Template ID
    statusUpdate: "d-37ba4d884ea042b0ac175732f3b1f035", // Replace with your Status Update Template ID
    lenderApplication: "d-5e0119e8521c4a8ab8b8661afad7089f", // Replace with your Lender Application Template ID
    marketingTemplate: "d-ef27cac1b3674625a7be02102be7169c", // Replace with your Marketing Template ID
    adminUserResponseTemplate: "d-8c23a715b73e4f9a91960245ff1409b1"
  },

  // Default Sender Identity
  from: {
    email: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    name: process.env.EMAIL_FROM_NAME || "Heroic Funding",
  },
};
