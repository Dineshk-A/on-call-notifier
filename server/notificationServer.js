#!/usr/bin/env node

// Notification Server
// Runs the shift scheduler service to send Slack notifications

const express = require('express');
const cors = require('cors');
const path = require('path');
const ShiftSchedulerService = require('../src/services/shiftSchedulerService');
const VersionedScheduleService = require('../src/services/versionedScheduleService');
const { calculateCurrentAssignment } = require('../src/utils/scheduleLoader.node');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const shiftScheduler = new ShiftSchedulerService();
const versionedScheduler = new VersionedScheduleService();

// Initialize versioned schedule service
versionedScheduler.initialize().catch(console.error);

// API Routes
app.get('/api/status', (req, res) => {
  const status = shiftScheduler.getStatus();
  res.json({
    success: true,
    data: status,
    timestamp: new Date().toISOString()
  });
});

// Debug: who is on-call now (and next/after) without sending Slack
app.get('/api/debug/current', (req, res) => {
  try {
    const nowParam = req.query.now; // optional ISO string
    const now = nowParam ? new Date(nowParam) : new Date();

    const active = shiftScheduler.getCurrentActiveLayer(now);
    if (!active) {
      return res.json({ success: true, data: { active: null, message: 'No active layer at this time' }, timestamp: new Date().toISOString() });
    }

    const overrides = shiftScheduler.loadOverrides();
    const assignment = calculateCurrentAssignment(active.config, now, overrides, active.layerKey);

    // Use same next-in-sequence logic as Slack notifications
    const next = shiftScheduler.getNextShiftsInSequence(active.layerKey, now, overrides, 2);

    // End time for the currently active shift
    const endTime = shiftScheduler.calculateCurrentShiftEndTime(active.layerKey, now);

    res.json({
      success: true,
      data: {
        now: now.toISOString(),
        activeLayerKey: active.layerKey,
        activeLayerName: active.config.display_name,
        currentPerson: assignment.person,
        currentIsOverride: assignment.isOverride || false,
        currentEndsAtUtc: endTime.toISOString(),
        next
      },
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'debug error', error: e.message });
  }
});

app.post('/api/start', async (req, res) => {
  try {
    await shiftScheduler.start();
    res.json({
      success: true,
      message: 'Shift scheduler started successfully',
      data: shiftScheduler.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to start shift scheduler',
      error: error.message
    });
  }
});

app.post('/api/stop', (req, res) => {
  try {
    shiftScheduler.stop();
    res.json({
      success: true,
      message: 'Shift scheduler stopped successfully',
      data: shiftScheduler.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to stop shift scheduler',
      error: error.message
    });
  }
});

app.post('/api/test-slack', async (req, res) => {
  try {
    const testResult = await shiftScheduler.slackService.testConnection();
    res.json({
      success: testResult,
      message: testResult ? 'Slack connection successful' : 'Slack connection failed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to test Slack connection',
      error: error.message
    });
  }
});

app.post('/api/send-test-notification', async (req, res) => {
  try {
    const now = new Date();
    const scheduleData = shiftScheduler.scheduleData;

    if (!scheduleData) {
      return res.status(500).json({
        success: false,
        message: 'Schedule data not loaded',
        error: 'No schedule data available'
      });
    }

    // Determine current active layer based on current time
    const currentActiveLayer = shiftScheduler.getCurrentActiveLayer(now);

    if (!currentActiveLayer) {
      return res.status(500).json({
        success: false,
        message: 'No active shift found',
        error: 'Could not determine current active shift'
      });
    }

    // Send notification for the current active layer
    await shiftScheduler.sendShiftNotification(now, currentActiveLayer.config, currentActiveLayer.layerKey);

    res.json({
      success: true,
      message: 'Current on-call notification sent successfully',
      data: {
        layerKey: currentActiveLayer.layerKey,
        shiftName: currentActiveLayer.config.display_name,
        currentTime: now.toISOString()
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Test notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send current on-call notification',
      error: error.message
    });
  }
});

// API endpoint to sync overrides from frontend to backend
app.post('/api/sync-overrides', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const overrides = req.body.overrides || {};

    const overridesPath = path.join(__dirname, '../public/redis-sre/overrides/overrides.json');
    fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2));

    res.json({
      success: true,
      message: 'Overrides synced successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to sync overrides',
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Redis On-Call Notification Server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Historical API endpoints
app.get('/api/history/assignment/:date/:layer', async (req, res) => {
  try {
    const { date, layer } = req.params;
    const assignment = await versionedScheduler.getAssignmentForDate(date, layer);

    res.json({
      success: true,
      data: assignment,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get historical assignment',
      error: error.message
    });
  }
});

app.get('/api/history/schedule/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const scheduleInfo = await versionedScheduler.getScheduleForDate(date);

    res.json({
      success: true,
      data: scheduleInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get historical schedule',
      error: error.message
    });
  }
});

app.get('/api/history/versions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const versions = await versionedScheduler.getVersionHistory(limit);

    res.json({
      success: true,
      data: versions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get version history',
      error: error.message
    });
  }
});

app.post('/api/history/create-version', async (req, res) => {
  try {
    const { description, createdBy } = req.body;
    const version = await versionedScheduler.createNewVersion(description, createdBy);

    res.json({
      success: true,
      data: version,
      message: 'New schedule version created',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create new version',
      error: error.message
    });
  }
});

app.post('/api/history/cleanup', async (req, res) => {
  try {
    const monthsToKeep = parseInt(req.body.monthsToKeep) || 6;
    await versionedScheduler.cleanup(monthsToKeep);

    res.json({
      success: true,
      message: `Cleanup completed, keeping ${monthsToKeep} months of data`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup old data',
      error: error.message
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  shiftScheduler.stop();
  versionedScheduler.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  shiftScheduler.stop();
  versionedScheduler.close();
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Redis On-Call Notification Server running on port ${PORT}`);
  console.log(`📊 Status endpoint: http://localhost:${PORT}/api/status`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  
  // Auto-start the shift scheduler
  try {
    console.log('🔄 Starting shift scheduler...');
    await shiftScheduler.start();
    console.log('✅ Shift scheduler started automatically');
    console.log('🔕 Test notification disabled - notifications will be sent at scheduled times');
  } catch (error) {
    console.error('❌ Failed to auto-start shift scheduler:', error.message);
    console.log('💡 You can manually start it via POST /api/start');
  }
});

module.exports = app;
