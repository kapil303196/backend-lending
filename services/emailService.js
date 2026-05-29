const nodemailer = require("nodemailer");
const sgMail = require("@sendgrid/mail");
const emailConfig = require("../config/email");

/**
 * Production-ready Email Service (SendGrid + Gmail Fallback)
 * Implements retry logic, error handling, and email templates
 */

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    this.useSendGrid = false;
    this.fromEmail = emailConfig.from.email;
    this.fromName = emailConfig.from.name;
    this.templateIds = emailConfig.templates || {};
  }

  /**
   * Initialize Email Service (SendGrid with Gmail Fallback)
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // 1. Try Initialize SendGrid
      // 1. Try Initialize SendGrid
      if (emailConfig.sendGridApiKey) {
        sgMail.setApiKey(emailConfig.sendGridApiKey);
        this.useSendGrid = true;
        this.initialized = true;
        this.templateIds = emailConfig.templates;
        console.log("✅ Email service initialized successfully with SendGrid");
        return;
      }

      // 2. Fallback to Gmail/Nodemailer
      const {
        EMAIL_USER,
        GMAIL_CLIENT_ID,
        GMAIL_CLIENT_SECRET,
        GMAIL_REFRESH_TOKEN,
      } = process.env;

      // Check if OAuth2 credentials are provided
      if (
        GMAIL_CLIENT_ID &&
        GMAIL_CLIENT_SECRET &&
        GMAIL_REFRESH_TOKEN &&
        EMAIL_USER
      ) {
        // Use OAuth2 with refresh token (recommended for production)
        this.transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            type: "OAuth2",
            user: EMAIL_USER,
            clientId: GMAIL_CLIENT_ID,
            clientSecret: GMAIL_CLIENT_SECRET,
            refreshToken: GMAIL_REFRESH_TOKEN,
            accessToken: undefined, // Will be generated automatically
          },
          // Connection settings optimized for serverless (Vercel)
          connectionTimeout: 10000, // 10 seconds
          greetingTimeout: 10000, // 10 seconds
          socketTimeout: 10000, // 10 seconds
          // Disable pooling for serverless environments
          pool: false,
          // Retry settings
          retry: {
            attempts: 2,
            delay: 1000,
          },
        });

        console.log("🔐 Using Gmail OAuth2 with refresh token");
      } else if (process.env.EMAIL_PASSWORD && EMAIL_USER) {
        // Fallback to App Password (for development)
        this.transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
          },
          // Connection settings optimized for serverless (Vercel)
          connectionTimeout: 10000, // 10 seconds
          greetingTimeout: 10000, // 10 seconds
          socketTimeout: 10000, // 10 seconds
          // Disable pooling for serverless environments
          pool: false,
          // Retry settings
          retry: {
            attempts: 2,
            delay: 1000,
          },
        });

        console.log("🔑 Using Gmail App Password (fallback)");
      } else {
        throw new Error(
          "Email credentials not configured. Set SENDGRID_API_KEY or Gmail credentials in .env"
        );
      }

      // Verify transporter configuration with timeout
      // Skip verification in serverless environments (Vercel) to avoid timeout issues
      const isServerless =
        process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

      if (!isServerless && this.transporter) {
        try {
          // Set a timeout for verification (5 seconds)
          const verifyPromise = this.transporter.verify();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Verification timeout")), 5000)
          );

          await Promise.race([verifyPromise, timeoutPromise]);
          console.log("✅ Email service verified successfully (Nodemailer)");
        } catch (verifyError) {
          console.warn(
            "⚠️  Email service verification failed (will still attempt to send):",
            verifyError.message
          );
          // Don't throw - allow sending emails even if verification fails
        }
      } else {
        console.log(
          "⚠️  Skipping email verification in serverless environment"
        );
      }

      this.initialized = true;
      console.log("✅ Email service initialized successfully with Gmail");
    } catch (error) {
      console.error("❌ Email service initialization failed:", error.message);
      // In serverless, don't throw - allow the service to be used anyway
      // The actual send will handle errors
      if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
        throw new Error(
          `Email service initialization failed: ${error.message}`
        );
      } else {
        console.warn(
          "⚠️  Continuing in serverless mode despite initialization warning"
        );
        this.initialized = true; // Mark as initialized anyway
      }
    }
  }

  /**
   * Send email with retry logic
   * @param {Object} options - Email options
   * @param {number} retries - Number of retry attempts
   */
  async sendEmail(options, retries = 3) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
    } catch (initError) {
      // If initialization fails, log but don't throw - try to send anyway
      console.warn(
        "⚠️  Email service initialization had issues, attempting to send anyway:",
        initError.message
      );
    }

    if (this.useSendGrid) {
      return this.sendWithSendGrid(options, retries);
    } else {
      return this.sendWithNodemailer(options, retries);
    }
  }

  /**
   * Send marketing email using SendGrid template
   */
  async sendMarketingTemplateEmail(to, uniqueId) {
    const backendUrl =
      process.env.BACKEND_DEPLOYED_URL ||
      `http://localhost:${process.env.PORT || 5000}`;
    const frontendUrl =
      process.env.FRONTEND_DEPLOYED_URL || "http://localhost:8080";

    // Use SendGrid Dynamic Template if ID is available
    if (this.useSendGrid && this.templateIds.marketingTemplate) {
      console.log("✅ Using SendGrid Dynamic Template for marketing email");
      return await this.sendEmail({
        to: to,
        templateId: this.templateIds.marketingTemplate,
        dynamicTemplateData: {
          BACKEND_URL: backendUrl,
          FRONTEND_URL: frontendUrl,
          uniqueId: uniqueId,
          supportEmail: process.env.SUPPORT_EMAIL || "support@logicspark.com",
        },
      });
    }

    // Fallback to manual HTML if template ID is missing
    const fs = require("fs").promises;
    const path = require("path");
    const filePath = path.join(
      __dirname,
      "..",
      "files",
      "sendgrid-heroic-marketing.html"
    );
    let htmlContent = await fs.readFile(filePath, "utf8");

    htmlContent = htmlContent
      .replace(/{{BACKEND_URL}}/g, backendUrl)
      .replace(/{{FRONTEND_URL}}/g, frontendUrl)
      .replace(/{{uniqueId}}/g, uniqueId);

    return await this.sendEmail({
      to,
      subject: "Heroic Funding - Up to $10,000,000 for Your Business",
      html: htmlContent,
    });
  }

  /**
  /**
   * Send using SendGrid
   */
  async sendWithSendGrid(options, retries = 3) {
    // Transform attachments for SendGrid
    const attachments = (options.attachments || []).map((att) => {
      // If content is a Buffer, convert to base64
      let content = att.content;
      if (Buffer.isBuffer(content)) {
        content = content.toString("base64");
      } else if (typeof content === "string" && !this.isBase64(content)) {
        // Assume it's utf-8 text if string and not base64, encode it
        content = Buffer.from(content).toString("base64");
      }

      return {
        content: content,
        filename: att.filename,
        type: att.contentType || "application/octet-stream",
        disposition: att.disposition || "attachment",
        content_id: att.content_id,
      };
    });

    const msg = {
      to: options.to,
      from: {
        email: this.fromEmail,
        name: this.fromName,
      },
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    // Handle Dynamic Templates vs Standard HTML
    if (options.templateId) {
      msg.templateId = options.templateId;
      msg.dynamicTemplateData = options.dynamicTemplateData || {};
      // Note: Subject is usually defined in the template, but can be overridden if needed via dynamic data
    } else {
      msg.subject = options.subject;
      msg.text = options.text || this.stripHtml(options.html);
      msg.html = options.html;
    }

    if (options.cc) msg.cc = options.cc;
    if (options.bcc) msg.bcc = options.bcc;

    let lastError;
    // ... retry logic (kept same)
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await sgMail.send(msg);
        console.log(`✅ Email sent via SendGrid to ${options.to}`);
        return {
          success: true,
          messageId: response[0].headers["x-message-id"],
          response: response[0],
        };
      } catch (error) {
        lastError = error;
        console.error(
          `❌ SendGrid send attempt ${attempt}/${retries} failed:`,
          error.message
        );
        if (error.response) {
          console.error(error.response.body);
        }

        if (attempt < retries) {
          const waitTime = Math.min(Math.pow(2, attempt) * 1000, 5000);
          await this.sleep(waitTime);
        }
      }
    }
    throw lastError;
  }

  isBase64(str) {
    if (str === "" || str.trim() === "") {
      return false;
    }
    try {
      return btoa(atob(str)) == str;
    } catch (err) {
      return false;
    }
  }

  /**
   * Send using Nodemailer (Legacy/Fallback)
   */
  async sendWithNodemailer(options, retries = 3) {
    // Check if transporter exists
    if (!this.transporter) {
      throw new Error(
        "Email transporter not available. Please check your email configuration."
      );
    }

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || this.stripHtml(options.html),
      attachments: options.attachments || [],
    };

    // Add CC and BCC if provided
    if (options.cc) mailOptions.cc = options.cc;
    if (options.bcc) mailOptions.bcc = options.bcc;

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Add timeout wrapper for serverless environments
        const sendPromise = this.transporter.sendMail(mailOptions);
        const timeoutPromise = new Promise(
          (_, reject) =>
            setTimeout(() => reject(new Error("Email send timeout")), 15000) // 15 second timeout
        );

        const info = await Promise.race([sendPromise, timeoutPromise]);
        console.log(
          `✅ Email sent successfully to ${options.to} (Attempt ${attempt}/${retries})`
        );
        console.log(`Message ID: ${info.messageId}`);

        return {
          success: true,
          messageId: info.messageId,
          response: info.response,
        };
      } catch (error) {
        lastError = error;
        console.error(
          `❌ Email send attempt ${attempt}/${retries} failed:`,
          error.message
        );

        // If it's a connection error and we're in serverless, try to reinitialize
        if (
          (error.message.includes("socket") ||
            error.message.includes("TLS") ||
            error.message.includes("connection")) &&
          (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) &&
          attempt < retries
        ) {
          console.log(
            "🔄 Connection error detected, reinitializing transporter..."
          );
          this.initialized = false;
          try {
            await this.initialize();
          } catch (reinitError) {
            console.warn("⚠️  Reinitialization failed:", reinitError.message);
          }
        }

        if (attempt < retries) {
          // Exponential backoff: wait 2^attempt seconds (max 5 seconds)
          const waitTime = Math.min(Math.pow(2, attempt) * 1000, 5000);
          console.log(`⏳ Retrying in ${waitTime / 1000} seconds...`);
          await this.sleep(waitTime);
        }
      }
    }

    // All retries failed
    console.error(
      `❌ Failed to send email to ${options.to} after ${retries} attempts`
    );
    throw lastError;
  }

  /**
   * Send welcome email with credentials
   */
  async sendWelcomeEmail(userEmail, userData) {
    const { name, email, password, uniqueId } = userData;

    // Use SendGrid Dynamic Template if ID is available
    if (this.useSendGrid && this.templateIds.welcome) {
      return await this.sendEmail({
        to: userEmail,
        templateId: this.templateIds.welcome,
        dynamicTemplateData: {
          name: name || "Valued Customer",
          email: email,
          password: password,
          uniqueId: uniqueId,
          loginUrl: process.env.FRONTEND_URL || "https://your-app.com/login",
          supportEmail: process.env.SUPPORT_EMAIL || "support@logicspark.com",
        },
      });
    }

    // Fallback to HTML Template
    const html = this.getWelcomeEmailTemplate({
      name: name || "Valued Customer",
      email: email,
      password: password,
      uniqueId: uniqueId,
      loginUrl: process.env.FRONTEND_URL || "https://your-app.com/login",
      supportEmail: process.env.SUPPORT_EMAIL || "support@logicspark.com",
    });

    return await this.sendEmail({
      to: userEmail,
      subject: "🎉 Welcome to Heroic Funding - Your Account Details",
      html: html,
    });
  }

  /**
   * Send admin notification on successful form submission
   * @param {Object} response - The UserResponse document or object
   */
  async sendAdminUserResponseNotification(response) {
    const adminEmailsStr = process.env.ADMIN_EMAILS || "camerongroom@gmail.com,josh@palisadesadvance.com";
    const adminEmails = adminEmailsStr.split(",").map(e => e.trim()).filter(Boolean);

    if (adminEmails.length === 0) {
      console.warn("⚠️ No admin emails configured in .env (ADMIN_EMAILS)");
      return;
    }

    const { uniqueId, formData, bankStatements, submittedAt, ipAddress, userAgent } = response;
    const submissionDate = submittedAt ? new Date(submittedAt).toLocaleString() : new Date().toLocaleString();

    // 1. If SendGrid is active and template ID is set
    if (this.useSendGrid && this.templateIds.adminUserResponseTemplate) {
      console.log("✅ Using SendGrid Dynamic Template for admin notification email");
      
      const sendPromises = adminEmails.map(adminEmail => {
        return this.sendEmail({
          to: adminEmail,
          templateId: this.templateIds.adminUserResponseTemplate,
          dynamicTemplateData: {
            uniqueId,
            formData: {
              ...formData,
              hasExistingBalances: formData.hasExistingBalances === 'yes' || formData.hasExistingBalances === true,
            },
            bankStatements: bankStatements || [],
            submittedAt: submissionDate,
            ipAddress: ipAddress || "N/A",
            userAgent: userAgent || "N/A",
            currentYear: new Date().getFullYear()
          }
        });
      });

      return Promise.all(sendPromises);
    }

    // 2. Fallback: Read and render html file manually
    try {
      const fs = require("fs").promises;
      const path = require("path");
      const filePath = path.join(__dirname, "..", "files", "sendgrid-admin-user-response-template.html");
      let htmlContent = await fs.readFile(filePath, "utf8");

      // Replace simple string placeholders
      const data = {
        uniqueId: uniqueId || "",
        "formData.amountRequested": formData.amountRequested || "N/A",
        "formData.monthlyRevenue": formData.monthlyRevenue || "N/A",
        "formData.legalBusinessName": formData.legalBusinessName || "N/A",
        "formData.dba": formData.dba || "",
        "formData.businessEmail": formData.businessEmail || "N/A",
        "formData.ein": formData.ein || "N/A",
        "formData.businessStartDate": formData.businessStartDate || "N/A",
        "formData.streetAddress": formData.streetAddress || "N/A",
        "formData.city": formData.city || "",
        "formData.state": formData.state || "",
        "formData.zipCode": formData.zipCode || "",
        "formData.firstName": formData.firstName || "",
        "formData.lastName": formData.lastName || "",
        "formData.ownerEmail": formData.ownerEmail || "N/A",
        "formData.phone": formData.phone || "N/A",
        "formData.dateOfBirth": formData.dateOfBirth || "N/A",
        "formData.ssn": formData.ssn || "",
        "formData.ownershipPercent": formData.ownershipPercent || "",
        "formData.ownerStreetAddress": formData.ownerStreetAddress || "",
        "formData.ownerCity": formData.ownerCity || "",
        "formData.ownerState": formData.ownerState || "",
        "formData.ownerZip": formData.ownerZip || "",
        submittedAt: submissionDate,
        ipAddress: ipAddress || "N/A",
        userAgent: userAgent || "N/A",
        currentYear: new Date().getFullYear().toString()
      };

      // Handle simple text replaces
      for (const [key, val] of Object.entries(data)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
        htmlContent = htmlContent.replace(regex, val);
      }

      // Handle custom simple sections/conditionals
      // DBA Conditional
      if (formData.dba) {
        htmlContent = htmlContent
          .replace(/{{\s*#if\s+formData\.dba\s*}}([\s\S]*?){{\s*\/if\s*}}/, "$1");
      } else {
        htmlContent = htmlContent
          .replace(/{{\s*#if\s+formData\.dba\s*}}([\s\S]*?){{\s*\/if\s*}}/, "");
      }

      // SSN Conditional
      if (formData.ssn) {
        htmlContent = htmlContent
          .replace(/{{\s*#if\s+formData\.ssn\s*}}([\s\S]*?){{\s*\/if\s*}}/, "$1");
      } else {
        htmlContent = htmlContent
          .replace(/{{\s*#if\s+formData\.ssn\s*}}([\s\S]*?){{\s*\/if\s*}}/, "");
      }

      // Ownership % Conditional
      if (formData.ownershipPercent) {
        htmlContent = htmlContent
          .replace(/{{\s*#if\s+formData\.ownershipPercent\s*}}([\s\S]*?){{\s*\/if\s*}}/, "$1");
      } else {
        htmlContent = htmlContent
          .replace(/{{\s*#if\s+formData\.ownershipPercent\s*}}([\s\S]*?){{\s*\/if\s*}}/, "");
      }

      // Existing Balances Conditional
      const hasBalances = formData.hasExistingBalances === 'yes' || formData.hasExistingBalances === true;
      if (hasBalances) {
        htmlContent = htmlContent
          .replace(/{{\s*#if\s+formData\.hasExistingBalances\s*}}([\s\S]*?){{\s*\/else\s*}}([\s\S]*?){{\s*\/if\s*}}/, "$1");
      } else {
        htmlContent = htmlContent
          .replace(/{{\s*#if\s+formData\.hasExistingBalances\s*}}([\s\S]*?){{\s*\/else\s*}}([\s\S]*?){{\s*\/if\s*}}/, "$2");
      }

      // Existing Funders
      if (hasBalances && formData.existingFunders && formData.existingFunders.length > 0) {
        const fundersHtml = formData.existingFunders.map(f => `<li>${f}</li>`).join("");
        htmlContent = htmlContent
          .replace(/{{\s*#if\s+formData\.existingFunders\s*}}([\s\S]*?){{\s*\/if\s*}}/, `<ul>${fundersHtml}</ul>`);
      } else {
        htmlContent = htmlContent
          .replace(/{{\s*#if\s+formData\.existingFunders\s*}}([\s\S]*?){{\s*\/if\s*}}/, "Not specified");
      }

      // Bank Statements
      if (bankStatements && bankStatements.length > 0) {
        const statementsHtml = bankStatements.map(file => `
          <div class="bank-statement-item">
            <span class="bank-statement-icon">📄</span>
            <div class="bank-statement-details">
              <div class="bank-statement-name">${file.originalName || "Statement"}</div>
            </div>
            <a href="${file.url}" class="bank-statement-link" target="_blank">Download</a>
          </div>
        `).join("");

        htmlContent = htmlContent
          .replace(/{{\s*#if\s+bankStatements\s*}}([\s\S]*?){{\s*\/else\s*}}([\s\S]*?){{\s*\/if\s*}}/, statementsHtml);
      } else {
        const noStatementsHtml = `<p style="color: #64748b; font-size: 14px; margin-bottom: 20px; font-style: italic;">No bank statements uploaded with this submission.</p>`;
        htmlContent = htmlContent
          .replace(/{{\s*#if\s+bankStatements\s*}}([\s\S]*?){{\s*\/else\s*}}([\s\S]*?){{\s*\/if\s*}}/, noStatementsHtml);
      }

      // Send to all administrators
      const sendPromises = adminEmails.map(adminEmail => {
        return this.sendEmail({
          to: adminEmail,
          subject: `🔔 New MCA Application Submitted: ${formData.legalBusinessName || "Business"}`,
          html: htmlContent
        });
      });

      return Promise.all(sendPromises);
    } catch (err) {
      console.error("❌ Failed to render and send admin notification email fallback:", err);
      // Try plain text fallback if HTML template read failed
      const plainText = `
        New MCA Application Submitted!
        Unique ID: ${uniqueId}
        Business Name: ${formData.legalBusinessName}
        Owner Name: ${formData.firstName} ${formData.lastName}
        Email: ${formData.businessEmail}
        Phone: ${formData.phone}
        Amount Requested: ${formData.amountRequested}
        Monthly Revenue: ${formData.monthlyRevenue}
        Submitted At: ${submissionDate}
      `;

      const sendPromises = adminEmails.map(adminEmail => {
        return this.sendEmail({
          to: adminEmail,
          subject: `🔔 New MCA Application Submitted: ${formData.legalBusinessName || "Business"}`,
          text: plainText
        });
      });

      return Promise.all(sendPromises);
    }
  }


  /**
   * Send application submission confirmation
   */
  async sendApplicationConfirmation(userEmail, applicationData) {
    const { name, uniqueId, amountRequested, submittedAt } = applicationData;

    // Use SendGrid Dynamic Template if ID is available
    if (this.useSendGrid && this.templateIds.applicationConfirmation) {
      return await this.sendEmail({
        to: userEmail,
        templateId: this.templateIds.applicationConfirmation,
        dynamicTemplateData: {
          name: name || "Valued Customer",
          uniqueId: uniqueId,
          amountRequested: amountRequested
            ? `$${amountRequested.toLocaleString()}`
            : "N/A",
          submittedAt: new Date(submittedAt || Date.now()).toLocaleDateString(),
          dashboardUrl:
            process.env.FRONTEND_URL || "https://your-app.com/dashboard",
          supportEmail: process.env.SUPPORT_EMAIL || "support@logicspark.com",
        },
      });
    }

    const html = this.getApplicationConfirmationTemplate({
      name: name || "Valued Customer",
      uniqueId: uniqueId,
      amountRequested: amountRequested,
      submittedAt: submittedAt || new Date(),
      dashboardUrl:
        process.env.FRONTEND_URL || "https://your-app.com/dashboard",
      supportEmail: process.env.SUPPORT_EMAIL || "support@logicspark.com",
    });

    return await this.sendEmail({
      to: userEmail,
      subject: "✅ Application Submitted Successfully - Heroic Funding",
      html: html,
    });
  }

  /**
   * Send status update email
   */
  async sendStatusUpdateEmail(userEmail, statusData) {
    const { name, uniqueId, status, message } = statusData;

    // Use SendGrid Dynamic Template if ID is available
    if (this.useSendGrid && this.templateIds.statusUpdate) {
      return await this.sendEmail({
        to: userEmail,
        templateId: this.templateIds.statusUpdate,
        dynamicTemplateData: {
          name: name || "Valued Customer",
          uniqueId: uniqueId,
          status: status.toUpperCase(),
          message: message,
          dashboardUrl:
            process.env.FRONTEND_URL || "https://your-app.com/dashboard",
          supportEmail: process.env.SUPPORT_EMAIL || "support@logicspark.com",
        },
      });
    }

    const html = this.getStatusUpdateTemplate({
      name: name || "Valued Customer",
      uniqueId: uniqueId,
      status: status,
      message: message,
      dashboardUrl:
        process.env.FRONTEND_URL || "https://your-app.com/dashboard",
      supportEmail: process.env.SUPPORT_EMAIL || "support@logicspark.com",
    });

    const statusEmojis = {
      approved: "✅",
      rejected: "❌",
      pending: "⏳",
      submitted: "📝",
    };

    return await this.sendEmail({
      to: userEmail,
      subject: `${
        statusEmojis[status] || "📧"
      } Application Status Update - ${status.toUpperCase()}`,
      html: html,
    });
  }

  /**
   * Send application to lender
   */
  /**
   * Send application to lender
   */
  async sendLenderApplication(lender, applicationData, attachments = []) {
    const { email, name: lenderName } = lender;
    const { businessName, uniqueId } = applicationData;

    // Use SendGrid Dynamic Template if ID is available
    if (this.useSendGrid && this.templateIds.lenderApplication) {
      return await this.sendEmail({
        to: email,
        templateId: this.templateIds.lenderApplication,
        dynamicTemplateData: {
          lenderName: lenderName || "Lender",
          date: new Date().toLocaleDateString(),
          supportEmail: process.env.SUPPORT_EMAIL || "support@logicspark.com",
          ...applicationData,
        },
        attachments: attachments,
      });
    }

    // Fallback HTML for Lender
    const html = `
      <h2>New Application: ${businessName}</h2>
      <p>Hello ${lenderName || "Lender"},</p>
      <p>Please find the attached application PDF and documents for <strong>${businessName}</strong> (ID: ${uniqueId}).</p>
      <p>Thank you.</p>
    `;

    return await this.sendEmail({
      to: email,
      subject: `New Application: ${
        businessName || "Heroic Funding Application"
      }`,
      html: html,
      attachments: attachments,
    });
  }

  /**
   * Welcome Email Template
   */
  getWelcomeEmailTemplate(data) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Heroic Funding</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 28px; margin-bottom: 10px; }
        .header p { color: #e0e7ff; font-size: 16px; }
        .content { padding: 40px 30px; }
        .welcome-box { background-color: #f8f9ff; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .credentials-box { background-color: #fff; border: 2px solid #667eea; padding: 25px; margin: 25px 0; border-radius: 8px; }
        .credentials-box h3 { color: #667eea; margin-bottom: 15px; font-size: 18px; }
        .credential-item { margin: 12px 0; padding: 12px; background-color: #f8f9ff; border-radius: 4px; }
        .credential-label { font-weight: 600; color: #555; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .credential-value { font-size: 16px; color: #333; margin-top: 4px; font-family: 'Courier New', monospace; }
        .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; text-align: center; }
        .button:hover { opacity: 0.9; }
        .security-notice { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .security-notice strong { color: #856404; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; color: #6c757d; font-size: 14px; }
        .footer a { color: #667eea; text-decoration: none; }
        .divider { height: 1px; background-color: #e0e0e0; margin: 30px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to Heroic Funding</h1>
            <p>Your account has been created successfully</p>
        </div>
        
        <div class="content">
            <div class="welcome-box">
                <p>Hello <strong>${data.name}</strong>,</p>
                <p style="margin-top: 10px;">Thank you for choosing Heroic Funding. We're excited to have you on board! Your account has been created and you can now access our platform.</p>
            </div>

            <div class="credentials-box">
                <h3>🔐 Your Login Credentials</h3>
                <div class="credential-item">
                    <div class="credential-label">Email Address</div>
                    <div class="credential-value">${data.email}</div>
                </div>
                <div class="credential-item">
                    <div class="credential-label">Temporary Password</div>
                    <div class="credential-value">${data.password}</div>
                </div>
                <div class="credential-item">
                    <div class="credential-label">Application ID</div>
                    <div class="credential-value">${data.uniqueId}</div>
                </div>
            </div>

            <div class="security-notice">
                <strong>⚠️ Security Notice:</strong> For your security, please change your password after your first login. Keep your credentials confidential and never share them with anyone.
            </div>

            <div style="text-align: center;">
                <a href="${
                  data.loginUrl
                }" class="button">Login to Your Account</a>
            </div>

            <div class="divider"></div>
        </div>

        <div class="footer">
            <p style="margin-top: 20px; font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} Heroic Funding. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Application Confirmation Email Template
   */
  getApplicationConfirmationTemplate(data) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Application Submitted</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 28px; margin-bottom: 10px; }
        .header p { color: #d1fae5; font-size: 16px; }
        .content { padding: 40px 30px; }
        .success-icon { text-align: center; font-size: 64px; margin: 20px 0; }
        .info-box { background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .detail-item { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
        .detail-label { font-weight: 600; color: #555; }
        .detail-value { color: #333; }
        .button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; color: #6c757d; font-size: 14px; }
        .footer a { color: #10b981; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Application Submitted</h1>
            <p>We've received your application</p>
        </div>
        
        <div class="content">
            <div class="success-icon">🎉</div>
            
            <div class="info-box">
                <p>Hello <strong>${data.name}</strong>,</p>
                <p style="margin-top: 10px;">Your MCA application has been successfully submitted. Our team will review your application and get back to you shortly.</p>
            </div>

            <h3 style="color: #10b981; margin: 25px 0 15px;">Application Details</h3>
            <div style="background-color: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
                <div class="detail-item">
                    <span class="detail-label">Application ID:</span>
                    <span class="detail-value">${data.uniqueId}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Amount Requested:</span>
                    <span class="detail-value">$${
                      data.amountRequested
                        ? data.amountRequested.toLocaleString()
                        : "N/A"
                    }</span>
                </div>
                <div class="detail-item" style="border-bottom: none;">
                    <span class="detail-label">Submitted On:</span>
                    <span class="detail-value">${new Date(
                      data.submittedAt
                    ).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}</span>
                </div>
            </div>

            <div style="text-align: center;">
                <a href="${
                  data.dashboardUrl
                }" class="button">Track Application Status</a>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">
                Need help? Contact us at <a href="mailto:${
                  data.supportEmail
                }" style="color: #10b981;">${data.supportEmail}</a>
            </p>
        </div>

        <div class="footer">
            <p><strong>Heroic Funding</strong></p>
            <p style="margin-top: 10px; font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} Heroic Funding. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Status Update Email Template
   */
  getStatusUpdateTemplate(data) {
    const statusColors = {
      approved: { bg: "#10b981", light: "#d1fae5", text: "#065f46" },
      rejected: { bg: "#ef4444", light: "#fee2e2", text: "#991b1b" },
      pending: { bg: "#f59e0b", light: "#fef3c7", text: "#92400e" },
      submitted: { bg: "#3b82f6", light: "#dbeafe", text: "#1e40af" },
    };

    const color = statusColors[data.status] || statusColors.pending;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Status Update</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: ${
          color.bg
        }; padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; font-size: 28px; margin-bottom: 10px; }
        .content { padding: 40px 30px; }
        .status-badge { display: inline-block; padding: 8px 16px; background-color: ${
          color.light
        }; color: ${
      color.text
    }; border-radius: 20px; font-weight: 600; text-transform: uppercase; font-size: 14px; }
        .info-box { background-color: ${color.light}; border-left: 4px solid ${
      color.bg
    }; padding: 20px; margin: 20px 0; border-radius: 4px; }
        .button { display: inline-block; padding: 14px 32px; background: ${
          color.bg
        }; color: #ffffff; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
        .footer { background-color: #f8f9fa; padding: 30px; text-align: center; color: #6c757d; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Application Status Update</h1>
        </div>
        
        <div class="content">
            <p>Hello <strong>${data.name}</strong>,</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <span class="status-badge">${data.status}</span>
            </div>

            <div class="info-box">
                <p><strong>Application ID:</strong> ${data.uniqueId}</p>
                ${
                  data.message
                    ? `<p style="margin-top: 15px;">${data.message}</p>`
                    : ""
                }
            </div>

            <div style="text-align: center;">
                <a href="${data.dashboardUrl}" class="button">View Dashboard</a>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">
                Questions? Contact us at <a href="mailto:${
                  data.supportEmail
                }" style="color: ${color.bg};">${data.supportEmail}</a>
            </p>
        </div>

        <div class="footer">
            <p><strong>Heroic Funding</strong></p>
            <p style="margin-top: 10px; font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} Heroic Funding. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Strip HTML tags from string
   */
  stripHtml(html) {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Gracefully close email service
   */
  async close() {
    if (this.transporter) {
      this.transporter.close();
      this.initialized = false;
      console.log("Email service closed");
    }
  }
}

// Export singleton instance
module.exports = new EmailService();
