// Slack Notification Service
// Handles sending notifications to Slack channel before shift changes

const slackConfig = require('../../config/slack');
const fs = require('fs');
const path = require('path');
let yaml;
try {
  // Try the server-local install first (as used by scheduleLoader.node)
  yaml = require('../../server/node_modules/js-yaml');
} catch (e1) {
  try { yaml = require('js-yaml'); } catch (e2) {
    try { yaml = require('yaml'); } catch (e3) { yaml = null; }
  }
}

class SlackNotificationService {
  constructor() {
    this.config = slackConfig;
    this.isEnabled = this.config.notifications.enabled;
    this.emailToSlackIdCache = new Map();
    this.teamsIndex = null; // lazy-loaded
  }

  // Lazy load teams.yaml and build an index
  loadTeamsIndex() {
    if (this.teamsIndex) return this.teamsIndex;
    try {
      const teamsPath = path.join(__dirname, '../../public/redis-sre/teams/teams.yaml');
      if (!yaml) {
        console.warn('teams index: js-yaml not available; mentions/timezone formatting may be limited');
      }
      const raw = fs.readFileSync(teamsPath, 'utf8');
      const doc = yaml ? yaml.load(raw) : null;
      const index = { byId: new Map(), byEmail: new Map(), members: [] };
      const teams = (doc && Array.isArray(doc.teams)) ? doc.teams : [];
      for (const t of teams) {
        const members = Array.isArray(t.members) ? t.members : [];
        for (const m of members) {
          if (!m) continue;
          index.members.push(m);
          if (m.id) index.byId.set(String(m.id).toLowerCase(), m);
          if (m.email) index.byEmail.set(String(m.email).toLowerCase(), m);
        }
      }
      this.teamsIndex = index;
      console.log('teams index loaded', { path: teamsPath, count: index.members.length });
      return this.teamsIndex;
    } catch (e) {
      console.warn('⚠️ Failed to load teams.yaml for Slack mentions:', e.message);
      this.teamsIndex = { byId: new Map(), byEmail: new Map(), members: [] };
      return this.teamsIndex;
    }
  }

  // Heuristic: find email for a short person name like "dinesh"
  findEmailForPersonShortName(name) {
    const idx = this.loadTeamsIndex();
    if (!name) return null;
    const lc = String(name).toLowerCase().trim();
    // Try: id startsWith, name startsWith, email contains fragment before '@'
    for (const m of idx.members) {
      const id = (m.id || '').toLowerCase();
      const nm = (m.name || '').toLowerCase();
      const em = (m.email || '').toLowerCase();
      if (id.startsWith(lc) || nm.startsWith(lc) || em.startsWith(lc + '.')) {
        return m.email || null;
      }
    }
    return null;
  }

