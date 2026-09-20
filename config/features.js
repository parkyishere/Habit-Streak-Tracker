require('dotenv').config();

/**
 * Feature Flags Configuration
 * Controls isolated experimental features across the application.
 */
const features = {
  // Flexible Weekly Targets (e.g. 3x/week target tracking)
  EXPERIMENT_WEEKLY_TARGETS: process.env.EXPERIMENT_WEEKLY_TARGETS !== 'false',
  // Multiple Check-Ins per Day (Quantifiable Target Logging e.g. 8 glasses of water)
  EXPERIMENT_QUANTIFIABLE_HABITS: process.env.EXPERIMENT_QUANTIFIABLE_HABITS !== 'false'
};

module.exports = features;
