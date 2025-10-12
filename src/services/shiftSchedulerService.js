// Shift Scheduler Service
// Monitors shift changes and triggers Slack notifications

const SlackNotificationService = require('./slackNotificationService');
const { loadScheduleData, calculateCurrentAssignment } = require('../utils/scheduleLoader');

class ShiftSchedulerService {
  constructor() {
    this.slackService = new SlackNotificationService();
    this.scheduleData = null;
    this.activeTimers = new Map();
    this.isRunning = false;
    this.checkInterval = null;
  }

  /**
   * Start the shift monitoring service
   */
  async start() {
    if (this.isRunning) {
      console.log('Shift scheduler already running');
      return;
    }

    try {
      // Load schedule data
      await this.loadSchedule();
      
      // Start monitoring
      this.isRunning = true;
      this.scheduleNextNotifications();
      
      // Check every minute for any missed notifications
      this.checkInterval = setInterval(() => {
        this.scheduleNextNotifications();
      }, 60000); // Check every minute

      console.log('🚀 Shift scheduler service started');
      console.log('🔕 Slack connection test disabled - use the admin panel to test manually');
      
    } catch (error) {
      console.error('Failed to start shift scheduler:', error);
      this.isRunning = false;
    }
  }

  /**
   * Stop the shift monitoring service
   */
  stop() {
    if (!this.isRunning) {
      console.log('Shift scheduler not running');
      return;
    }

    // Clear all active timers
    this.activeTimers.forEach(timer => clearTimeout(timer));
    this.activeTimers.clear();

    // Clear check interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isRunning = false;
    console.log('🛑 Shift scheduler service stopped');
  }

  /**
   * Load schedule data from YAML
   */
  async loadSchedule() {
    try {
      this.scheduleData = await loadScheduleData();
      console.log('📅 Schedule data loaded for shift monitoring');
    } catch (error) {
      console.error('Failed to load schedule data:', error);
      throw error;
    }
  }

  /**
   * Schedule notifications for upcoming shifts
   */
  scheduleNextNotifications() {
    if (!this.scheduleData) return;

    const now = new Date();
    const notificationWindow = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const minutesBefore = this.slackService.getConfig().minutesBefore;

    // Clear old timers
    this.activeTimers.forEach((timer, key) => {
      if (new Date(key) < now) {
        clearTimeout(timer);
        this.activeTimers.delete(key);
      }
    });

    // Schedule weekday shift notifications
    this.scheduleWeekdayNotifications(now, notificationWindow, minutesBefore);
    
    // Schedule weekend shift notifications
    this.scheduleWeekendNotifications(now, notificationWindow, minutesBefore);
  }

  /**
   * Schedule notifications for weekday shifts
   */
  scheduleWeekdayNotifications(now, notificationWindow, minutesBefore) {
    Object.entries(this.scheduleData.weekday).forEach(([layerKey, layerConfig]) => {
      const shiftStartTime = new Date(layerConfig.start_time);

      console.log(`🔍 Checking ${layerKey} (${layerConfig.display_name}):`, {
        shiftStartTime: shiftStartTime.toLocaleString(),
        now: now.toLocaleString()
      });

      // Calculate next occurrence of this shift
      const nextShiftTime = this.getNextShiftOccurrence(shiftStartTime, now);

      console.log(`📅 Next occurrence for ${layerKey}:`, nextShiftTime ? nextShiftTime.toLocaleString() : 'null');

      if (nextShiftTime && (nextShiftTime.getTime() - now.getTime()) <= notificationWindow) {
        console.log(`✅ Scheduling notification for ${layerKey}`);
        this.scheduleNotificationForShift(nextShiftTime, layerConfig, layerKey, minutesBefore);
      } else {
        console.log(`❌ Not scheduling ${layerKey} - outside notification window or null`);
      }
    });
  }

  /**
   * Schedule notifications for weekend shifts
   */
  scheduleWeekendNotifications(now, notificationWindow, minutesBefore) {
    Object.entries(this.scheduleData.weekend).forEach(([layerKey, layerConfig]) => {
      const shiftStartTime = new Date(layerConfig.start_time);
      
      // Calculate next occurrence of this weekend shift
      const nextShiftTime = this.getNextWeekendOccurrence(shiftStartTime, now);
      
      if (nextShiftTime && (nextShiftTime.getTime() - now.getTime()) <= notificationWindow) {
        this.scheduleNotificationForShift(nextShiftTime, layerConfig, layerKey, minutesBefore);
      }
    });
  }

