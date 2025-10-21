// Slack Notification Service
// Handles sending notifications to Slack channel before shift changes

const slackConfig = require('../../config/slack');

class SlackNotificationService {
  constructor() {
    this.config = slackConfig;
    this.isEnabled = this.config.notifications.enabled;
  }

  /**
   * Send a message to Slack channel
   * @param {Object} message - Message object with text, attachments, etc.
   * @returns {Promise<Object>} Slack API response
   */
  async sendMessage(message) {
    if (!this.isEnabled) {
      console.log('Slack notifications disabled');
      return { ok: false, error: 'notifications_disabled' };
    }

    try {
      const response = await fetch(`${this.config.api.baseUrl}${this.config.api.endpoints.postMessage}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel: this.config.channelId,
          ...message
        })
      });

      const result = await response.json();
      
      if (!result.ok) {
        console.error('Slack API error:', result.error);
        return result;
      }

      console.log('✅ Slack notification sent successfully');
      return result;
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Send shift start notification
   * @param {Object} shiftInfo - Information about the starting shift
   */
  async sendShiftStartNotification(shiftInfo) {
    const template = this.config.notifications.templates.shiftStart;

    // Main message without NEXT/AFTER to keep it clean; those go as thread reply
    const mainText = this.replaceTemplateVariables(template.text.replace('{nextOnCall}', ''), shiftInfo);
    const main = await this.sendMessage({ text: mainText });

    // Post NEXT/AFTER and optional Monday shifts as a threaded reply
    if (main && main.ok && main.ts) {
      let parts = [];

      if (shiftInfo.nextAssignments && shiftInfo.nextAssignments.length > 0) {
        const nextList = shiftInfo.nextAssignments.map((assignment, index) => {
          if (index === 0) return `:large_yellow_circle: NEXT: ${assignment.person} starts at ${assignment.startTime || 'TBD'}`;
          if (index === 1) return `:large_orange_circle: AFTER: ${assignment.person} starts at ${assignment.startTime || 'TBD'}`;
          return `🔵 ${assignment.person} - ${assignment.startTime || 'TBD'}`;
        }).join('\n');
        parts.push(`:arrows_counterclockwise: Handover\n${nextList}`);
      }

      if (shiftInfo.postWeekendNext && shiftInfo.postWeekendNext.length > 0) {
        const mondayList = shiftInfo.postWeekendNext.map(m => `• ${m.layer}: ${m.person} starts at ${m.startTime}`).join('\n');
        parts.push(`📅 After weekend ends:\n${mondayList}`);
      }

      if (parts.length > 0) {
        await this.sendMessage({ text: parts.join('\n\n'), thread_ts: main.ts });
      }
    }

    return main;
  }

  /**
   * Send shift end notification
   * @param {Object} shiftInfo - Information about the ending shift
   */
  async sendShiftEndNotification(shiftInfo) {
    const template = this.config.notifications.templates.shiftEnd;

    // Simple, clean text format - no attachments to avoid noise
    const message = {
      text: this.replaceTemplateVariables(template.text, shiftInfo)
    };

    return await this.sendMessage(message);
  }

  /**
   * Replace template variables in message strings
   * @param {string} template - Template string with variables
   * @param {Object} data - Data object with values
   * @returns {string} String with variables replaced
   */
  replaceTemplateVariables(template, data) {
    // Format next on-call information - simple and effective
    let nextOnCallText = '❌ Not available';
    if (data.nextAssignments && data.nextAssignments.length > 0) {
      const nextList = data.nextAssignments.map((assignment, index) => {
        const dateStr = assignment.date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });

        // Simple format showing when shifts START
        if (index === 0) {
          return `:large_yellow_circle: *NEXT*: ${assignment.person} starts at ${assignment.startTime || 'TBD'}`;
        } else if (index === 1) {
          return `:large_orange_circle: *AFTER*: ${assignment.person} starts at ${assignment.startTime || 'TBD'}`;
        }

        return `🔵 ${assignment.person} - ${dateStr}`;
      }).join('\n');
      nextOnCallText = nextList;
    }

    return template
      .replace('{shiftName}', data.shiftName || 'Unknown Shift')
      .replace('{engineerName}', data.engineerName || 'Unknown Engineer')
      .replace('{startTime}', data.startTime || 'Unknown Time')
      .replace('{endTime}', data.endTime || 'Unknown Time')
      .replace('{duration}', data.duration || 'Unknown')
      .replace('{nextEngineer}', data.nextEngineer || 'Unknown Engineer')
      .replace('{nextStartTime}', data.nextStartTime || 'Unknown Time')
      .replace('{nextOnCall}', nextOnCallText)
      .replace('{timestamp}', Math.floor(Date.now() / 1000));
  }

  /**
   * Test Slack connection
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      const testMessage = {
        text: '🧪 Test notification from Redis On-Call System',
        attachments: [{
          color: '#36a64f',
          title: 'Connection Test',
          text: 'If you see this message, Slack notifications are working correctly!',
          footer: 'Redis On-Call System',
          ts: Math.floor(Date.now() / 1000)
        }]
      };

      const result = await this.sendMessage(testMessage);
      return result.ok;
    } catch (error) {
      console.error('Slack connection test failed:', error);
      return false;
    }
  }

  /**
   * Enable or disable notifications
   * @param {boolean} enabled - Whether to enable notifications
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`Slack notifications ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return {
      enabled: this.isEnabled,
      minutesBefore: this.config.notifications.minutesBefore,
      channelId: this.config.channelId
    };
  }
}

module.exports = SlackNotificationService;
