const LenderEmail = require('../models/LenderEmail');
const UserResponse = require('../models/UserResponse');
const pdfService = require('../services/pdfService');
const emailService = require('../services/emailService');

// Create a new lender email
exports.createLenderEmail = async (req, res) => {
  try {
    const { name, email, description } = req.body;
    
    const newLender = await LenderEmail.create({
      name,
      email,
      description,
      createdBy: req.user.id
    });
    
    res.status(201).json({
      success: true,
      data: newLender
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get all lender emails
exports.getAllLenderEmails = async (req, res) => {
  try {
    // Only return lenders created by the logged-in admin
    const lenders = await LenderEmail.find({ 
      isActive: true,
      createdBy: req.user.id 
    }).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: lenders
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update a lender email
exports.updateLenderEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, description } = req.body;
    
    // Find lender ensuring it belongs to the current user
    const lender = await LenderEmail.findOne({ _id: id, createdBy: req.user.id });
    
    if (!lender) {
      return res.status(404).json({
        success: false,
        message: 'Lender not found'
      });
    }
    
    lender.name = name || lender.name;
    lender.email = email || lender.email;
    lender.description = description !== undefined ? description : lender.description;
    
    await lender.save();
    
    res.status(200).json({
      success: true,
      data: lender,
      message: 'Lender updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete a lender email (soft delete)
exports.deleteLenderEmail = async (req, res) => {
  try {
    const { id } = req.params;
    
    const lender = await LenderEmail.findOneAndUpdate(
      { _id: id, createdBy: req.user.id },
      { isActive: false },
      { new: true }
    );
    
    if (!lender) {
      return res.status(404).json({
        success: false,
        message: 'Lender not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Lender email deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Send application to lender(s)
exports.sendApplicationToLender = async (req, res) => {
  try {
    const { responseId, lenderEmailIds } = req.body;
    
    // Validate inputs
    if (!responseId) {
      return res.status(400).json({ success: false, message: 'Response ID is required' });
    }
    
    // Ensure lenderEmailIds is an array
    const lenderIds = Array.isArray(lenderEmailIds) ? lenderEmailIds : [lenderEmailIds];
    
    if (lenderIds.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one lender must be selected' });
    }
    
    // 1. Fetch User Response once
    const userResponse = await UserResponse.findById(responseId).populate('mcaId');
    if (!userResponse) {
      return res.status(404).json({ success: false, message: 'User response not found' });
    }
    
    // Get MCA data (might be null if not linked)
    const mcaData = userResponse.mcaId ? userResponse.mcaId.toObject() : {};
    
    // Get form data from user response
    const formData = userResponse.formData || {};
    if (!formData.uniqueId) {
      formData.uniqueId = userResponse.uniqueId;
    }
    
    // 2. Generate PDF Buffer once
    const pdfBuffer = await pdfService.generateFilledPDF(mcaData, formData, {
      maskSSN: false // Assuming full SSN is needed for lenders
    });
    
    const filename = pdfService.generatePDFFilename(mcaData, formData);

    // Prepare Base Attachments (Application PDF)
    const attachments = [{
        content: pdfBuffer,
        filename: filename,
        type: 'application/pdf',
        disposition: 'attachment'
    }];

    // Process Signature for Inline Display (CID)
    let signatureForEmail = null;
    if (formData.signature && formData.signature.startsWith('data:image')) {
        try {
            const matches = formData.signature.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const imageType = matches[1];
                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, 'base64');
                
                attachments.push({
                    content: buffer,
                    filename: 'signature.png',
                    type: imageType, // e.g., image/png
                    disposition: 'inline',
                    content_id: 'signature_img'
                });
                // Set the src to the CID reference
                signatureForEmail = 'cid:signature_img';
            }
        } catch (e) {
            console.error('Error processing signature image:', e);
        }
    }

    // 3. Fetch and attach Bank Statements
    if (userResponse.bankStatements && userResponse.bankStatements.length > 0) {
        const axios = require('axios'); // Ensure axios is available
        
        for (const statement of userResponse.bankStatements) {
            if (statement.url) {
                try {
                    const response = await axios.get(statement.url, { responseType: 'arraybuffer' });
                    const buffer = Buffer.from(response.data);
                    
                    attachments.push({
                        content: buffer,
                        filename: statement.originalName || `BankStatement_${statement._id}.pdf`,
                        type: 'application/pdf', // Assuming mostly PDFs, or detect from url/name
                        disposition: 'attachment'
                    });
                    console.log(`Fetched bank statement: ${statement.originalName}`);
                } catch (err) {
                    console.error(`Failed to download bank statement ${statement.url}:`, err.message);
                    // Continue without this attachment if it fails
                }
            }
        }
    }
    
    // Helper to format dates (MM/DD/YYYY)
    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        // Handle YYYY-MM-DD
        if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = dateStr.split('-');
            return `${month}/${day}/${year}`;
        }
        // Handle ISO strings
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    };

    // 4. Send to each lender
    const results = [];
    
    for (const lenderId of lenderIds) {
      try {
        // Ensure we only send to lenders owned by this admin
        const lender = await LenderEmail.findOne({ _id: lenderId, createdBy: req.user.id });
        if (lender) {
            await emailService.sendLenderApplication(
            lender,
            {
                // Core Identifiers
                businessName: formData.legalBusinessName || 'FundDirect Application',
                uniqueId: userResponse.uniqueId,
                status: userResponse.status,
                submittedAt: new Date(userResponse.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' }),
                ipAddress: userResponse.ipAddress,

                // Business Info
                legalBusinessName: formData.legalBusinessName,
                businessEmail: formData.businessEmail,
                ein: formData.ein,
                businessStartDate: formatDate(formData.businessStartDate),
                streetAddress: formData.streetAddress,
                city: formData.city,
                state: formData.state,
                zipCode: formData.zipCode,
                monthlyRevenue: formData.monthlyRevenue,
                
                // Owner Info
                ownerFirstName: formData.firstName,
                ownerLastName: formData.lastName,
                ownerEmail: formData.ownerEmail,
                ownerPhone: formData.phone,
                ownerDateOfBirth: formatDate(formData.dateOfBirth),
                ownerSSN: formData.ssn,
                ownershipPercent: formData.ownershipPercent,
                numberOfOwners: formData.numberOfOwners,
                ownerStreetAddress: formData.ownerStreetAddress,
                ownerCity: formData.ownerCity,
                ownerState: formData.ownerState,
                ownerZip: formData.ownerZip,

                // Funding Info
                amountRequested: formData.amountRequested,
                useOfFunds: formData.useOfFunds,
                hasExistingBalances: formData.hasExistingBalances,
                fundDirectSpecialist: formData.fundDirectSpecialist,
                existingFunders: formData.existingFunders, // Array of objects

                // Contact Info
                contactName: userResponse.userContact?.name,
                contactEmail: userResponse.userContact?.email,
                contactPhone: userResponse.userContact?.phone,

                // Signature
                signature: signatureForEmail, // CID reference or null
                signatureDate: formData.signatureDate
            },
            attachments
            );
            results.push({ lender: lender.name, status: 'sent' });
        } else {
            results.push({ lenderId, status: 'not_found' });
        }
      } catch (err) {
        console.error(`Failed to send to lender ${lenderId}:`, err);
        results.push({ lenderId, status: 'failed', error: err.message });
      }
    }
    
    res.json({ 
        success: true, 
        message: `Application processed for ${results.length} lenders`,
        results 
    });
    
  } catch (error) {
    console.error('Error sending application to lender:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send email',
      error: error.message
    });
  }
};
