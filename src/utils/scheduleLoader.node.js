// Node.js (CommonJS) version of schedule loader for the backend/server
// Keeps frontend ESM file (scheduleLoader.js) unchanged

const fs = require('fs');
const path = require('path');
const yamlLib = require('js-yaml');

function resolveExistingPath(possiblePaths) {
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function loadScheduleData() {
  try {
    // Try multiple locations based on where the process is started
    const possiblePaths = [
      // When running from repo root (e.g., node server/notificationServer.js)
      path.join(process.cwd(), 'public/redis-sre/schedule/schedule.yaml'),
      // When running from /app (Docker container WORKDIR)
      path.join(__dirname, '../../public/redis-sre/schedule/schedule.yaml'),
      // When running from server directory locally
      path.join(process.cwd(), '../public/redis-sre/schedule/schedule.yaml')
    ];

    const yamlPath = resolveExistingPath(possiblePaths);
    if (!yamlPath) {
      console.warn('⚠️ schedule.yaml not found in expected locations. Using fallback.');
      return getFallbackScheduleData();
    }

    console.log('📁 Loading YAML from file system:', yamlPath);
    const yamlText = fs.readFileSync(yamlPath, 'utf8');
    const scheduleData = yamlLib.load(yamlText);
    console.log('✅ Loaded schedule data from YAML (server):', scheduleData);
    return scheduleData;
  } catch (error) {
    console.warn('Error loading YAML file:', error.message);
    console.log('Using fallback schedule data');
    return getFallbackScheduleData();
  }
}

async function loadTeamData() {
  try {
    const possiblePaths = [
      path.join(process.cwd(), 'public/redis-sre/teams/teams.yaml'),
      path.join(__dirname, '../../public/redis-sre/teams/teams.yaml'),
      path.join(process.cwd(), '../public/redis-sre/teams/teams.yaml')
    ];

    const yamlPath = resolveExistingPath(possiblePaths);
    if (!yamlPath) {
      console.warn('⚠️ teams.yaml not found in expected locations. Using fallback.');
      return getFallbackTeamData();
    }

    console.log('📁 Loading team YAML from file system:', yamlPath);
    const yamlText = fs.readFileSync(yamlPath, 'utf8');
    const teamData = yamlLib.load(yamlText);

    const allMembers = [];
    (teamData.teams || []).forEach(team => {
      (team.members || []).forEach(member => {
        allMembers.push({
          id: member.id,
          name: member.name,
          email: member.email,
          timezone: member.timezone
        });
      });
    });

    console.log('✅ Loaded team data from YAML (server):', allMembers);
    return allMembers;
  } catch (error) {
    console.warn('Error loading team YAML file:', error.message);
    console.log('Using fallback team data');
    return getFallbackTeamData();
  }
}

function getFallbackScheduleData() {
  return {
    weekday: {
      layer1: {
        type: 'weekday',
        start_time: '2025-09-25T09:30:00+05:30',
        end_time: '2025-09-25T15:30:00+05:30',
        hours: 6,
        days_rotate: 2,
        users: ['dinesh', 'melannie', 'prashanth', 'alrida']
      },
      layer2: {
        type: 'weekday',
        start_time: '2025-09-25T15:30:00+05:30',
        end_time: '2025-09-25T21:30:00+05:30',
        hours: 6,
        days_rotate: 1,
        users: ['melannie', 'prashanth', 'alrida', 'dinesh', 'alrida', 'dinesh', 'melannie', 'prashanth']
      },
      layer3: {
        type: 'weekday',
        start_time: '2025-09-08T21:30:00+05:30',
        end_time: '2025-09-09T03:30:00+05:30',
        hours: 6,
        days_rotate: 5,
        users: ['kartikeya']
      },
      layer4: {
        type: 'weekday',
        start_time: '2025-09-05T03:30:00+05:30',
        end_time: '2025-09-05T09:30:00+05:30',
        hours: 6,
        days_rotate: 0,
        users: ['michael']
      }
    },
    weekend: {
      full_weekend: {
        type: 'weekend',
        start_time: '2025-09-06T09:30:00+05:30',
        end_time: '2025-09-08T09:30:00+05:30',
        hours: 48,
        days_rotate: 7,
        users: ['michael', 'kartikeya']
      }
    }
  };
}

function getFallbackTeamData() {
  return [
    { id: 'dinesh.kumar', name: 'Dinesh Kumar', email: 'dinesh.kumar@redis.com', timezone: 'Asia/Kolkata' },
    { id: 'prashanth.sathyanarayana', name: 'Prashanth Sathyanarayana', email: 'prashanth.sathyanarayana@redis.com', timezone: 'Asia/Kolkata' },
    { id: 'melannie.fernandes', name: 'Melannie Fernandes', email: 'melannie.fernandes@redis.com', timezone: 'Asia/Kolkata' },
    { id: 'gaurav.ranjan', name: 'Gaurav Ranjan', email: 'gaurav.ranjan@redis.com', timezone: 'Asia/Kolkata' },
    { id: 'alrida.monteiro', name: 'Alrida Monteiro', email: 'alrida.monteiro@redis.com', timezone: 'Asia/Kolkata' },
    { id: 'joel.jacob', name: 'Joel Jacob', email: 'joel.jacob@redis.com', timezone: 'America/New_York' },
    { id: 'kartikeya.gupta', name: 'Kartikeya Gupta', email: 'kartikeya.gupta@redis.com', timezone: 'America/New_York' },
    { id: 'michael.tchistopolskii', name: 'Michael Tchistopolskii', email: 'michael.tchistopolskii@redis.com', timezone: 'America/New_York' }
  ];
}

function calculateCurrentAssignment(layer, date, overrides = {}, layerKey = null) {
  if (!layer) {
    console.error('Layer is undefined');
    return { person: 'Unknown', isOverride: false };
  }
  if (!layer.users || layer.users.length === 0) {
    console.error('Layer has no users:', layer);
    return { person: 'No users assigned', isOverride: false };
  }

  const dateStr = new Date(date).toISOString().split('T')[0];
  const layerKeyToUse = layerKey || layer.type || 'weekend';

  if (overrides[dateStr] && overrides[dateStr][layerKeyToUse]) {
    const overridePerson = overrides[dateStr][layerKeyToUse];
    console.log(`🔄 Found override (new format) for ${dateStr}-${layerKeyToUse}:`, overridePerson);
    return { person: overridePerson, isOverride: true, reason: 'Manual override' };
  }

  const overrideKey = `${new Date(date).toDateString()}-${layerKeyToUse}`;
  if (overrides[overrideKey]) {
    console.log(`🔄 Found override (old format) for ${overrideKey}:`, overrides[overrideKey]);
    return { person: overrides[overrideKey].person, isOverride: true, reason: overrides[overrideKey].reason };
  }

  if (layer.days_rotate === 0) {
    return { person: layer.users[0], isOverride: false };
  }

  const startDate = new Date(layer.start_time);
  const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const currentDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  let daysDiff;
  if (layer.type === 'weekday') {
    daysDiff = 0;
    const tempDate = new Date(startDateOnly);
    while (tempDate <= currentDateOnly) {
      const dayOfWeek = tempDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        daysDiff++;
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }
  } else if (layer.type === 'weekend') {
    daysDiff = 0;
    const tempDate = new Date(startDateOnly);
    while (tempDate < currentDateOnly) {
      const dayOfWeek = tempDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        daysDiff++;
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }
  } else {
    daysDiff = Math.floor((currentDateOnly - startDateOnly) / (1000 * 60 * 60 * 24));
  }

  console.log('Layer calculation:', {
    layerType: layer.type,
    startDate: startDateOnly.toDateString(),
    currentDate: currentDateOnly.toDateString(),
    daysDiff,
    daysRotate: layer.days_rotate,
    users: layer.users
  });

  if (!layer.users || layer.users.length === 0) {
    return { person: 'No users', isOverride: false };
    }

  const rotationCycle = daysDiff > 0 ? Math.floor((daysDiff - 1) / layer.days_rotate) : 0;
  const userIndex = rotationCycle % layer.users.length;

  console.log('Rotation result:', {
    rotationCycle,
    userIndex,
    selectedUser: layer.users[userIndex],
    allUsers: layer.users
  });

  return { person: layer.users[userIndex], isOverride: false };
}

module.exports = {
  loadScheduleData,
  loadTeamData,
  calculateCurrentAssignment
};

