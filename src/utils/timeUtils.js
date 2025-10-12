// Time utility functions for timezone conversions

/**
 * Convert IST time string to UTC
 * @param {string} istTimeString - Time string in IST (e.g., "2025-09-05T09:30:00+05:30")
 * @returns {Date} UTC Date object
 */
export const convertISTToUTC = (istTimeString) => {
  return new Date(istTimeString);
};

/**
 * Format time for display in multiple timezones
 * @param {Date|string} dateTime - Date object or ISO string
 * @returns {object} Object with formatted times for different timezones
 */
export const formatTimeForDisplay = (dateTime) => {
  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
  
  return {
    utc: date.toLocaleString('en-US', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }),
    ist: date.toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }),
    est: date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  };
};

/**
 * Get time range string in UTC
 * @param {string} startTime - Start time in IST
 * @param {string} endTime - End time in IST
 * @returns {string} Formatted time range in UTC
 */
export const getUTCTimeRange = (startTime, endTime) => {
  const start = formatTimeForDisplay(startTime);
  const end = formatTimeForDisplay(endTime);
  return `${start.utc} - ${end.utc} UTC`;
};

/**
 * Get time range with all timezones
 * @param {string} startTime - Start time in IST
 * @param {string} endTime - End time in IST
 * @returns {object} Object with time ranges for all timezones
 */
export const getTimeRangeAllZones = (startTime, endTime) => {
  const start = formatTimeForDisplay(startTime);
  const end = formatTimeForDisplay(endTime);
  
  return {
    utc: `${start.utc} - ${end.utc}`,
    ist: `${start.ist} - ${end.ist}`,
    est: `${start.est} - ${end.est}`
  };
};

/**
 * Get current time in multiple timezones
 * @returns {object} Current time in different timezones
 */
export const getCurrentTimeAllZones = () => {
  const now = new Date();
  return {
    utc: now.toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'medium'
    }),
    ist: now.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'medium'
    }),
    est: now.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'medium',
      timeStyle: 'medium'
    })
  };
};
