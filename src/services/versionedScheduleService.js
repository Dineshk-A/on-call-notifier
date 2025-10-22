const { loadScheduleData, calculateCurrentAssignment } = require('../utils/scheduleLoader.node');
const HistoryService = require('./historyService');
const fs = require('fs');
const path = require('path');

class VersionedScheduleService {
  constructor() {
    this.historyService = new HistoryService();
    this.currentSchedule = null;
    this.currentVersion = null;
  }
  /**
   * Compute earliest effective date from schedule YAML (YYYY-MM-DD)
   */
  getEarliestEffectiveDate(schedule) {
    try {
      const dates = [];
      const addDate = (iso) => {
        if (!iso) return;
        // Take date portion in the schedule's own tz (ISO has offset; we can safely use the date part)
        const dStr = String(iso).split('T')[0];
        if (dStr && /^\d{4}-\d{2}-\d{2}$/.test(dStr)) dates.push(dStr);
      };
      if (schedule && schedule.weekday) {
        Object.values(schedule.weekday).forEach(layer => addDate(layer && layer.start_time));
      }
      if (schedule && schedule.weekend) {
        Object.values(schedule.weekend).forEach(layer => addDate(layer && layer.start_time));
      }
      dates.sort(); // lexicographic works for YYYY-MM-DD
      return dates.length ? dates[0] : null;
    } catch (e) {
      return null;
    }
  }


  /**
   * Initialize the service and check for schedule changes
   */
  async initialize() {
    try {
      // Wait for history service to be fully initialized
      await this.historyService.initDatabase();
      await this.loadCurrentSchedule();
      await this.checkForScheduleChanges();
      console.log('✅ Versioned schedule service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize versioned schedule service:', error);
    }
  }

  /**
   * Load current schedule from YAML
   */
  async loadCurrentSchedule() {
    try {
      this.currentSchedule = await loadScheduleData();
      console.log('📅 Current schedule loaded');
    } catch (error) {
      console.error('❌ Failed to load current schedule:', error);
      throw error;
    }
  }

