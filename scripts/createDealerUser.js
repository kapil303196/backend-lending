const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

const createDealerUser = async () => {
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

    const email = 'dealer@logicspark.io';
    const password = 'Test@123';

    // Check if user already exists
    let user = await User.findOne({ email });

    if (user) {
      console.log('⚠️  User already exists, updating to dealer role and resetting password');
      user.password = password; // Will be hashed by pre-save hook
      user.role = 'dealer';
      user.isActive = true;
      await user.save();
      console.log('✅ User updated to dealer successfully!');
    } else {
      console.log('📝 Creating new dealer user...');

      user = new User({
        email,
        password, // Will be hashed by pre-save hook
        name: 'Kapil Dealer',
        role: 'dealer',
        isActive: true
      });

      await user.save();
      console.log('✅ Dealer user created successfully!');
    }

    console.log('\n📋 Dealer User Details:');
    console.log('Email:', user.email);
    console.log('Password:', password);
    console.log('Name:', user.name);
    console.log('Role:', user.role);
    console.log('Active:', user.isActive);

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
createDealerUser();