  /**
   * Schedule a notification for a specific shift
   */
  scheduleNotificationForShift(shiftTime, layerConfig, layerKey, minutesBefore) {
    const notificationTime = new Date(shiftTime.getTime() - (minutesBefore * 60 * 1000));
    const now = new Date();

    if (notificationTime <= now) return; // Don't schedule past notifications

    const timerKey = `${layerKey}-${shiftTime.getTime()}`;
    
    // Don't schedule if already scheduled
    if (this.activeTimers.has(timerKey)) return;

    const timeUntilNotification = notificationTime.getTime() - now.getTime();
    
    const timer = setTimeout(() => {
      this.sendShiftNotification(shiftTime, layerConfig, layerKey);
      this.activeTimers.delete(timerKey);
    }, timeUntilNotification);

    this.activeTimers.set(timerKey, timer);
    
    console.log(`📅 Scheduled notification for ${layerConfig.display_name || layerKey} at ${notificationTime.toLocaleString()}`);
  }

  /**
   * Load overrides from file system (Node.js environment)
   */
  loadOverrides() {
    try {
      const fs = require('fs');
      const path = require('path');
      // Try multiple possible paths for overrides file
      const possiblePaths = [
        path.join(__dirname, '../../public/redis-sre/overrides/overrides.json'),
        path.join(__dirname, '../../production/redis-sre/overrides/overrides.json'),
        path.join(process.cwd(), 'public/redis-sre/overrides/overrides.json')
      ];

      for (const overridesPath of possiblePaths) {
        if (fs.existsSync(overridesPath)) {
          console.log(`📁 Loading overrides from: ${overridesPath}`);
          const overridesData = fs.readFileSync(overridesPath, 'utf8');
          const parsed = JSON.parse(overridesData);
          console.log(`✅ Loaded overrides:`, parsed);
          return parsed;
        }
      }

      console.log('⚠️ No overrides file found in any of the expected locations');
    } catch (error) {
      console.log('❌ Error reading overrides:', error.message);
    }

    return {}; // Return empty object if no overrides
  }

  /**
   * Get current active layer based on time
   * @param {Date} currentTime - Current time
   * @returns {Object|null} Current active layer info
   */
  getCurrentActiveLayer(currentTime) {
    const now = currentTime || new Date();

    // Check if it's weekend - dynamically check all weekend layers
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    if (isWeekend && this.scheduleData.weekend) {
      const weekendLayers = Object.entries(this.scheduleData.weekend);

      for (const [layerKey, layerConfig] of weekendLayers) {
        if (this.isCurrentTimeInWeekendShift(now, layerConfig)) {
          console.log(`✅ Current active weekend layer: ${layerConfig.display_name}`);
          return {
            layerKey,
            config: layerConfig
          };
        }
      }
    }

    // Check weekday layers dynamically based on schedule times
    if (this.scheduleData.weekday) {
      const layers = Object.entries(this.scheduleData.weekday);

      for (const [layerKey, layerConfig] of layers) {
        if (this.isCurrentTimeInShift(now, layerConfig)) {
          console.log(`✅ Current active layer: ${layerConfig.display_name}`);
          return {
            layerKey,
            config: layerConfig
          };
        }
      }
    }

    console.log('❌ No active layer found');
    return null;
  }

  /**
   * Check if current time falls within a weekend shift
   */
  isCurrentTimeInWeekendShift(currentTime, layerConfig) {
    // Extract timezone from start_time
    const startTime = new Date(layerConfig.start_time);
    const endTime = new Date(layerConfig.end_time);

    // Get timezone offset from the start_time string
    const timeZoneMatch = layerConfig.start_time.match(/([+-]\d{2}:\d{2})$/);
    const timeZoneOffset = timeZoneMatch ? timeZoneMatch[1] : '+00:00';

    // Convert current time to schedule timezone
    const scheduleTime = new Date(currentTime.toLocaleString("en-US", {timeZone: this.getTimezoneFromOffset(timeZoneOffset)}));

    console.log(`🕐 Checking Weekend ${layerConfig.display_name}: current=${scheduleTime.getHours()}:${scheduleTime.getMinutes().toString().padStart(2, '0')} (${scheduleTime.getMinutes() + scheduleTime.getHours() * 60}min)`);
    console.log(`🕐 Weekend shift: start=${startTime.toLocaleString()}, end=${endTime.toLocaleString()}`);

    // For weekend shifts, check if current time is within the weekend period
    const currentDay = scheduleTime.getDay();
    const isCurrentWeekend = currentDay === 0 || currentDay === 6; // Sunday or Saturday

    if (!isCurrentWeekend) {
      console.log(`❌ Not weekend: current day is ${currentDay}`);
      return false;
    }

    // Check if current time is within the weekend shift hours
    const currentHour = scheduleTime.getHours();
    const currentMinute = scheduleTime.getMinutes();
    const startHour = startTime.getHours();
    const startMinute = startTime.getMinutes();
    const endHour = endTime.getHours();
    const endMinute = endTime.getMinutes();

    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    // For weekend shifts that span multiple days, we consider the entire weekend period
    const isInWeekendShift = currentMinutes >= startMinutes || currentMinutes <= endMinutes;

    console.log(`🕐 Weekend shift check: ${isInWeekendShift ? '✅ ACTIVE' : '❌ NOT ACTIVE'}`);
    return isInWeekendShift;
  }