  async getSlackUserIdByEmail(email) {
    if (!email) return null;
    const key = String(email).toLowerCase();
    if (this.emailToSlackIdCache.has(key)) return this.emailToSlackIdCache.get(key);

    try {
      const url = `${this.config.api.baseUrl}${this.config.api.endpoints.lookupByEmail}?email=${encodeURIComponent(email)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.botToken}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await response.json();
      if (result && result.ok && result.user && result.user.id) {
        this.emailToSlackIdCache.set(key, result.user.id);
        console.log('lookupByEmail success', { email: key, slackId: result.user.id });
        return result.user.id;
      }
      console.warn('⚠️ Slack users.lookupByEmail failed:', result && result.error);
      return null;
    } catch (e) {
      console.error('Slack users.lookupByEmail error:', e);
      return null;
    }
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
  // Return member object for a person name/id heuristic match
  findMemberForPersonName(name) {
    const idx = this.loadTeamsIndex();
    if (!name) return null;
    const lc = String(name).toLowerCase().trim();
    for (const m of idx.members) {
      const id = (m.id || '').toLowerCase();
      const nm = (m.name || '').toLowerCase();
      const em = (m.email || '').toLowerCase();
      if (id.startsWith(lc) || nm.startsWith(lc) || em.startsWith(lc + '.')) {
        return m;
      }
    }
    return null;
  }

  // Format date in member's timezone with UTC in parentheses
  formatDateForMember(date, member) {
    if (!date) return 'TBD';
    const tz = (member && member.timezone) ? member.timezone : 'UTC';
    try {
      const local = new Date(date).toLocaleString('en-US', {
        timeZone: tz,
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short'
      });
      const utc = new Date(date).toLocaleString('en-US', {
        timeZone: 'UTC',
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short'
      });
      console.log('formatDateForMember', { tz, memberId: member && member.id, local, utc });
      return `${local} (${utc})`;
    } catch (e) {
      // Fallback to UTC if timezone invalid
      console.warn('formatDateForMember fallback to UTC', { tzTried: tz, error: e.message });
      return new Date(date).toLocaleString('en-US', {
        timeZone: 'UTC',
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      }) + ' UTC';
    }
  }
  // Format date strictly in UTC
  formatUtc(date) {
    if (!date) return 'TBD';
    return new Date(date).toLocaleString('en-US', {
      timeZone: 'UTC',
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short'
    });
  }


  // Resolve display string with Slack mention for a person
  async resolveMention(name) {
    const member = this.findMemberForPersonName(name);
    if (!member) {
      console.log('resolveMention: no member match', { name });
      return { display: name, member: null, slackId: null };
    }
    if (member.slack_id) {
      console.log('resolveMention: using provided slack_id', { name, slackId: member.slack_id });
      return { display: `<@${member.slack_id}>`, member, slackId: member.slack_id };
    }
    if (!member.email) {
      console.log('resolveMention: member has no email (gated to plain text)', { name, memberId: member.id });
      return { display: name, member, slackId: null };
    }
    const slackId = await this.getSlackUserIdByEmail(member.email);
    if (slackId) {
      console.log('resolveMention: lookupByEmail success', { name, email: member.email, slackId });
      return { display: `<@${slackId}>`, member, slackId };
    }
    console.warn('resolveMention: lookupByEmail failed; falling back to plain name', { name, email: member.email });
    return { display: name, member, slackId: null };
  }


  /**
   * Send shift start notification
   * @param {Object} shiftInfo - Information about the starting shift
   */
  async sendShiftStartNotification(shiftInfo) {
    const template = this.config.notifications.templates.shiftStart;

    console.log('tmpl.shiftStart before split (ignored for main):', JSON.stringify(template.text));

    // Resolve CURRENT engineer mention and format end time in UTC only
    const engineerRaw = shiftInfo.engineerName;
    const currentResolved = await this.resolveMention(engineerRaw);
    const endDisplay = this.formatUtc(shiftInfo.endDate || new Date());

    // Build a clean CURRENT-only main template explicitly (do not rely on regex/removal)
    let mainTemplateText = ':rotating_light: *ON-CALL SHIFT UPDATE* :rotating_light:\n\n:large_green_circle: *CURRENT ON-CALL*\n:pager: {engineerName} is now on-call until {endTime}';

    // Main message without NEXT/AFTER to keep it clean; those go as thread reply
    const mainText = this.replaceTemplateVariables(mainTemplateText, { ...shiftInfo, engineerName: currentResolved.display, endTime: endDisplay });
    console.log('main: CURRENT resolved', { raw: engineerRaw, display: currentResolved.display, slackId: currentResolved.slackId || null, endDisplay });
    console.log('mainText(final):', JSON.stringify(mainText));
    const main = await this.sendMessage({ text: mainText });

    // Post NEXT/AFTER and optional Monday shifts as a threaded reply
    if (main && main.ok && main.ts) {
      let parts = [];

      if (shiftInfo.nextAssignments && shiftInfo.nextAssignments.length > 0) {
        const nextLines = await Promise.all(shiftInfo.nextAssignments.map(async (assignment, index) => {
          const resolved = await this.resolveMention(assignment.person);
          console.log('mention: NEXT/AFTER', { person: assignment.person, display: resolved.display, slackId: resolved.slackId || null });
          const startDate = assignment.startTimeDate || assignment.date || null;
          const startDisplay = startDate ? this.formatUtc(new Date(startDate)) : (assignment.startTime || 'TBD');
          if (index === 0) return `:large_yellow_circle: NEXT: ${resolved.display} starts at ${startDisplay}`;
          if (index === 1) return `:large_orange_circle: AFTER: ${resolved.display} starts at ${startDisplay}`;
          return `🔵 ${resolved.display} - ${startDisplay}`;
        }));
        const nextList = nextLines.join('\n');
        parts.push(`:arrows_counterclockwise: Handover\n${nextList}`);
      }

      if (shiftInfo.postWeekendNext && shiftInfo.postWeekendNext.length > 0) {
        const mondayLines = await Promise.all(shiftInfo.postWeekendNext.map(async (m) => {
          const resolved = await this.resolveMention(m.person);
          console.log('mention: MONDAY', { person: m.person, display: resolved.display, slackId: resolved.slackId || null });
          const startDate = m.startTimeDate || m.date || null;
          const startDisplay = startDate ? this.formatUtc(new Date(startDate)) : (m.startTime || 'TBD');
          return `• ${m.layer}: ${resolved.display} starts at ${startDisplay}`;
        }));
        const mondayList = mondayLines.join('\n');
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