  /**
   * Check if schedule has changed and create new version if needed
   */
  async checkForScheduleChanges() {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const latestVersion = await this.historyService.getScheduleForDate(today);

      if (!latestVersion) {
        // First time setup - create initial version using earliest start_time date (or today)
        const earliest = this.getEarliestEffectiveDate(this.currentSchedule) || today;
        console.log('🆕 Creating initial schedule version', { effectiveDate: earliest });
        this.currentVersion = await this.historyService.createScheduleVersion(
          this.currentSchedule,
          earliest,
          'Initial schedule version',
          'system'
        );
        return;
      }

      // Compare current schedule with latest version
      const currentHash = this.hashSchedule(this.currentSchedule);
      const latestHash = this.hashSchedule(latestVersion.schedule_data);

      if (currentHash !== latestHash) {
        console.log('🔄 Schedule changes detected, creating new version');
        this.currentVersion = await this.historyService.createScheduleVersion(
          this.currentSchedule,
          today,
          'Schedule updated',
          'system'
        );
      } else {
        this.currentVersion = {
          id: latestVersion.id,
          versionName: latestVersion.version_name,
          effectiveDate: latestVersion.effective_date
        };
        console.log(`✅ Using existing schedule version: ${latestVersion.version_name}`);
      }
    } catch (error) {
      console.error('❌ Error checking schedule changes:', error);
    }
  }

  /**
   * Get schedule for a specific date (historical or current)
   */
  async getScheduleForDate(targetDate) {
    try {
      const dateString = typeof targetDate === 'string' ? targetDate : targetDate.toISOString().split('T')[0];

      // Try to get historical version first
      const historicalVersion = await this.historyService.getScheduleForDate(dateString);

      if (historicalVersion) {
        return {
          schedule: historicalVersion.schedule_data,
          version: {
            id: historicalVersion.id,
            name: historicalVersion.version_name,
            effectiveDate: historicalVersion.effective_date
          }
        };
      }

      // Fallback to current schedule
      return {
        schedule: this.currentSchedule,
        version: this.currentVersion
      };
    } catch (error) {
      console.error('❌ Error getting schedule for date:', error);
      return {
        schedule: this.currentSchedule,
        version: this.currentVersion
      };
    }
  }

  /**
   * Get or calculate assignment for a specific date and layer
   */
  async getAssignmentForDate(date, layerKey) {
    try {
      const dateString = typeof date === 'string' ? date : date.toISOString().split('T')[0];

      // Check if we have historical assignment
      const historical = await this.historyService.getHistoricalAssignment(dateString, layerKey);
      if (historical) {
        return {
          person: historical.person,
          isHistorical: true,
          versionId: historical.version_id,
          overrideId: historical.override_id
        };
      }

      // Calculate assignment using appropriate schedule version
      const { schedule, version } = await this.getScheduleForDate(dateString);
      // Load overrides for the month of the target date (YYYY-MM)
      const month = dateString.substring(0, 7);
      const overrides = await this.getOverrides(month);
      const assignment = this.calculateAssignment(schedule, date, layerKey, overrides);

      // Store this assignment for future historical reference
      if (assignment && version) {
        await this.historyService.storeHistoricalAssignment(
          dateString,
          layerKey,
          assignment.person,
          version.id,
          assignment.overrideId || null
        );
      }

      return {
        ...assignment,
        isHistorical: false,
        versionId: version?.id
      };
    } catch (error) {
      console.error('❌ Error getting assignment for date:', error);
      return null;
    }
  }

  /**
   * Calculate assignment using schedule data and rotation logic
   */
  calculateAssignment(schedule, date, layerKey, overrides = {}) {
    try {
      // Use the same timezone-aware rotation logic as the scheduler
      const layer = (schedule.weekday && schedule.weekday[layerKey]) || (schedule.weekend && schedule.weekend[layerKey]);
      if (!layer) return null;
      const result = calculateCurrentAssignment(layer, new Date(date), overrides, layerKey) || {};
      return {
        person: result.person || 'Unknown',
        layerKey,
        date,
        isOverride: !!result.isOverride
      };
    } catch (error) {
      console.error('❌ Error calculating assignment:', error);
      return null;
    }
  }

  /**
   * Store monthly overrides
   */
  async storeOverrides(month, overrides) {
    try {
      await this.historyService.storeMonthlyOverrides(month, overrides);
      console.log(`✅ Stored overrides for ${month}`);
    } catch (error) {
      console.error('❌ Error storing overrides:', error);
    }
  }

  /**
   * Get overrides for a specific month
   */
  async getOverrides(month) {
    try {
      const result = await this.historyService.getMonthlyOverrides(month);
      return result ? result.override_data : {};
    } catch (error) {
      console.error('❌ Error getting overrides:', error);
      return {};
    }
  }

  /**
   * Force create a new schedule version (for manual versioning)
   */
  async createNewVersion(description = 'Manual version creation', createdBy = 'user') {
    try {
      await this.loadCurrentSchedule(); // Reload current schedule
      const today = new Date().toISOString().split('T')[0];

      this.currentVersion = await this.historyService.createScheduleVersion(
        this.currentSchedule,
        today,
        description,
        createdBy
      );

      console.log(`✅ Created new schedule version: ${this.currentVersion.versionName}`);
      return this.currentVersion;
    } catch (error) {
      console.error('❌ Error creating new version:', error);
      throw error;
    }
  }

  /**
   * Get version history
   */
  async getVersionHistory(limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT id, version_name, effective_date, created_at, created_by, description, is_active
        FROM schedule_versions
        ORDER BY created_at DESC
        LIMIT ?`;

      this.historyService.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  /**
   * Cleanup old data
   */
  async cleanup(monthsToKeep = 6) {
    try {
      await this.historyService.cleanupOldData(monthsToKeep);
      console.log(`🧹 Cleanup completed, keeping ${monthsToKeep} months of data`);
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }

  /**
   * Create a simple hash of schedule data for change detection
   */
  hashSchedule(schedule) {
    const crypto = require('crypto');
    const scheduleString = JSON.stringify(schedule, Object.keys(schedule).sort());
    return crypto.createHash('md5').update(scheduleString).digest('hex');
  }

  /**
   * Close database connections
   */
  close() {
    if (this.historyService) {
      this.historyService.close();
    }
  }
}

module.exports = VersionedScheduleService;