  /**
   * Check if current time falls within a shift's time range
   * @param {Date} currentTime - Current time
   * @param {Object} layerConfig - Layer configuration from schedule
   * @returns {boolean} True if current time is within shift
   */
  isCurrentTimeInShift(currentTime, layerConfig) {
    try {
      const startTime = new Date(layerConfig.start_time);
      const endTime = new Date(layerConfig.end_time);

      // Extract timezone from start_time (e.g., "+05:30" from "2025-09-25T09:30:00+05:30")
      const timezoneMatch = layerConfig.start_time.match(/([+-]\d{2}:\d{2})$/);
      const timezone = timezoneMatch ? timezoneMatch[1] : '+05:30'; // Default to IST

      // Convert current time to the schedule's timezone using proper timezone conversion
      // If schedule is in IST (+05:30), convert current time to IST
      const currentInScheduleTz = new Date(currentTime.toLocaleString("en-US", {timeZone: this.getTimezoneFromOffset(timezone)}));

      // Get time components for comparison
      const currentHour = currentInScheduleTz.getHours();
      const currentMinute = currentInScheduleTz.getMinutes();
      const currentTotalMinutes = currentHour * 60 + currentMinute;

      const startHour = startTime.getHours();
      const startMinute = startTime.getMinutes();
      const startTotalMinutes = startHour * 60 + startMinute;

      const endHour = endTime.getHours();
      const endMinute = endTime.getMinutes();
      const endTotalMinutes = endHour * 60 + endMinute;

      console.log(`🕐 Checking ${layerConfig.display_name}: current=${currentHour}:${currentMinute.toString().padStart(2, '0')} (${currentTotalMinutes}min), start=${startHour}:${startMinute.toString().padStart(2, '0')} (${startTotalMinutes}min), end=${endHour}:${endMinute.toString().padStart(2, '0')} (${endTotalMinutes}min)`);

      // Handle shifts that cross midnight (end time < start time)
      if (endTotalMinutes < startTotalMinutes) {
        // Shift crosses midnight (e.g., 21:30 to 03:30)
        return currentTotalMinutes >= startTotalMinutes || currentTotalMinutes < endTotalMinutes;
      } else {
        // Normal shift within same day
        return currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes;
      }
    } catch (error) {
      console.error(`Error checking shift time for ${layerConfig.display_name}:`, error);
      return false;
    }
  }

  /**
   * Convert timezone offset to timezone name for toLocaleString
   * @param {string} timezoneOffset - e.g., "+05:30" or "-08:00"
   * @returns {string} Timezone name
   */
  getTimezoneFromOffset(timezoneOffset) {
    // Map common timezone offsets to timezone names
    const timezoneMap = {
      '+05:30': 'Asia/Kolkata',
      '+00:00': 'UTC',
      '-08:00': 'America/Los_Angeles',
      '-05:00': 'America/New_York',
      '+09:00': 'Asia/Tokyo',
      '+01:00': 'Europe/London'
    };

    return timezoneMap[timezoneOffset] || 'Asia/Kolkata'; // Default to IST
  }

