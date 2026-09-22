require('dotenv').config();

/**
 * Feature Flags Configuration
 * Controls isolated experimental features across the application.
 */
const features = {
  // Flexible Weekly Targets (e.g. 3x/week target tracking)
  EXPERIMENT_WEEKLY_TARGETS: process.env.EXPERIMENT_WEEKLY_TARGETS !== 'false',
  // Multiple Check-Ins per Day (Quantifiable Target Logging e.g. 8 glasses of water)
  EXPERIMENT_QUANTIFIABLE_HABITS: process.env.EXPERIMENT_QUANTIFIABLE_HABITS !== 'false',
  // Habit Categories, Tags, and Dashboard Filtering
  EXPERIMENT_CATEGORIES_TAGS: process.env.EXPERIMENT_CATEGORIES_TAGS !== 'false',
  // Summary KPI Dashboard: Lightweight Top-Level Statistics
  EXPERIMENT_KPI_DASHBOARD: process.env.EXPERIMENT_KPI_DASHBOARD !== 'false',
  // To-Do List Integration (Habitica One-Off Tasks)
  EXPERIMENT_TODOS: process.env.EXPERIMENT_TODOS !== 'false'
};

module.exports = features;
