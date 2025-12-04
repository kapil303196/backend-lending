const UserResponse = require('../models/UserResponse');
const DealerOffer = require('../models/DealerOffer');

/**
 * Get all rejected offers visible to the current dealer with filtering and pagination.
 * Dealers can only SEE rejected offers; they cannot change the main offer/response.
 */
exports.getRejectedOffers = async (req, res) => {
  try {
    const dealerId = req.user.id;
    const { 
      page = 1, 
      limit = 20,
      internalStatus 
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // First, get all rejected responses
    let responsesQuery = UserResponse.find({ status: 'rejected' })
      .sort({ createdAt: -1 })
      .populate('mcaId');

    // Get all responses first to check dealer metadata
    const allResponses = await responsesQuery.exec();
    const responseIds = allResponses.map(r => r._id);

    // Fetch existing dealer metadata for these responses
    const dealerOffers = await DealerOffer.find({
      dealerId,
      userResponseId: { $in: responseIds }
    });

    const dealerMap = new Map();
    dealerOffers.forEach(offer => {
      dealerMap.set(offer.userResponseId.toString(), offer);
    });

    // Map responses with dealer metadata
    let data = allResponses.map(r => {
      const meta = dealerMap.get(r._id.toString());
      return {
        response: r,
        dealerMeta: meta ? {
          id: meta._id,
          internalStatus: meta.internalStatus,
          internalStatusUpdatedAt: meta.internalStatusUpdatedAt,
          internalStatusUpdatedByEmail: meta.internalStatusUpdatedByEmail,
          internalStatusUpdatedByName: meta.internalStatusUpdatedByName,
          notes: meta.notes,
          statusHistory: meta.statusHistory || []
        } : null
      };
    });

    // Filter by internal status if provided
    if (internalStatus) {
      if (internalStatus === 'none' || internalStatus === '') {
        // Show only offers without dealer metadata or without status
        data = data.filter(item => !item.dealerMeta || !item.dealerMeta.internalStatus);
      } else {
        // Show only offers with matching internal status
        data = data.filter(item => item.dealerMeta?.internalStatus === internalStatus);
      }
    }

    // Get total count before pagination
    const total = data.length;

    // Apply pagination
    const paginatedData = data.slice(skip, skip + limitNum);

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Dealer getRejectedOffers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching rejected offers for dealer',
      error: error.message
    });
  }
};

/**
 * Upsert dealer-only metadata (internal status + notes) for a given rejected offer.
 * This NEVER changes the underlying UserResponse or its status.
 */
exports.upsertDealerOffer = async (req, res) => {
  try {
    const dealerId = req.user.id;
    const { responseId } = req.params;
    const { internalStatus, note } = req.body;

    // Ensure the response exists and is rejected
    const userResponse = await UserResponse.findById(responseId);

    if (!userResponse) {
      return res.status(404).json({
        success: false,
        message: 'Offer (response) not found'
      });
    }

    if (userResponse.status !== 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'Dealer metadata can only be attached to rejected offers'
      });
    }

    const update = {};

    if (internalStatus) {
      // Check if status is actually changing
      const existingOffer = await DealerOffer.findOne({
        dealerId,
        userResponseId: userResponse._id
      });

      // Only add to history if status is different
      if (!existingOffer || existingOffer.internalStatus !== internalStatus) {
        if (!update.$push) {
          update.$push = {};
        }
        update.$push.statusHistory = {
          status: internalStatus,
          changedAt: new Date(),
          changedBy: dealerId,
          changedByEmail: req.user.email,
          changedByName: req.user.name || ''
        };
      }

      update.internalStatus = internalStatus;
      update.internalStatusUpdatedAt = new Date();
      update.internalStatusUpdatedBy = dealerId;
      update.internalStatusUpdatedByEmail = req.user.email;
      update.internalStatusUpdatedByName = req.user.name || '';
    }

    if (note && note.trim()) {
      if (!update.$push) {
        update.$push = {};
      }
      update.$push.notes = {
        text: note.trim(),
        createdBy: dealerId,
        createdByEmail: req.user.email,
        createdByName: req.user.name || ''
      };
    }

    const dealerOffer = await DealerOffer.findOneAndUpdate(
      { dealerId, userResponseId: userResponse._id },
      {
        $setOnInsert: {
          dealerId,
          userResponseId: userResponse._id,
          uniqueId: userResponse.uniqueId
        },
        ...update
      },
      {
        new: true,
        upsert: true
      }
    );

    res.json({
      success: true,
      message: 'Dealer metadata saved successfully',
      data: dealerOffer
    });
  } catch (error) {
    console.error('Dealer upsertDealerOffer error:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving dealer metadata for offer',
      error: error.message
    });
  }
};