  /**
   * Get next assignments for handover information
   */
  getNextAssignments(layer, currentDate, overrides = {}, count = 2) {
    const nextAssignments = [];
    const date = new Date(currentDate);

    for (let i = 1; i <= count; i++) {
      // For weekday layers, find next weekday
      if (layer.type === 'weekday') {
        date.setDate(date.getDate() + 1);
        // Skip weekends for weekday layers
        while (date.getDay() === 0 || date.getDay() === 6) {
          date.setDate(date.getDate() + 1);
        }
      } else if (layer.type === 'weekend') {
        // For weekend layers, find next weekend
        date.setDate(date.getDate() + 1);
        while (date.getDay() !== 6 && date.getDay() !== 0) {
          date.setDate(date.getDate() + 1);
        }
      } else {
        // For other layers, just increment by 1 day
        date.setDate(date.getDate() + 1);
      }

      const assignment = calculateCurrentAssignment(layer, new Date(date), overrides);
      nextAssignments.push({
        date: new Date(date),
        person: assignment.person,
        isOverride: assignment.isOverride
      });
    }

    return nextAssignments;
  }

  /**
   * Get next shifts in proper sequence (Shift 1 → Shift 2 → Shift 3 → Shift 4)
   * @param {string} currentLayerKey - Current layer key
   * @param {Date} currentTime - Current time
   * @param {Object} overrides - Override data
   * @param {number} count - Number of next assignments to get
   * @returns {Array} Array of next assignments with layer info
   */
  getNextShiftsInSequence(currentLayerKey, currentTime, overrides, count = 2) {
    const nextAssignments = [];

    // Define the sequence of layers with dynamic names from config
    const layerSequence = [
      { key: 'layer1', name: this.scheduleData.weekday.layer1?.display_name || 'Shift 1' },
      { key: 'layer2', name: this.scheduleData.weekday.layer2?.display_name || 'Shift 2' },
      { key: 'layer3', name: this.scheduleData.weekday.layer3?.display_name || 'Shift 3' },
      { key: 'layer4', name: this.scheduleData.weekday.layer4?.display_name || 'Shift 4' }
    ];

    // Get all upcoming shifts in chronological order
    const upcomingShifts = [];
    const now = new Date(currentTime);

    // Look ahead for the next 3 days to find upcoming shifts
    for (let dayOffset = 0; dayOffset <= 3; dayOffset++) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() + dayOffset);

      // Skip weekends for weekday shifts
      if (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
        continue;
      }

