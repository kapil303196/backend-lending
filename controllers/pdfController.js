/**
 * PDF Controller
 * 
 * Handles PDF generation API endpoints for application forms.
 */

const MCA = require('../models/MCA');
const UserResponse = require('../models/UserResponse');
const pdfService = require('../services/pdfService');

/**
 * Generate filled PDF for a user response
 * 
 * @route GET /api/pdf/response/:responseId
 * @access Admin only
 */
exports.generateResponsePDF = async (req, res) => {
  try {
    const { responseId } = req.params;
    const { maskSSN = false } = req.query;
    
    // Find the user response
    const userResponse = await UserResponse.findById(responseId).populate('mcaId');
    
    if (!userResponse) {
      return res.status(404).json({
        success: false,
        message: 'User response not found'
      });
    }
    
    // Get MCA data (might be null if not linked)
    const mcaData = userResponse.mcaId ? userResponse.mcaId.toObject() : {};
    
    // Get form data from user response
    const formData = userResponse.formData || {};
    
    // Add uniqueId to formData if not present
    if (!formData.uniqueId) {
      formData.uniqueId = userResponse.uniqueId;
    }
    
    // Generate the PDF
    const pdfBuffer = await pdfService.generateFilledPDF(mcaData, formData, {
      maskSSN: maskSSN === 'true' || maskSSN === true
    });
    
    // Generate filename
    const filename = pdfService.generatePDFFilename(mcaData, formData);
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Send the PDF
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error generating PDF for response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: error.message
    });
  }
};

/**
 * Generate filled PDF for an MCA record
 * 
 * @route GET /api/pdf/mca/:mcaId
 * @access Admin only
 */
exports.generateMCAPDF = async (req, res) => {
  try {
    const { mcaId } = req.params;
    const { maskSSN = false } = req.query;
    
    // Find the MCA record
    const mca = await MCA.findByIdOrUniqueId(mcaId);
    
    if (!mca) {
      return res.status(404).json({
        success: false,
        message: 'MCA record not found'
      });
    }
    
    // Get MCA data
    const mcaData = mca.toObject();
    
    // Get the latest user response if available
    let formData = {};
    if (mca.userResponses && mca.userResponses.length > 0) {
      const latestResponse = await UserResponse.findById(
        mca.userResponses[mca.userResponses.length - 1]
      );
      if (latestResponse) {
        formData = latestResponse.formData || {};
        formData.uniqueId = latestResponse.uniqueId;
      }
    }
    
    // Generate the PDF
    const pdfBuffer = await pdfService.generateFilledPDF(mcaData, formData, {
      maskSSN: maskSSN === 'true' || maskSSN === true
    });
    
    // Generate filename
    const filename = pdfService.generatePDFFilename(mcaData, formData);
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Send the PDF
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error generating PDF for MCA:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: error.message
    });
  }
};

/**
 * Preview PDF (inline display instead of download)
 * 
 * @route GET /api/pdf/response/:responseId/preview
 * @access Admin only
 */
exports.previewResponsePDF = async (req, res) => {
  try {
    const { responseId } = req.params;
    const { maskSSN = true } = req.query; // Default to masking SSN for preview
    
    // Find the user response
    const userResponse = await UserResponse.findById(responseId).populate('mcaId');
    
    if (!userResponse) {
      return res.status(404).json({
        success: false,
        message: 'User response not found'
      });
    }
    
    // Get MCA data
    const mcaData = userResponse.mcaId ? userResponse.mcaId.toObject() : {};
    
    // Get form data from user response
    const formData = userResponse.formData || {};
    
    if (!formData.uniqueId) {
      formData.uniqueId = userResponse.uniqueId;
    }
    
    // Generate the PDF
    const pdfBuffer = await pdfService.generateFilledPDF(mcaData, formData, {
      maskSSN: maskSSN === 'true' || maskSSN === true
    });
    
    // Generate filename
    const filename = pdfService.generatePDFFilename(mcaData, formData);
    
    // Set response headers for inline PDF display
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    // Send the PDF
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('Error previewing PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to preview PDF',
      error: error.message
    });
  }
};

/**
 * Get PDF metadata without generating the full PDF
 * 
 * @route GET /api/pdf/response/:responseId/info
 * @access Admin only
 */
exports.getPDFInfo = async (req, res) => {
  try {
    const { responseId } = req.params;
    
    // Find the user response
    const userResponse = await UserResponse.findById(responseId).populate('mcaId');
    
    if (!userResponse) {
      return res.status(404).json({
        success: false,
        message: 'User response not found'
      });
    }
    
    // Get MCA data
    const mcaData = userResponse.mcaId ? userResponse.mcaId.toObject() : {};
    
    // Get form data from user response
    const formData = userResponse.formData || {};
    
    if (!formData.uniqueId) {
      formData.uniqueId = userResponse.uniqueId;
    }
    
    // Generate merged data for preview
    const mergedData = pdfService.mergeApplicationData(mcaData, formData);
    
    // Generate filename
    const filename = pdfService.generatePDFFilename(mcaData, formData);
    
    res.json({
      success: true,
      data: {
        filename,
        responseId: userResponse._id,
        uniqueId: userResponse.uniqueId,
        businessName: mergedData.legalBusinessName,
        ownerName: `${mergedData.firstName} ${mergedData.lastName}`.trim(),
        status: userResponse.status,
        createdAt: userResponse.createdAt,
        dataCompleteness: calculateDataCompleteness(mergedData)
      }
    });
    
  } catch (error) {
    console.error('Error getting PDF info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get PDF info',
      error: error.message
    });
  }
};

/**
 * Calculate data completeness percentage
 */
function calculateDataCompleteness(data) {
  const requiredFields = [
    'legalBusinessName',
    'streetAddress',
    'city',
    'state',
    'zipCode',
    'phone',
    'businessEmail',
    'ein',
    'firstName',
    'lastName',
    'ssn',
    'dateOfBirth',
    'ownerStreetAddress',
    'amountRequested'
  ];
  
  const filledFields = requiredFields.filter(field => {
    const value = data[field];
    return value && value.toString().trim() !== '';
  });
  
  return Math.round((filledFields.length / requiredFields.length) * 100);
}



