const mongoose = require('mongoose');

const adminConfigSchema = new mongoose.Schema({
  // Singleton identifier
  configId: { type: String, default: 'default', unique: true },
  
  // Page Visibility
  pages: {
    overview: { type: Boolean, default: true },
    applications: { type: Boolean, default: true }
  },

  // Overview Page Charts
  charts: {
    statusDistribution: { type: Boolean, default: true }, // Doughnut
    fundingTrend: { type: Boolean, default: true },       // Line chart
    amountDistribution: { type: Boolean, default: true }, // Bar chart
    revenueVsLending: { type: Boolean, default: true }    // Pie chart
  },

  // Application List Filters
  filters: {
    search: { type: Boolean, default: true },
    statusDropdown: { type: Boolean, default: true },
    sorting: { type: Boolean, default: true }
  },

  // Functional Permissions
  features: {
    allowStatusUpdate: { type: Boolean, default: true },
    viewSensitiveInfo: { type: Boolean, default: true } // e.g. SSN, DOB
  }
}, { timestamps: true });

module.exports = mongoose.model('AdminConfig', adminConfigSchema);