      // Check each layer for this date
      layerSequence.forEach(layer => {
        const layerConfig = this.scheduleData.weekday[layer.key];
        if (!layerConfig) return;

        // Calculate when this shift starts
        const shiftStartTime = this.calculateNextShiftStartTime(layer.key, checkDate);

        // Only include shifts that haven't started yet
        if (shiftStartTime > now) {
          const assignment = calculateCurrentAssignment(layerConfig, shiftStartTime, overrides, layer.key);

          if (assignment && assignment.person) {
            upcomingShifts.push({
              person: assignment.person,
              layer: layer.name,
              layerKey: layer.key,
              date: new Date(checkDate),
              startTime: shiftStartTime,
              isOverride: assignment.isOverride || false
            });
          }
        }
      });
    }

    // Sort by start time to get chronological order
    upcomingShifts.sort((a, b) => a.startTime - b.startTime);

    // Format and return the requested number of next assignments
    const formatTime = (date) => {
      return date.toLocaleString('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }) + ' UTC';
    };

    // Take only the requested count and format
    for (let i = 0; i < Math.min(count, upcomingShifts.length); i++) {
      const shift = upcomingShifts[i];
      nextAssignments.push({
        person: shift.person,
        layer: shift.layer,
        date: shift.date,
        startTime: formatTime(shift.startTime),
        isOverride: shift.isOverride
      });
    }

    return nextAssignments;
  }

  /**
   * Send notification for a shift
   */
  async sendShiftNotification(shiftTime, layerConfig, layerKey) {
    try {
      // Get current person on duty using the same logic as calendar and top notification
      // Load overrides from file system (since we're in Node.js, not browser)
      const overrides = this.loadOverrides();
      console.log('🔍 Loaded overrides for notification:', overrides);
      const assignment = calculateCurrentAssignment(layerConfig, shiftTime, overrides, layerKey);
      const currentPerson = assignment.person;

      // Calculate next 2 on-call people in proper sequence for handover information
      const nextAssignments = this.getNextShiftsInSequence(layerKey, shiftTime, overrides, 2);

      // Calculate current shift end time based on current time and shift duration
      const currentEndTime = this.calculateCurrentShiftEndTime(layerKey, shiftTime);

      // Format times for display in UTC
      const formatTime = (date) => {
        return date.toLocaleString('en-US', {
          timeZone: 'UTC',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }) + ' UTC';
      };

      const shiftInfo = {
        shiftName: layerConfig.display_name || layerKey,
        engineerName: currentPerson,
        startTime: formatTime(shiftTime),
        endTime: formatTime(currentEndTime),
        duration: layerConfig.hours || 'Unknown',
        nextAssignments: nextAssignments
      };

      await this.slackService.sendShiftStartNotification(shiftInfo);
      console.log(`📢 Sent notification for ${shiftInfo.shiftName} shift`);

    } catch (error) {
      console.error('Failed to send shift notification:', error);
    }
  }

  /**
   * Calculate when the current shift ends based on layer and current time
   */
  calculateCurrentShiftEndTime(layerKey, currentTime) {
    const now = new Date(currentTime);
    const layerConfig = this.getLayerConfig(layerKey);

    if (!layerConfig) {
      // Fallback: add 6 hours to current time
      return new Date(now.getTime() + (6 * 60 * 60 * 1000));
    }

    // For weekend shifts, use the actual end_time from config
    if (layerConfig.type === 'weekend') {
      const endTime = new Date(layerConfig.end_time);

      // Calculate which weekend period we're in
      const startTime = new Date(layerConfig.start_time);
      const daysDiff = Math.floor((now - startTime) / (24 * 60 * 60 * 1000));
      const weeksPassed = Math.floor(daysDiff / 7);

      // Add weeks to get current weekend end time
      const currentWeekendEnd = new Date(endTime);
      currentWeekendEnd.setDate(endTime.getDate() + (weeksPassed * 7));

      console.log(`📅 Weekend shift ends: ${currentWeekendEnd.toLocaleString()}`);
      return currentWeekendEnd;
    }

    // For weekday shifts, read end time directly from YAML config
    const configEndTime = new Date(layerConfig.end_time);

    // Create the end time for the current shift
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endTimeUTC = new Date(today);

    // Set the time components from the config (which includes timezone info)
    endTimeUTC.setUTCFullYear(today.getUTCFullYear());
    endTimeUTC.setUTCMonth(today.getUTCMonth());
    endTimeUTC.setUTCDate(today.getUTCDate());
    endTimeUTC.setUTCHours(configEndTime.getUTCHours());
    endTimeUTC.setUTCMinutes(configEndTime.getUTCMinutes());
    endTimeUTC.setUTCSeconds(0);
    endTimeUTC.setUTCMilliseconds(0);

    // Handle cross-midnight shifts (end time is next day)
    const configStartTime = new Date(layerConfig.start_time);
    if (configEndTime.getUTCHours() < configStartTime.getUTCHours()) {
      // End time is next day
      endTimeUTC.setUTCDate(endTimeUTC.getUTCDate() + 1);
    }

    console.log(`📅 ${layerKey} (${layerConfig.display_name}) end time: ${endTimeUTC.toISOString()}`);
    console.log(`📋 Config end time: ${layerConfig.end_time} → UTC: ${configEndTime.toISOString()}`);

    return endTimeUTC;
  }

  /**
   * Calculate when the next shift starts based on layer and date
   */
  calculateNextShiftStartTime(layerKey, shiftDate) {
    const layerConfig = this.getLayerConfig(layerKey);

    if (!layerConfig) {
      return shiftDate; // Fallback to provided date
    }

    // For weekend shifts, calculate the start time for the given weekend
    if (layerConfig.type === 'weekend') {
      const configStartTime = new Date(layerConfig.start_time);
      const shiftStartTime = new Date(shiftDate);

      // Set the time to match the configured weekend start time
      shiftStartTime.setHours(configStartTime.getHours());
      shiftStartTime.setMinutes(configStartTime.getMinutes());
      shiftStartTime.setSeconds(0);
      shiftStartTime.setMilliseconds(0);

      return shiftStartTime;
    }

    // For weekday shifts, read start time directly from YAML config
    const configStartTime = new Date(layerConfig.start_time);

    // Create the start time for the given shift date
    const startTimeUTC = new Date(shiftDate);

    // Set the time components from the config (which includes timezone info)
    startTimeUTC.setUTCFullYear(shiftDate.getUTCFullYear());
    startTimeUTC.setUTCMonth(shiftDate.getUTCMonth());
    startTimeUTC.setUTCDate(shiftDate.getUTCDate());
    startTimeUTC.setUTCHours(configStartTime.getUTCHours());
    startTimeUTC.setUTCMinutes(configStartTime.getUTCMinutes());
    startTimeUTC.setUTCSeconds(0);
    startTimeUTC.setUTCMilliseconds(0);

    console.log(`🕐 ${layerKey} (${layerConfig.display_name}) start time: ${startTimeUTC.toISOString()} (${startTimeUTC.toLocaleString('en-US', {timeZone: 'UTC'})} UTC)`);
    console.log(`📋 Config time: ${layerConfig.start_time} → UTC: ${configStartTime.toISOString()}`);

    return startTimeUTC;
  }

  /**
   * Get layer configuration by key
   */
  getLayerConfig(layerKey) {
    // Check weekday layers
    if (this.scheduleData.weekday && this.scheduleData.weekday[layerKey]) {
      return this.scheduleData.weekday[layerKey];
    }

    // Check weekend layers
    if (this.scheduleData.weekend && this.scheduleData.weekend[layerKey]) {
      return this.scheduleData.weekend[layerKey];
    }

    return null;
  }

  /**
   * Get next occurrence of a weekday shift
   */
  getNextShiftOccurrence(shiftStartTime, now) {
    // Create a shift time for today
    const todayShift = new Date(now);
    todayShift.setHours(shiftStartTime.getHours());
    todayShift.setMinutes(shiftStartTime.getMinutes());
    todayShift.setSeconds(0);
    todayShift.setMilliseconds(0);

    console.log(`🕐 Today's shift time: ${todayShift.toLocaleString()}, Current time: ${now.toLocaleString()}`);

    // If shift time today hasn't passed and today is a weekday, use today
    if (todayShift > now && todayShift.getDay() !== 0 && todayShift.getDay() !== 6) {
      console.log(`✅ Using today's shift time`);
      return todayShift;
    }

    // For early morning shifts (like 3:30 AM), check if tomorrow is valid
    // Even if tomorrow is Saturday, early morning weekday shifts should continue
    const isEarlyMorningShift = shiftStartTime.getHours() < 10; // Before 10 AM

    // Find next occurrence
    let daysToAdd = 1;
    while (daysToAdd <= 7) {
      const candidate = new Date(todayShift);
      candidate.setDate(candidate.getDate() + daysToAdd);

      console.log(`🔍 Checking day +${daysToAdd}: ${candidate.toLocaleString()}, Day of week: ${candidate.getDay()}, Early morning shift: ${isEarlyMorningShift}`);

      // For early morning shifts, allow Saturday morning (but not Sunday)
      if (isEarlyMorningShift && candidate.getDay() === 6) {
        console.log(`✅ Allowing early morning shift on Saturday: ${candidate.toLocaleString()}`);
        return candidate;
      }

      // Regular weekday check
      if (candidate.getDay() !== 0 && candidate.getDay() !== 6) {
        console.log(`✅ Found next weekday occurrence: ${candidate.toLocaleString()}`);
        return candidate;
      }

      daysToAdd++;
    }

    console.log(`❌ No valid occurrence found within 7 days`);
    return null;
  }

  /**
   * Get next occurrence of a weekend shift
   */
  getNextWeekendOccurrence(shiftStartTime, now) {
    const nextShift = new Date(shiftStartTime);

    // Extract timezone from the original start_time
    const timeZoneMatch = shiftStartTime.toISOString();

    // Find next Saturday (weekend starts on Saturday)
    const currentDay = now.getDay();
    let daysUntilWeekend;

    if (currentDay === 6) {
      // It's Saturday - weekend starts today
      daysUntilWeekend = 0;
    } else if (currentDay === 0) {
      // It's Sunday - weekend continues, but check if we need next weekend
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const shiftTime = shiftStartTime.getHours() * 60 + shiftStartTime.getMinutes();

      if (currentTime < shiftTime) {
        daysUntilWeekend = 0; // Still this weekend
      } else {
        daysUntilWeekend = 6; // Next Saturday
      }
    } else {
      // Weekday - find next Saturday
      daysUntilWeekend = (6 - currentDay) % 7;
      if (daysUntilWeekend === 0) daysUntilWeekend = 7;
    }

    const nextWeekend = new Date(now);
    nextWeekend.setDate(now.getDate() + daysUntilWeekend);
    nextWeekend.setHours(shiftStartTime.getHours());
    nextWeekend.setMinutes(shiftStartTime.getMinutes());
    nextWeekend.setSeconds(0);
    nextWeekend.setMilliseconds(0);

    console.log(`📅 Next weekend shift: ${nextWeekend.toLocaleString()} (in ${daysUntilWeekend} days)`);
    return nextWeekend;
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeNotifications: this.activeTimers.size,
      slackEnabled: this.slackService.getConfig().enabled,
      scheduleLoaded: !!this.scheduleData
    };
  }
}

module.exports = ShiftSchedulerService;
