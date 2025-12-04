const UserResponse = require('../models/UserResponse');
const DealerOffer = require('../models/DealerOffer');

/**
 * Get all rejected offers visible to the current dealer.
 * Dealers can only SEE rejected offers; they cannot change the main offer/response.
 */
exports.getRejectedOffers = async (req, res) => {
  try {
    const dealerId = req.user.id;

    // Find all rejected responses
    const responses = await UserResponse.find({ status: 'rejected' })
      .sort({ createdAt: -1 })
      .populate('mcaId');

    const responseIds = responses.map(r => r._id);

    // Fetch existing dealer metadata for these responses
    const dealerOffers = await DealerOffer.find({
      dealerId,
      userResponseId: { $in: responseIds }
    });

    const dealerMap = new Map();
    dealerOffers.forEach(offer => {
      dealerMap.set(offer.userResponseId.toString(), offer);
    });

    const data = responses.map(r => {
      const meta = dealerMap.get(r._id.toString());
      return {
        response: r,
        dealerMeta: meta ? {
          id: meta._id,
          internalStatus: meta.internalStatus,
          internalStatusUpdatedAt: meta.internalStatusUpdatedAt,
          internalStatusUpdatedByEmail: meta.internalStatusUpdatedByEmail,
          internalStatusUpdatedByName: meta.internalStatusUpdatedByName,
          notes: meta.notes
        } : null
      };
    });

    res.json({
      success: true,
      data
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
      update.internalStatus = internalStatus;
      update.internalStatusUpdatedAt = new Date();
      update.internalStatusUpdatedBy = dealerId;
      update.internalStatusUpdatedByEmail = req.user.email;
      update.internalStatusUpdatedByName = req.user.name || '';
    }

    if (note && note.trim()) {
      update.$push = {
        notes: {
          text: note.trim(),
          createdBy: dealerId,
          createdByEmail: req.user.email,
          createdByName: req.user.name || ''
        }
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


