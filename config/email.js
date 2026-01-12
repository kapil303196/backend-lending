module.exports = {
  // SendGrid API Key (Keep this in env for security)
  sendGridApiKey: process.env.SENDGRID_API_KEY,

  // Template IDs - Copy these from your SendGrid Dashboard
  templates: {
    welcome: "d-31bf81d34eb642d990abb07aaace636b", // Replace with your Welcome Email Template ID
    applicationConfirmation: "d-6d48ccab80fa449086547b424e2980aa", // Replace with your Application Received Template ID
    statusUpdate: "d-381bb7bcb93e4a6a8935f37538000f16", // Replace with your Status Update Template ID
    lenderApplication: "d-9ef558ddb40941238d8045db6e16e57b", // Replace with your Lender Application Template ID
    marketingTemplate: "d-c0c0d3f3ae334c6cbe48657f2af334f1", // Replace with your Marketing Template ID
  },

  // Default Sender Identity
  from: {
    email: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    name: process.env.EMAIL_FROM_NAME || "Heroic Funding",
  },
};
