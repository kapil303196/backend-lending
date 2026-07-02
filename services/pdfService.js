/**
 * PDF Generation Service
 * 
 * This service handles the generation of filled application PDFs
 * using pdf-lib for production-grade PDF manipulation.
 * 
 * Features:
 * - Form field filling with uniform font size
 * - Signature support (base64 image or text fallback)
 * - Business name based filename generation
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// PDF template path
const TEMPLATE_PATH = path.join(__dirname, '../pdf/blank-fund-app.pdf');

// Uniform font size for all form fields (in points)
const UNIFORM_FONT_SIZE = 10;

// Signature field coordinates from the PDF form
// Signature84: rect [22.2546, 19.7058, 197.782, 51.7058]
const SIGNATURE_FIELD = {
  x: 22.25,
  y: 19.71,
  width: 175.53,
  height: 32
};

/**
 * Format SSN for display (XXX-XX-XXXX)
 */
function formatSSN(ssn, mask = false) {
  if (!ssn) return '';
  const cleaned = ssn.replace(/\D/g, '');
  if (cleaned.length !== 9) return ssn;
  
  if (mask) {
    return `XXX-XX-${cleaned.slice(5)}`;
  }
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5)}`;
}

/**
 * Format phone number for display
 */
function formatPhone(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

/**
 * Parse currency value from string or number
 */
function parseCurrencyValue(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format currency for display
 */
function formatCurrency(value) {
  if (value === undefined || value === null || value === '') return '';
  const numericValue = parseCurrencyValue(value);
  if (!numericValue) return typeof value === 'string' && value.startsWith('$') ? value : '';
  return '$' + numericValue.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

/**
 * Format date to MM/DD/YYYY
 */
function formatDate(date) {
  if (!date) return '';
  
  // If already in MM/DD/YYYY format, return as is
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    return date;
  }
  
  // If in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-');
    return `${month}/${day}/${year}`;
  }
  
  // Try to parse as date
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  });
}

/**
 * Safely set text field value with uniform font size
 */
function setTextField(form, fieldName, value) {
  if (value === undefined || value === null || value === '') return;
  
  try {
    const field = form.getTextField(fieldName);
    field.setFontSize(UNIFORM_FONT_SIZE);
    field.setText(String(value));
  } catch (error) {
    console.warn(`⚠️ Could not set field "${fieldName}": ${error.message}`);
  }
}

/**
 * Safely set radio group value
 * Note: Radio values should NOT have leading slash
 */
function setRadioGroup(form, fieldName, value) {
  if (value === undefined || value === null || value === '') return;
  
  try {
    const radioGroup = form.getRadioGroup(fieldName);
    // Remove leading slash if present (some PDFs expect it without)
    const cleanValue = value.startsWith('/') ? value.substring(1) : value;
    radioGroup.select(cleanValue);
  } catch (error) {
    console.warn(`⚠️ Could not set radio "${fieldName}": ${error.message}`);
  }
}

/**
 * Draw signature image from base64 data URL onto PDF page
 */
async function drawSignatureImage(pdfDoc, page, signatureDataUrl) {
  try {
    // Extract base64 data from data URL
    const base64Data = signatureDataUrl.split(',')[1];
    if (!base64Data) {
      console.warn('⚠️ Could not extract base64 data from signature');
      return false;
    }
    
    // Convert base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // Embed the image (PNG format from canvas.toDataURL())
    let image;
    if (signatureDataUrl.includes('image/png')) {
      image = await pdfDoc.embedPng(imageBuffer);
    } else if (signatureDataUrl.includes('image/jpeg') || signatureDataUrl.includes('image/jpg')) {
      image = await pdfDoc.embedJpg(imageBuffer);
    } else {
      // Default to PNG since canvas.toDataURL() produces PNG by default
      image = await pdfDoc.embedPng(imageBuffer);
    }
    
    // Scale image to fit within signature field
    const { width, height } = image.scale(1);
    const scale = Math.min(SIGNATURE_FIELD.width / width, SIGNATURE_FIELD.height / height) * 0.9;
    
    // Draw the signature image on the page
    page.drawImage(image, {
      x: SIGNATURE_FIELD.x + 5,
      y: SIGNATURE_FIELD.y + 2,
      width: width * scale,
      height: height * scale,
    });
    
    console.log('✅ Signature image added');
    return true;
  } catch (error) {
    console.error('❌ Error adding signature image:', error.message);
    return false;
  }
}

/**
 * Draw text-based signature (fallback when no image signature)
 */
async function drawTextSignature(pdfDoc, page, signatureText) {
  try {
    // Use italic font for handwritten look
    const font = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    
    // Calculate font size to fit
    const fontSize = Math.min(20, SIGNATURE_FIELD.height * 0.6);
    
    page.drawText(signatureText, {
      x: SIGNATURE_FIELD.x + 10,
      y: SIGNATURE_FIELD.y + (SIGNATURE_FIELD.height - fontSize) / 2 + 5,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0.5), // Dark blue for signature look
    });
    
    console.log('✅ Text signature added');
    return true;
  } catch (error) {
    console.error('❌ Error adding text signature:', error.message);
    return false;
  }
}

/**
 * Merge MCA data with UserResponse formData
 * UserResponse formData takes priority over MCA data
 */
function mergeApplicationData(mcaData, formData) {
  const merged = {
    // Business Information - prefer formData, fallback to mcaData
    legalBusinessName: formData?.legalBusinessName || formData?.businessName || mcaData?.company || '',
    dba: formData?.dba || '',
    streetAddress: formData?.streetAddress || mcaData?.address || '',
    city: formData?.city || mcaData?.city || '',
    state: formData?.state || mcaData?.state || '',
    zipCode: formData?.zipCode || mcaData?.zip || '',
    phone: formData?.phone || mcaData?.phoneNumber || '',
    businessEmail: formData?.businessEmail || mcaData?.email || '',
    ein: formData?.ein || mcaData?.taxId || '',
    businessStartDate: formData?.businessStartDate || mcaData?.dateBusinessStarted || '',
    monthlyRevenue: formData?.monthlyRevenue || mcaData?.monthlyRevenue || '',
    
    // Owner Information
    firstName: formData?.firstName || mcaData?.firstName || '',
    lastName: formData?.lastName || mcaData?.lastName || '',
    ownerEmail: formData?.ownerEmail || mcaData?.email || '',
    ownerPhone: formData?.phone || mcaData?.phoneNumber || '',
    ssn: formData?.ssn || '',
    dateOfBirth: formData?.dateOfBirth || mcaData?.birthDate || '',
    ownershipPercent: formData?.ownershipPercent || '100',
    ownerStreetAddress: formData?.ownerStreetAddress || '',
    ownerCity: formData?.ownerCity || '',
    ownerState: formData?.ownerState || '',
    ownerZip: formData?.ownerZip || '',
    
    // Capital Information
    amountRequested: formData?.amountRequested || '',
    hasExistingBalances: formData?.hasExistingBalances || 'no',
    existingFunders: formData?.existingFunders || [],
    numberOfOwners: formData?.numberOfOwners || '1',
    
    // Signature
    signature: formData?.signature || '',
    signatureDate: formData?.signatureDate || new Date().toLocaleDateString('en-US'),
    
    // Additional fields
    industry: formData?.industry || '',
    website: formData?.website || '',
    businessStructure: formData?.businessStructure || '',
    seasonalBusiness: formData?.seasonalBusiness || '',
    propertyInfo: formData?.propertyInfo || '',
    monthlyPayment: formData?.monthlyPayment || '',
    creditCardSalesIncome: formData?.creditCardSalesIncome || '',
    avgMonthlyCCSales: formData?.avgMonthlyCCSales || '',
    openBankruptcies: formData?.openBankruptcies || '',
    bankruptcyType: formData?.bankruptcyType || '',
    openJudgements: formData?.openJudgements || '',
    otherOwners: formData?.otherOwners || '',
    useOfFunds: formData?.useOfFunds || '',
  };
  
  return merged;
}

/**
 * Map business structure value to radio choice
 */
function mapBusinessStructure(value) {
  if (!value) return '';
  const val = value.toLowerCase();
  if (val.includes('corporation') || val.includes('corp')) return 'Choice1';
  if (val.includes('llc')) return 'Choice2';
  if (val.includes('llp')) return 'Choice3';
  if (val.includes('partnership')) return 'Choice4';
  if (val.includes('sole') || val.includes('proprietor')) return 'Choice5';
  return '';
}

/**
 * Map yes/no value to radio choice
 */
function mapYesNo(value) {
  if (!value) return '';
  const val = String(value).toLowerCase();
  if (val === 'yes' || val === 'true' || val === '1') return 'Choice1';
  if (val === 'no' || val === 'false' || val === '0') return 'Choice2';
  return '';
}

/**
 * Map property info value to radio choice
 */
function mapPropertyInfo(value) {
  if (!value) return '';
  const val = value.toLowerCase();
  if (val.includes('mortgage')) return 'Choice1';
  if (val.includes('own')) return 'Choice2';
  if (val.includes('rent')) return 'Choice3';
  return '';
}

/**
 * Generate a filled PDF application using form fields
 * 
 * @param {Object} mcaData - MCA record data from database
 * @param {Object} formData - User response form data
 * @param {Object} options - Generation options
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function generateFilledPDF(mcaData, formData, options = {}) {
  try {
    // Check if template exists
    if (!fs.existsSync(TEMPLATE_PATH)) {
      throw new Error('PDF template not found');
    }
    
    // Load the PDF template
    const pdfBytes = fs.readFileSync(TEMPLATE_PATH);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    
    // Merge data from MCA and formData
    const data = mergeApplicationData(mcaData, formData);
    
    // Get owner full name
    const ownerFullName = `${data.firstName} ${data.lastName}`.trim();
    
    // Calculate annual sales from monthly revenue
    const monthlyRev = parseCurrencyValue(data.monthlyRevenue);
    const annualSales = monthlyRev ? monthlyRev * 12 : 0;
    
    // Calculate total existing balance
    const hasBalances = data.hasExistingBalances?.toLowerCase() === 'yes';
    let totalBalance = 0;
    let fundersText = '';
    if (hasBalances && data.existingFunders?.length > 0) {
      totalBalance = data.existingFunders.reduce((sum, f) => {
        return sum + parseCurrencyValue(f.balanceRemaining);
      }, 0);
      fundersText = data.existingFunders
        .map(f => `${f.funderName}: ${formatCurrency(f.balanceRemaining)}`)
        .join('; ');
    }

    // --- BUSINESS INFORMATION ---
    setTextField(form, 'Text47', data.legalBusinessName);
    setTextField(form, 'Text48', data.dba);
    setTextField(form, 'Text49', data.ein);
    setTextField(form, 'Text50', data.industry);
    setTextField(form, 'Text51', data.website);
    setTextField(form, 'Text52', formatDate(data.businessStartDate));
    setTextField(form, 'Text54', data.streetAddress);
    setTextField(form, 'Text55', data.city);
    setTextField(form, 'Text56', (data.state || '').toUpperCase());
    setTextField(form, 'Text57', data.zipCode);
    setTextField(form, 'Text58', formatPhone(data.phone));
    setTextField(form, 'Text59', (data.state || '').toUpperCase()); // State of Incorporation
    setTextField(form, 'Text62', data.monthlyPayment ? formatCurrency(data.monthlyPayment) : '');
    setTextField(form, 'Text63', annualSales ? formatCurrency(annualSales) : '');
    setTextField(form, 'Text65', data.avgMonthlyCCSales ? formatCurrency(data.avgMonthlyCCSales) : '');

    // Business Structure Radio (Group53)
    setRadioGroup(form, 'Group53', mapBusinessStructure(data.businessStructure));

    // Seasonal Business Radio (Group60)
    setRadioGroup(form, 'Group60', mapYesNo(data.seasonalBusiness));

    // Property Info Radio (Group61)
    setRadioGroup(form, 'Group61', mapPropertyInfo(data.propertyInfo));

    // Credit Card Sales Income Radio (Group64)
    setRadioGroup(form, 'Group64', mapYesNo(data.creditCardSalesIncome));

    // --- OWNER DETAILS ---
    setTextField(form, 'Text66', ownerFullName);
    setTextField(form, 'Text67', data.ownerStreetAddress || data.streetAddress);
    setTextField(form, 'Text68', data.ownerCity || data.city);
    setTextField(form, 'Text69', (data.ownerState || data.state || '').toUpperCase());
    setTextField(form, 'Text70', data.ownerZip || data.zipCode);
    
    // SSN - mask if option is set
    const ssnDisplay = options.maskSSN 
      ? formatSSN(data.ssn, true)
      : formatSSN(data.ssn, false);
    setTextField(form, 'Text71', ssnDisplay);
    
    setTextField(form, 'Text72', formatDate(data.dateOfBirth));
    setTextField(form, 'Text73', formatPhone(data.ownerPhone || data.phone));
    setTextField(form, 'Text74', data.ownerEmail || data.businessEmail);
    setTextField(form, 'Text75', data.ownershipPercent ? `${data.ownershipPercent}%` : '');
    setTextField(form, 'Text77', data.bankruptcyType || '');

    // Open Bankruptcies Radio (Group76)
    setRadioGroup(form, 'Group76', mapYesNo(data.openBankruptcies));

    // Open Judgements/Liens Radio (Group78)
    setRadioGroup(form, 'Group78', mapYesNo(data.openJudgements));

    // Other Owners Radio (Group79)
    const hasOtherOwners = data.numberOfOwners && parseInt(data.numberOfOwners) > 1 ? 'yes' : 'no';
    setRadioGroup(form, 'Group79', mapYesNo(data.otherOwners || hasOtherOwners));

    // --- CAPITAL INFORMATION ---
    setTextField(form, 'Text80', data.amountRequested ? formatCurrency(data.amountRequested) : '');
    setTextField(form, 'Text81', data.useOfFunds || fundersText);
    setTextField(form, 'Text83', totalBalance ? formatCurrency(totalBalance) : '');

    // Working Capital Loan Radio (Group82)
    setRadioGroup(form, 'Group82', mapYesNo(data.hasExistingBalances));

    // --- SIGNATURE SECTION ---
    setTextField(form, 'Text85', ownerFullName);
    setTextField(form, 'Date86_af_date', formatDate(data.signatureDate));

    // Update field appearances before drawing signature
    form.updateFieldAppearances();
    
    // Get the first page for signature drawing
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    
    // Handle signature: Try image first, fallback to text
    if (data.signature && data.signature.startsWith('data:image')) {
      // Draw signature from base64 image
      const success = await drawSignatureImage(pdfDoc, firstPage, data.signature);
      if (!success && ownerFullName) {
        // Fallback to text signature if image fails
        await drawTextSignature(pdfDoc, firstPage, ownerFullName);
      }
    } else if (ownerFullName) {
      // No image signature, use text signature with owner name
      await drawTextSignature(pdfDoc, firstPage, ownerFullName);
    }
    
    // Try to remove the signature field placeholder (optional)
    try {
      form.removeField(form.getField('Signature84'));
    } catch (e) {
      // Field may not exist or can't be removed - that's fine
    }

    // Set PDF metadata with business name
    const businessName = data.legalBusinessName || 'Application';
    pdfDoc.setTitle(`FundDirect Application - ${businessName}`);
    pdfDoc.setSubject('Merchant Cash Advance Application');
    pdfDoc.setAuthor('FundDirect.US');
    pdfDoc.setCreator('FundDirect Application System');
    pdfDoc.setCreationDate(new Date());
    pdfDoc.setModificationDate(new Date());

    // Serialize the PDF
    const filledPdfBytes = await pdfDoc.save();
    
    return Buffer.from(filledPdfBytes);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
}

/**
 * Generate filename for the PDF based on business name
 * Format: BusinessName_Application_YYYY-MM-DD.pdf
 */
function generatePDFFilename(mcaData, formData) {
  const businessName = formData?.legalBusinessName || mcaData?.company || 'Application';
  const date = new Date().toISOString().split('T')[0];
  
  // Sanitize filename - remove special characters, replace spaces with underscores
  const sanitizedName = businessName
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
    .trim();
  
  return `${sanitizedName}_Application_${date}.pdf`;
}

/**
 * List all form fields in a PDF (useful for debugging)
 */
async function listPDFFormFields(pdfPath) {
  const pdfBytes = fs.readFileSync(pdfPath || TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  
  console.log('\n📋 PDF Form Fields:\n');
  
  fields.forEach((field) => {
    const type = field.constructor.name;
    const name = field.getName();
    
    if (type === 'PDFRadioGroup') {
      try {
        const options = field.getOptions();
        console.log(`📻 ${name} (RadioGroup): Options = [${options.join(', ')}]`);
      } catch (e) {
        console.log(`📻 ${name} (RadioGroup)`);
      }
    } else if (type === 'PDFCheckBox') {
      console.log(`☑️ ${name} (CheckBox)`);
    } else if (type === 'PDFTextField') {
      console.log(`📝 ${name} (TextField)`);
    } else {
      console.log(`❓ ${name} (${type})`);
    }
  });
  
  return fields.map(f => ({ name: f.getName(), type: f.constructor.name }));
}

module.exports = {
  generateFilledPDF,
  generatePDFFilename,
  mergeApplicationData,
  listPDFFormFields
};
