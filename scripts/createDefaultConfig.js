require('dotenv').config();
const mongoose = require('mongoose');
const AdminConfig = require('../models/AdminConfig');
const connectDB = require('../config/database');

const createDefaultConfig = async () => {
  await connectDB();
  console.log('⚙️ Checking for default admin configuration...');

  try {
    let config = await AdminConfig.findOne({ configId: 'default' });
    
    if (config) {
      console.log('✅ Default configuration already exists.');
    } else {
      console.log('📝 Creating default configuration...');
      config = new AdminConfig({
        configId: 'default',
        pages: {
          overview: true,
          applications: true
        },
        charts: {
          statusDistribution: true,
          fundingTrend: true,
          amountDistribution: true,
          revenueVsLending: true
        },
        filters: {
          search: true,
          statusDropdown: true,
          sorting: true
        },
        features: {
          allowStatusUpdate: true,
          viewSensitiveInfo: true
        }
      });
      
      await config.save();
      console.log('✅ Default configuration created successfully!');
    }
    
    console.log('\n📋 Current Configuration:');
    console.log(JSON.stringify(config.toJSON(), null, 2));

  } catch (error) {
    console.error('❌ Error creating default config:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

createDefaultConfig();

