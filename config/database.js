const mongoose = require('mongoose');

const connectDB = async () => {
  // If already connected, return existing connection
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Mongoose 6+ doesn't need these options anymore
      // but keeping them commented for reference
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      // Optimize for serverless (Vercel)
      serverSelectionTimeoutMS: 5000, // 5 seconds
      socketTimeoutMS: 45000, // 45 seconds
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    return conn;
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error.message);
    // Don't exit process on Vercel - let it handle errors per request
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      console.warn('⚠️  Continuing in serverless mode - connection will be retried on next request');
      throw error; // Re-throw so caller can handle
    } else {
      process.exit(1);
    }
  }
};

module.exports = connectDB;

