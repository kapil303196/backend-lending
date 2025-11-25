const AWS = require('aws-sdk');

// AWS Configuration - All credentials must be set in environment variables
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  throw new Error('AWS credentials are required. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file');
}

const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
};

const s3Config = {
  bucket: process.env.AWS_S3_BUCKET || 'belowmsrp-images'
  // Note: ACL removed - bucket uses bucket policy for public access instead
};

// Configure AWS SDK
AWS.config.update(awsConfig);

// Create S3 instance
const s3 = new AWS.S3();

module.exports = {
  s3,
  s3Config,
  awsConfig
};

