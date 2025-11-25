const { s3, s3Config } = require('../config/aws');
const crypto = require('crypto');
const path = require('path');

/**
 * Upload a file buffer to S3
 * @param {Buffer} fileBuffer - File buffer
 * @param {String} originalName - Original file name
 * @param {String} mimeType - File MIME type
 * @param {String} folder - S3 folder path (optional)
 * @returns {Promise<Object>} - Upload result with S3 URL
 */
const uploadToS3 = async (fileBuffer, originalName, mimeType, folder = 'bank-statements') => {
  try {
    // Generate unique filename
    const fileExtension = path.extname(originalName);
    const uniqueFileName = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${fileExtension}`;

    // S3 upload parameters
    const params = {
      Bucket: s3Config.bucket,
      Key: uniqueFileName,
      Body: fileBuffer,
      ContentType: mimeType
      // ACL removed - bucket uses bucket policy for access control
    };

    // Upload to S3
    const result = await s3.upload(params).promise();

    return {
      success: true,
      url: result.Location,
      key: result.Key,
      bucket: result.Bucket,
      etag: result.ETag
    };
  } catch (error) {
    console.error('S3 Upload Error:', error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

/**
 * Upload multiple files to S3
 * @param {Array} files - Array of file objects with buffer, originalName, and mimeType
 * @param {String} folder - S3 folder path (optional)
 * @returns {Promise<Array>} - Array of upload results
 */
const uploadMultipleToS3 = async (files, folder = 'bank-statements') => {
  try {
    const uploadPromises = files.map(file => 
      uploadToS3(file.buffer, file.originalName, file.mimeType, folder)
    );
    
    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    console.error('Multiple S3 Upload Error:', error);
    throw error;
  }
};

/**
 * Delete a file from S3
 * @param {String} fileKey - S3 file key
 * @returns {Promise<Object>} - Delete result
 */
const deleteFromS3 = async (fileKey) => {
  try {
    const params = {
      Bucket: s3Config.bucket,
      Key: fileKey
    };

    await s3.deleteObject(params).promise();

    return {
      success: true,
      message: 'File deleted successfully',
      key: fileKey
    };
  } catch (error) {
    console.error('S3 Delete Error:', error);
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
};

/**
 * Check if file exists in S3
 * @param {String} fileKey - S3 file key
 * @returns {Promise<Boolean>} - Whether file exists
 */
const fileExistsInS3 = async (fileKey) => {
  try {
    const params = {
      Bucket: s3Config.bucket,
      Key: fileKey
    };

    await s3.headObject(params).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
};

module.exports = {
  uploadToS3,
  uploadMultipleToS3,
  deleteFromS3,
  fileExistsInS3
};

