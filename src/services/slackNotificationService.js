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
      const preview = (message && message.text) ? String(message.text).split('\n').slice(0,3).join(' | ') : '';
      console.log('➡️ Sending Slack message', {
        thread: Boolean(message && message.thread_ts),
        preview,
        length: (message && message.text) ? message.text.length : 0
      });

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
      console.log('⬅️ Slack API response', { ok: result.ok, ts: result.ts, error: result.error });

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

    console.log('tmpl.shiftStart before strip:', JSON.stringify(template.text));

    // Strip the Handover section (header + placeholder) from the main template
    // Example in config: "\n\n:arrows_counterclockwise: *NEXT ON-CALL HANDOVER*\n{nextOnCall}"
    let mainTemplateText = template.text
      // Remove the entire Handover block (header + {nextOnCall}), robust to extra newlines/formatting
      .replace(/\n+\s*:arrows_counterclockwise:.*\n\s*\{nextOnCall\}/i, '')
      .replace('{nextOnCall}', ''); // safety fallback if placeholder exists standalone

    console.log('mainTemplateText after strip:', JSON.stringify(mainTemplateText));

    // Fallback: if anything related to handover remains, build a clean main template explicitly
    if (/\{nextOnCall\}|:arrows_counterclockwise:/i.test(mainTemplateText)) {
      console.warn('Handover block still present after strip; using minimal main template');
      mainTemplateText = ':rotating_light: *ON-CALL SHIFT UPDATE* :rotating_light:\n\n:large_green_circle: *CURRENT ON-CALL*\n:pager: {engineerName} is now on-call until {endTime}';
    }

    // Main message without NEXT/AFTER to keep it clean; those go as thread reply
    const mainText = this.replaceTemplateVariables(mainTemplateText, shiftInfo);
    console.log('mainText(final):', JSON.stringify(mainText));
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
        const threadText = parts.join('\n\n');
        console.log('threadText(final):', JSON.stringify(threadText));
        await this.sendMessage({ text: threadText, thread_ts: main.ts });
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
