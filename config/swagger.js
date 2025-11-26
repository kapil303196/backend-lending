const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MCA Lending API',
      version: '1.0.0',
      description: 'Complete REST API for managing MCA (Merchant Cash Advance) lending data with user response tracking',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      },
      {
        url: 'https://api.yourdomain.com',
        description: 'Production server'
      }
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check and server info endpoints'
      },
      {
        name: 'MCA',
        description: 'MCA (Merchant Cash Advance) record management'
      },
      {
        name: 'User Responses',
        description: 'User form submission and response tracking'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token from /api/auth/login'
        }
      },
      schemas: {
        MCA: {
          type: 'object',
          required: ['uniqueId'],
          properties: {
            _id: {
              type: 'string',
              description: 'MongoDB ObjectId',
              example: '507f1f77bcf86cd799439011'
            },
            uniqueId: {
              type: 'string',
              description: 'Unique identifier for sharing with users',
              example: 'A1B2C3D4'
            },
            isActive: {
              type: 'boolean',
              description: 'Soft delete flag',
              default: true
            },
            userResponses: {
              type: 'array',
              description: 'Array of UserResponse IDs',
              items: {
                type: 'string'
              }
            },
            businessName: {
              type: 'string',
              example: 'Example Corp'
            },
            contactPerson: {
              type: 'string',
              example: 'John Doe'
            },
            email: {
              type: 'string',
              example: 'john@example.com'
            },
            phone: {
              type: 'string',
              example: '555-1234'
            },
            amount: {
              type: 'string',
              example: '50000'
            },
            status: {
              type: 'string',
              example: 'pending'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        UserResponse: {
          type: 'object',
          required: ['mcaId', 'uniqueId'],
          properties: {
            _id: {
              type: 'string',
              description: 'MongoDB ObjectId'
            },
            mcaId: {
              type: 'string',
              description: 'Reference to MCA record'
            },
            uniqueId: {
              type: 'string',
              description: 'UniqueId from MCA record',
              example: 'A1B2C3D4'
            },
            isVerified: {
              type: 'boolean',
              default: false
            },
            comments: {
              type: 'string',
              example: 'All information is correct'
            },
            formData: {
              type: 'object',
              description: 'Flexible form data object'
            },
            verifiedFields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fieldName: { type: 'string' },
                  isCorrect: { type: 'boolean' },
                  correctedValue: { type: 'string' },
                  note: { type: 'string' }
                }
              }
            },
            userContact: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' }
              }
            },
            ipAddress: { type: 'string' },
            userAgent: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'submitted', 'approved', 'rejected'],
              default: 'pending'
            },
            submittedAt: {
              type: 'string',
              format: 'date-time'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object'
            },
            message: {
              type: 'string'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'Error message'
            },
            error: {
              type: 'string',
              example: 'Detailed error'
            }
          }
        },
        PaginationResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'array',
              items: {}
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number', example: 1 },
                limit: { type: 'number', example: 50 },
                total: { type: 'number', example: 1000 },
                pages: { type: 'number', example: 20 }
              }
            }
          }
        }
      }
    }
  },
  apis: ['./routes/*.js', './server.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

