const UserResponse = require('../models/UserResponse');
const MCA = require('../models/MCA');

// Get all user responses (with pagination and filters)
exports.getAllResponses = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status,
      mcaId,
      uniqueId,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (mcaId) {
      query.mcaId = mcaId;
    }
    
    if (uniqueId) {
      query.uniqueId = uniqueId;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Handle different sort fields
    let sort = {};
    const order = sortOrder === 'asc' ? 1 : -1;
    
    switch (sortBy) {
      case 'amount':
        // Sort by requested amount (stored in formData.amountRequested)
        sort = { 'formData.amountRequested': order };
        break;
      case 'revenue':
        // Sort by monthly revenue (stored in formData.monthlyRevenue)
        sort = { 'formData.monthlyRevenue': order };
        break;
      case 'uniqueId':
        sort = { uniqueId: order };
        break;
      case 'status':
        sort = { status: order };
        break;
      case 'createdAt':
      default:
        sort = { createdAt: order };
        break;
    }
    
    const [responses, total] = await Promise.all([
      UserResponse.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('mcaId'),
      UserResponse.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: responses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all responses error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user responses',
      error: error.message
    });
  }
};

// Get responses for a specific MCA record
exports.getResponsesByMCA = async (req, res) => {
  try {
    const { id } = req.params; // This can be MongoDB ID or uniqueId
    
    // First find the MCA record
    const mca = await MCA.findByIdOrUniqueId(id);
    
    if (!mca) {
      return res.status(404).json({
        success: false,
        message: 'MCA record not found'
      });
    }
    
    // Get all responses for this MCA
    const responses = await UserResponse.find({ mcaId: mca._id })
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: responses
    });
  } catch (error) {
    console.error('Get responses by MCA error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching responses for MCA',
      error: error.message
    });
  }
};

// Get single response by ID
exports.getResponseById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const response = await UserResponse.findById(id).populate('mcaId');
    
    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Response not found'
      });
    }
    
    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Get response by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching response',
      error: error.message
    });
  }
};

// Create new user response (when user submits form)
exports.createResponse = async (req, res) => {
  try {
    const { uniqueId, bankStatements, ...responseData } = req.body;
    
    if (!uniqueId) {
      return res.status(400).json({
        success: false,
        message: 'uniqueId is required'
      });
    }
    
    // Find the MCA record
    const mca = await MCA.findOne({ uniqueId });
    
    if (!mca) {
      return res.status(404).json({
        success: false,
        message: 'MCA record not found with provided uniqueId'
      });
    }
    
    if (!mca.isActive) {
      return res.status(400).json({
        success: false,
        message: 'This MCA record is no longer active'
      });
    }
    
    // Parse bank statements if they come as string (from frontend)
    let bankStatementsArray = [];
    if (bankStatements) {
      bankStatementsArray = typeof bankStatements === 'string' 
        ? JSON.parse(bankStatements) 
        : bankStatements;
    }
    
    // Create the response
    const userResponse = new UserResponse({
      mcaId: mca._id,
      uniqueId: uniqueId,
      ...responseData,
      bankStatements: bankStatementsArray,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    });
    
    await userResponse.save();
    
    // Add response ID to MCA record
    mca.userResponses.push(userResponse._id);
    await mca.save();
    
    res.status(201).json({
      success: true,
      message: 'Response submitted successfully',
      data: userResponse
    });
  } catch (error) {
    console.error('Create response error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating response',
      error: error.message
    });
  }
};

// Update user response
exports.updateResponse = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Prevent updating certain fields
    delete updates._id;
    delete updates.mcaId;
    delete updates.uniqueId;
    delete updates.createdAt;
    
    const response = await UserResponse.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Response not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Response updated successfully',
      data: response
    });
  } catch (error) {
    console.error('Update response error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating response',
      error: error.message
    });
  }
};

// Delete user response
exports.deleteResponse = async (req, res) => {
  try {
    const { id } = req.params;
    
    const response = await UserResponse.findById(id);
    
    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Response not found'
      });
    }
    
    // Remove response ID from MCA record
    await MCA.findByIdAndUpdate(
      response.mcaId,
      { $pull: { userResponses: response._id } }
    );
    
    await UserResponse.deleteOne({ _id: id });
    
    res.json({
      success: true,
      message: 'Response deleted successfully'
    });
  } catch (error) {
    console.error('Delete response error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting response',
      error: error.message
    });
  }
};

// Update response status
exports.updateResponseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'submitted', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }
    
    const response = await UserResponse.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    );
    
    if (!response) {
      return res.status(404).json({
        success: false,
        message: 'Response not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Response status updated successfully',
      data: response
    });
  } catch (error) {
    console.error('Update response status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating response status',
      error: error.message
    });
  }
};

// Get response statistics
exports.getResponseStats = async (req, res) => {
  try {
    const [total, pending, submitted, approved, rejected] = await Promise.all([
      UserResponse.countDocuments(),
      UserResponse.countDocuments({ status: 'pending' }),
      UserResponse.countDocuments({ status: 'submitted' }),
      UserResponse.countDocuments({ status: 'approved' }),
      UserResponse.countDocuments({ status: 'rejected' })
    ]);
    
    res.json({
      success: true,
      data: {
        total,
        byStatus: {
          pending,
          submitted,
          approved,
          rejected
        }
      }
    });
  } catch (error) {
    console.error('Get response stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching response statistics',
      error: error.message
    });
  }
};

