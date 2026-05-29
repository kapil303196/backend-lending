const UserResponse = require("../models/UserResponse");
const MCA = require("../models/MCA");
const User = require("../models/User");
const emailService = require("../services/emailService");

// Get all user responses (with pagination and filters)
exports.getAllResponses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      mcaId,
      uniqueId,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isActive: true };

    if (status) {
      query.status = status;
    }

    if (mcaId) {
      query.mcaId = mcaId;
    }

    if (uniqueId) {
      query.uniqueId = new RegExp(`^${uniqueId}$`, 'i'); // Case-insensitive search
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Handle different sort fields
    let sort = {};
    const order = sortOrder === "asc" ? 1 : -1;

    switch (sortBy) {
      case "amount":
        // Sort by requested amount (stored in formData.amountRequested)
        sort = { "formData.amountRequested": order };
        break;
      case "revenue":
        // Sort by monthly revenue (stored in formData.monthlyRevenue)
        sort = { "formData.monthlyRevenue": order };
        break;
      case "uniqueId":
        sort = { uniqueId: order };
        break;
      case "status":
        sort = { status: order };
        break;
      case "createdAt":
      default:
        sort = { createdAt: order };
        break;
    }

    const [responses, total] = await Promise.all([
      UserResponse.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate("mcaId"),
      UserResponse.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: responses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get all responses error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user responses",
      error: error.message,
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
        message: "MCA record not found",
      });
    }

    // Get all responses for this MCA
    const responses = await UserResponse.find({ mcaId: mca._id }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: responses,
    });
  } catch (error) {
    console.error("Get responses by MCA error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching responses for MCA",
      error: error.message,
    });
  }
};

// Get single response by ID
exports.getResponseById = async (req, res) => {
  try {
    const { id } = req.params;

    const response = await UserResponse.findById(id).populate("mcaId");

    if (!response) {
      return res.status(404).json({
        success: false,
        message: "Response not found",
      });
    }

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Get response by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching response",
      error: error.message,
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
        message: "uniqueId is required",
      });
    }

    // Validate email is provided
    if (!responseData.formData?.businessEmail) {
      return res.status(400).json({
        success: false,
        message: "Email is required in formData",
      });
    }

    // Find the MCA record (case-insensitive uniqueId search)
    const mca = await MCA.findOne({ uniqueId: new RegExp(`^${uniqueId}$`, 'i') });

    if (!mca) {
      return res.status(404).json({
        success: false,
        message: "MCA record not found with provided uniqueId",
      });
    }

    if (!mca.isActive) {
      return res.status(400).json({
        success: false,
        message: "This MCA record is no longer active",
      });
    }

    // Parse bank statements if they come as string (from frontend)
    let bankStatementsArray = [];
    if (bankStatements) {
      bankStatementsArray =
        typeof bankStatements === "string"
          ? JSON.parse(bankStatements)
          : bankStatements;
    }

    // Get IP address (handle proxy headers)
    const ipAddress = req.headers["x-forwarded-for"]
      ? req.headers["x-forwarded-for"].split(",")[0].trim()
      : req.ip || req.connection.remoteAddress;

    // Create the response
    const userResponse = new UserResponse({
      mcaId: mca._id,
      uniqueId: uniqueId,
      ...responseData,
      bankStatements: bankStatementsArray,
      ipAddress: ipAddress,
      userAgent: req.get("user-agent"),
    });

    await userResponse.save();

    // Add response ID to MCA record
    mca.userResponses.push(userResponse._id);
    await mca.save();

    // Generate temporary password
    const tempPassword = this.generateTemporaryPassword();

    // Create user account (or update if exists)
    let user;
    let isNewUser = false;

    const existingUser = await User.findOne({
      email: responseData.formData.businessEmail.toLowerCase(),
    });

    if (existingUser) {
      // Add new application to existing user's applications array
      if (!existingUser.userResponseIds.includes(userResponse._id)) {
        existingUser.userResponseIds.push(userResponse._id);
      }
      existingUser.name =
        responseData.formData.ownerName ||
        responseData.formData.businessName ||
        existingUser.name;
      existingUser.businessName =
        responseData.formData.businessName || existingUser.businessName;
      existingUser.phone = responseData.formData.phone || existingUser.phone;
      await existingUser.save();
      user = existingUser;
      console.log(
        `✅ Added new application to existing user account for ${responseData.formData.businessEmail}`
      );
    } else {
      // Create new user account
      user = new User({
        email: responseData.formData.businessEmail.toLowerCase(),
        password: tempPassword,
        name:
          responseData.formData.ownerName ||
          responseData.formData.businessName ||
          "User",
        businessName: responseData.formData.businessName || "",
        phone: responseData.formData.phone || "",
        role: "user",
        userResponseIds: [userResponse._id],
        isFirstLogin: true,
      });

      await user.save();
      isNewUser = true;
      console.log(
        `✅ Created new user account for ${responseData.formData.businessEmail}`
      );
    }

    // Send welcome email with credentials (only for new users)

    try {
      await emailService.sendWelcomeEmail(responseData.formData.businessEmail, {
        name:
          responseData.formData.businessName ||
          responseData.formData.ownerName ||
          "Valued Customer",
        email: responseData.formData.businessEmail,
        password: tempPassword,
        uniqueId: uniqueId,
      });

      console.log(
        `✅ Welcome email sent successfully to ${responseData.formData.businessEmail}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to send welcome email to ${responseData.formData.businessEmail}`
      );
      console.error(
        "Full error details:",
        JSON.stringify(error, Object.getOwnPropertyNames(error))
      );
      console.error("Stack trace:", error.stack);
      // Don't fail the request if email fails - log it for admin review
    }

    // Send admin notification email
    try {
      await emailService.sendAdminUserResponseNotification(userResponse);
      console.log(`✅ Admin notification emails sent successfully for application ${uniqueId}`);
    } catch (adminEmailError) {
      console.error(`❌ Failed to send admin notification email for application ${uniqueId}:`, adminEmailError.message);
      // Don't fail the main request if notification email fails
    }

    res.status(201).json({
      success: true,
      message: "Response submitted successfully",
      data: {
        userResponse,
        userCreated: isNewUser,
        userId: user._id,
      },
    });
  } catch (error) {
    console.error("Create response error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating response",
      error: error.message,
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
        message: "Response not found",
      });
    }

    res.json({
      success: true,
      message: "Response updated successfully",
      data: response,
    });
  } catch (error) {
    console.error("Update response error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating response",
      error: error.message,
    });
  }
};

