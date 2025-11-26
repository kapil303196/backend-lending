const AdminConfig = require('../models/AdminConfig');

// Get current configuration (creates default if missing)
exports.getConfig = async (req, res) => {
  try {
    let config = await AdminConfig.findOne({ configId: 'default' });

    if (!config) {
      config = await AdminConfig.create({ configId: 'default' });
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching admin configuration',
      error: error.message
    });
  }
};

// Update configuration
exports.updateConfig = async (req, res) => {
  try {
    const updates = req.body;
    
    // Prevent updating the identifier
    delete updates.configId;
    delete updates._id;

    const config = await AdminConfig.findOneAndUpdate(
      { configId: 'default' },
      { $set: updates },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      data: config
    });
  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating admin configuration',
      error: error.message
    });
  }
};

