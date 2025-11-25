const { uploadToS3, uploadMultipleToS3, deleteFromS3 } = require('../utils/s3Upload');

// Upload single file to S3
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided'
      });
    }

    const result = await uploadToS3(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'bank-statements'
    );

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        url: result.url,
        key: result.key,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading file',
      error: error.message
    });
  }
};

// Upload multiple files to S3
exports.uploadMultipleFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files provided'
      });
    }

    const files = req.files.map(file => ({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    }));

    const results = await uploadMultipleToS3(files, 'bank-statements');

    const uploadedFiles = results.map((result, index) => ({
      url: result.url,
      key: result.key,
      originalName: req.files[index].originalname,
      size: req.files[index].size,
      mimeType: req.files[index].mimetype
    }));

    res.status(200).json({
      success: true,
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
      data: uploadedFiles
    });
  } catch (error) {
    console.error('Upload multiple files error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading files',
      error: error.message
    });
  }
};

// Delete file from S3
exports.deleteFile = async (req, res) => {
  try {
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'File key is required'
      });
    }

    await deleteFromS3(key);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting file',
      error: error.message
    });
  }
};