// Delete user response (soft delete)
exports.deleteResponse = async (req, res) => {
  try {
    const { id } = req.params;

    const response = await UserResponse.findById(id);

    if (!response) {
      return res.status(404).json({
        success: false,
        message: "Response not found",
      });
    }

    if (!response.isActive) {
      return res.status(400).json({
        success: false,
        message: "Response is already deleted",
      });
    }

    // Soft delete - set isActive to false
    response.isActive = false;
    await response.save();

    res.json({
      success: true,
      message: "Response deleted successfully",
    });
  } catch (error) {
    console.error("Delete response error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting response",
      error: error.message,
    });
  }
};

// Update response status
exports.updateResponseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["pending", "submitted", "approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    const response = await UserResponse.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    ).populate("mcaId");

    if (!response) {
      return res.status(404).json({
        success: false,
        message: "Response not found",
      });
    }

    // Send status update email (async, don't block response)
    // if (response.formData?.email) {
    //   const statusMessages = {
    //     approved: 'Congratulations! Your application has been approved. Our team will contact you shortly with next steps.',
    //     rejected: 'We regret to inform you that your application has been rejected. Please contact our support team for more information.',
    //     pending: 'Your application is currently under review. We will notify you once a decision has been made.',
    //     submitted: 'Your application has been successfully submitted and is being processed.'
    //   };

    //   emailService.sendStatusUpdateEmail(response.formData.email, {
    //     name: response.formData.businessName || response.formData.ownerName || 'Valued Customer',
    //     uniqueId: response.uniqueId,
    //     status: status,
    //     message: statusMessages[status]
    //   }).then(result => {
    //     console.log(`✅ Status update email sent to ${response.formData.email}`);
    //   }).catch(error => {
    //     console.error(`❌ Failed to send status update email:`, error.message);
    //   });
    // }

    res.json({
      success: true,
      message: "Response status updated successfully",
      data: response,
    });
  } catch (error) {
    console.error("Update response status error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating response status",
      error: error.message,
    });
  }
};

