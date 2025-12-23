const MCA = require('../models/MCA');
const UserResponse = require('../models/UserResponse');
const mongoose = require('mongoose');

// Get all MCA records (with pagination and filters)
exports.getAllMCA = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      isActive, 
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query = {};
    
    // Filter by isActive if provided
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Search across multiple fields
    if (search) {
      query.$or = [
        { uniqueId: { $regex: search, $options: 'i' } },
        // Add more searchable fields as needed
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [records, total] = await Promise.all([
      MCA.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userResponses'),
      MCA.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all MCA error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching MCA records',
      error: error.message
    });
  }
};

// Get single MCA by MongoDB ID or uniqueId
exports.getMCAById = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeResponses = 'true' } = req.query;

    // Treat multiple truthy values as a request to include responses
    const include =
      typeof includeResponses === 'string'
        ? ['true', '1', 'yes', 'y'].includes(includeResponses.toLowerCase())
        : Boolean(includeResponses);

    const record = await MCA.findByIdOrUniqueId(id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'MCA record not found'
      });
    }

    if (include) {
      try {
        await record.populate('userResponses');
      } catch (populateErr) {
        console.error('Populate userResponses error:', populateErr);
      }
    }

    // Normalize any "llc" casing to "LLC"
    if (record.company) {
      record.company = record.company.replace(/llc/gi, 'LLC');
    }

    res.json({ success: true, data: record });
  } catch (error) {
    console.error('Get MCA by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching MCA record',
      error: error.message
    });
  }
};

// Create new MCA record
exports.createMCA = async (req, res) => {
  try {
    const mcaData = req.body;
    
    // Generate uniqueId if not provided
    if (!mcaData.uniqueId) {
      const crypto = require('crypto');
      mcaData.uniqueId = crypto.randomBytes(4).toString('hex').toUpperCase();
    }
    
    const mca = new MCA(mcaData);
    await mca.save();
    
    res.status(201).json({
      success: true,
      message: 'MCA record created successfully',
      data: mca
    });
  } catch (error) {
    console.error('Create MCA error:', error);
    
    // Handle duplicate uniqueId error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'UniqueId already exists',
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating MCA record',
      error: error.message
    });
  }
};

// Update MCA record
exports.updateMCA = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Prevent updating certain fields
    delete updates._id;
    delete updates.createdAt;
    delete updates.userResponses; // Use separate endpoint to manage responses
    
    const record = await MCA.findByIdOrUniqueId(id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'MCA record not found'
      });
    }
    
    // Apply updates
    Object.assign(record, updates);
    await record.save();
    
    res.json({
      success: true,
      message: 'MCA record updated successfully',
      data: record
    });
  } catch (error) {
    console.error('Update MCA error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating MCA record',
      error: error.message
    });
  }
};

// Soft delete MCA record
exports.softDeleteMCA = async (req, res) => {
  try {
    const { id } = req.params;
    
    const record = await MCA.findByIdOrUniqueId(id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'MCA record not found'
      });
    }
    
    await record.softDelete();
    
    res.json({
      success: true,
      message: 'MCA record soft deleted successfully',
      data: record
    });
  } catch (error) {
    console.error('Soft delete MCA error:', error);
    res.status(500).json({
      success: false,
      message: 'Error soft deleting MCA record',
      error: error.message
    });
  }
};

// Restore soft deleted MCA record
exports.restoreMCA = async (req, res) => {
  try {
    const { id } = req.params;
    
    const record = await MCA.findByIdOrUniqueId(id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'MCA record not found'
      });
    }
    
    await record.restore();
    
    res.json({
      success: true,
      message: 'MCA record restored successfully',
      data: record
    });
  } catch (error) {
    console.error('Restore MCA error:', error);
    res.status(500).json({
      success: false,
      message: 'Error restoring MCA record',
      error: error.message
    });
  }
};

// Hard delete MCA record (permanent)
exports.hardDeleteMCA = async (req, res) => {
  try {
    const { id } = req.params;
    
    const record = await MCA.findByIdOrUniqueId(id);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'MCA record not found'
      });
    }
    
    // Also delete associated user responses
    await UserResponse.deleteMany({ mcaId: record._id });
    
    await MCA.deleteOne({ _id: record._id });
    
    res.json({
      success: true,
      message: 'MCA record permanently deleted'
    });
  } catch (error) {
    console.error('Hard delete MCA error:', error);
    res.status(500).json({
      success: false,
      message: 'Error permanently deleting MCA record',
      error: error.message
    });
  }
};

// Get MCA statistics
exports.getMCAStats = async (req, res) => {
  try {
    const [total, active, inactive, withResponses] = await Promise.all([
      MCA.countDocuments(),
      MCA.countDocuments({ isActive: true }),
      MCA.countDocuments({ isActive: false }),
      MCA.countDocuments({ 'userResponses.0': { $exists: true } })
    ]);
    
    res.json({
      success: true,
      data: {
        total,
        active,
        inactive,
        withResponses,
        responseRate: total > 0 ? ((withResponses / total) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    console.error('Get MCA stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching MCA statistics',
      error: error.message
    });
  }
};

