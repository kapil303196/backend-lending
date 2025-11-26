const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

const createAdminUser = async () => {
  try {
    // Connect to database
    const MONGODB_URI = process.env.MONGODB_URI;
    
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI not found in environment variables');
      process.exit(1);
    }
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: 'kapil@logicspark.io' });
    
    if (existingUser) {
      console.log('⚠️  Admin user already exists');
      console.log('Email:', existingUser.email);
      console.log('Name:', existingUser.name);
      console.log('Role:', existingUser.role);
      console.log('Active:', existingUser.isActive);
      
      // Ask if user wants to reset password
      console.log('\n✨ Resetting password to: Test@123');
      existingUser.password = 'Test@123'; // Will be hashed by pre-save hook
      await existingUser.save();
      console.log('✅ Password reset successfully!');
      
    } else {
      // Create new admin user
      console.log('📝 Creating new admin user...');
      
      const adminUser = new User({
        email: 'kapil@logicspark.io',
        password: 'Test@123', // Will be hashed by pre-save hook
        name: 'Kapil Admin',
        role: 'admin',
        isActive: true
      });
      
      await adminUser.save();
      console.log('✅ Admin user created successfully!');
      console.log('\n📋 Admin User Details:');
      console.log('Email:', adminUser.email);
      console.log('Password: Test@123');
      console.log('Name:', adminUser.name);
      console.log('Role:', adminUser.role);
      console.log('Active:', adminUser.isActive);
    }
    
    console.log('\n🎉 Done!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Run the script
createAdminUser();