// Get detailed statistics for dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    // 1. Status counts (only active records)
    const [total, pending, submitted, approved, rejected] = await Promise.all([
      UserResponse.countDocuments({ isActive: true }),
      UserResponse.countDocuments({ status: "pending", isActive: true }),
      UserResponse.countDocuments({ status: "submitted", isActive: true }),
      UserResponse.countDocuments({ status: "approved", isActive: true }),
      UserResponse.countDocuments({ status: "rejected", isActive: true }),
    ]);

    // 2. Funding asked per day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const fundingPerDay = await UserResponse.aggregate([
      {
        $match: {
          isActive: true,
          createdAt: { $gte: thirtyDaysAgo },
          "formData.amountRequested": { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalAmount: {
            $sum: {
              $convert: {
                input: {
                  $replaceAll: {
                    input: { $toString: "$formData.amountRequested" },
                    find: ",",
                    replacement: "",
                  },
                },
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 3. Total Asked vs Approved vs Rejected Amounts
    const amountStats = await UserResponse.aggregate([
      {
        $match: {
          isActive: true,
          "formData.amountRequested": { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          totalAsked: {
            $sum: {
              $convert: {
                input: {
                  $replaceAll: {
                    input: { $toString: "$formData.amountRequested" },
                    find: ",",
                    replacement: "",
                  },
                },
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
          totalApproved: {
            $sum: {
              $cond: [
                { $eq: ["$status", "approved"] },
                {
                  $convert: {
                    input: {
                      $replaceAll: {
                        input: { $toString: "$formData.amountRequested" },
                        find: ",",
                        replacement: "",
                      },
                    },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                0,
              ],
            },
          },
          totalRejected: {
            $sum: {
              $cond: [
                { $eq: ["$status", "rejected"] },
                {
                  $convert: {
                    input: {
                      $replaceAll: {
                        input: { $toString: "$formData.amountRequested" },
                        find: ",",
                        replacement: "",
                      },
                    },
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                0,
              ],
            },
          },
        },
      },
    ]);

    // 4. Total Revenue vs Total Lending (Total Asked)
    const revenueVsLending = await UserResponse.aggregate([
      {
        $match: {
          isActive: true,
          "formData.amountRequested": { $exists: true, $ne: null },
          "formData.monthlyRevenue": { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $convert: {
                input: {
                  $replaceAll: {
                    input: { $toString: "$formData.monthlyRevenue" },
                    find: ",",
                    replacement: "",
                  },
                },
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
          totalLending: {
            $sum: {
              $convert: {
                input: {
                  $replaceAll: {
                    input: { $toString: "$formData.amountRequested" },
                    find: ",",
                    replacement: "",
                  },
                },
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        statusCounts: {
          total,
          pending,
          submitted,
          approved,
          rejected,
        },
        fundingPerDay,
        amountStats: amountStats[0] || {
          totalAsked: 0,
          totalApproved: 0,
          totalRejected: 0,
        },
        revenueVsLending: revenueVsLending[0] || {
          totalRevenue: 0,
          totalLending: 0,
        },
      },
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard statistics",
      error: error.message,
    });
  }
};

// Get response statistics (Legacy - keeping for backward compatibility)
exports.getResponseStats = async (req, res) => {
  try {
    const [total, pending, submitted, approved, rejected] = await Promise.all([
      UserResponse.countDocuments({ isActive: true }),
      UserResponse.countDocuments({ status: "pending", isActive: true }),
      UserResponse.countDocuments({ status: "submitted", isActive: true }),
      UserResponse.countDocuments({ status: "approved", isActive: true }),
      UserResponse.countDocuments({ status: "rejected", isActive: true }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        byStatus: {
          pending,
          submitted,
          approved,
          rejected,
        },
      },
    });
  } catch (error) {
    console.error("Get response stats error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching response statistics",
      error: error.message,
    });
  }
};

// Helper function to generate temporary password
exports.generateTemporaryPassword = () => {
  const length = 12;
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";

  // Ensure at least one of each type
  password += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random() * 26)]; // Uppercase
  password += "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]; // Lowercase
  password += "0123456789"[Math.floor(Math.random() * 10)]; // Number
  password += "!@#$%^&*"[Math.floor(Math.random() * 8)]; // Special char

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }

  // Shuffle the password
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
};
