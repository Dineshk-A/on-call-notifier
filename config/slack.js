// Slack Bot Configuration
// Store sensitive credentials and channel information

const slackConfig = {
  // Slack Bot Token (from environment)
  botToken: process.env.SLACK_BOT_TOKEN,

  // Channel ID where notifications will be sent
  channelId: process.env.SLACK_CHANNEL_ID || 'C09DCSCPK97',
  
  // Notification settings
  notifications: {
    // How many minutes before shift starts to send notification
    // Set to 0 to send at exact start time (when person goes on-call)
    minutesBefore: 0,
    
    // Enable/disable notifications
    enabled: true,
    
    // Notification message templates
    templates: {
      shiftStart: {
        // Simple and effective notification format
        text: ':rotating_light: *ON-CALL SHIFT UPDATE* :rotating_light:\n\n:large_green_circle: *CURRENT ON-CALL*\n:pager: {engineerName} is now on-call until {endTime}\n\n:arrows_counterclockwise: *NEXT ON-CALL HANDOVER*\n{nextOnCall}'
      },

      shiftEnd: {
        // Simple, clean text format - no attachments to avoid noise
        text: '✅ {engineerName} is ending on-call for AMR-Redis-SRE schedule. {nextEngineer} takes over at {nextStartTime}'
      }
    }
  },
  
  // API endpoints
  api: {
    baseUrl: 'https://slack.com/api',
    endpoints: {
      postMessage: '/chat.postMessage',
      userInfo: '/users.info',
      channelInfo: '/conversations.info',
      lookupByEmail: '/users.lookupByEmail'
    }
  }
};

module.exports = slackConfig;
