const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const connectDB = require('./config/database');
const mcaRoutes = require('./routes/mcaRoutes');
const userResponseRoutes = require('./routes/userResponseRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const addressRoutes = require('./routes/addressRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.set('trust proxy', true); // Trust proxy for correct IP address (Vercel/Nginx)
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware (simple)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'MCA Lending API Documentation'
}));

// Swagger JSON endpoint
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Health check endpoint
 *     description: Check if the server is running
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Server is running
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/mca', mcaRoutes);
app.use('/api/responses', userResponseRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/address', addressRoutes);

/**
 * @swagger
 * /:
 *   get:
 *     tags: [Health]
 *     summary: Root endpoint with API information
 *     description: Get basic API information and available endpoints
 *     responses:
 *       200:
 *         description: API information
 */
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'MCA Lending API Server',
    version: '1.0.0',
    documentation: '/api-docs',
    endpoints: {
      mca: '/api/mca',
      responses: '/api/responses',
      health: '/health',
      docs: '/api-docs'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize database connection
const initializeApp = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    // In production (Vercel), we still want to export the app even if DB connection fails
    // The app will handle errors per request
  }
};

// Initialize the database connection
initializeApp();

// For local development - only start server if not in production/Vercel environment
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`\n🚀 Server is running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🌐 API URL: http://localhost:${PORT}`);
    console.log(`\n📚 Documentation:`);
    console.log(`   🔷 Swagger UI:  http://localhost:${PORT}/api-docs`);
    console.log(`   📄 JSON Spec:   http://localhost:${PORT}/api-docs.json`);
    console.log(`   📦 Postman:     MCA_Lending_API.postman_collection.json`);
    console.log(`\n📚 Available endpoints:`);
    console.log(`   GET  /health - Health check`);
    console.log(`   GET  /api/mca - Get all MCA records`);
    console.log(`   GET  /api/mca/stats - Get MCA statistics`);
    console.log(`   GET  /api/mca/:id - Get MCA by ID or uniqueId`);
    console.log(`   POST /api/mca - Create MCA record`);
    console.log(`   PUT  /api/mca/:id - Update MCA record`);
    console.log(`   DELETE /api/mca/:id - Soft delete MCA record`);
    console.log(`   POST /api/mca/:id/restore - Restore MCA record`);
    console.log(`   GET  /api/responses - Get all responses`);
    console.log(`   GET  /api/responses/stats - Get response statistics`);
    console.log(`   GET  /api/responses/mca/:id - Get responses for MCA`);
    console.log(`   POST /api/responses - Submit user response`);
    console.log(`   POST /api/upload/single - Upload single file`);
    console.log(`   POST /api/upload/multiple - Upload multiple files`);
    console.log(`\n✅ Server ready to accept connections\n`);
  });

  // Graceful shutdown for local development
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      mongoose.connection.close(false, () => {
        console.log('MongoDB connection closed');
        process.exit(0);
      });
    });
  });
}

module.exports = app;

