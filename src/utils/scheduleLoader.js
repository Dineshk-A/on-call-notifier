import yaml from 'js-yaml';

// Dynamic YAML loader that reads directly from schedule.yaml
export const loadScheduleData = async () => {
  try {
    // Check if we're in a browser environment (React app)
    if (typeof window !== 'undefined') {
      console.log('🔄 Loading schedule data from YAML (browser)...');
      const response = await fetch('/redis-sre/schedule/schedule.yaml');
      if (!response.ok) {
        console.warn('Could not load schedule.yaml, using fallback data');
        return getFallbackScheduleData();
      }

      const yamlText = await response.text();
      const scheduleData = yaml.load(yamlText);

      console.log('✅ Loaded schedule data from YAML (browser):', scheduleData);
      return scheduleData;
    } else {
      // Node.js environment (notification server) - use dynamic import
      console.log('🔄 Loading schedule data from YAML (server)...');
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const fs = require('fs');
      const path = require('path');

      const yamlPath = path.resolve(process.cwd(), '../public/redis-sre/schedule/schedule.yaml');
      console.log('📁 Loading YAML from file system:', yamlPath);

      const yamlText = fs.readFileSync(yamlPath, 'utf8');
      const scheduleData = yaml.load(yamlText);

      console.log('✅ Loaded schedule data from YAML (server):', scheduleData);
      return scheduleData;
    }
  } catch (error) {
    console.warn('Error loading YAML file:', error);
    console.log('Using fallback schedule data');
    return getFallbackScheduleData();
  }
};

// Fallback data that matches your current schedule.yaml
const getFallbackScheduleData = () => {
  return {
    weekday: {
      layer1: {
        type: 'weekday',
        start_time: '2025-09-05T09:30:00+05:30',
        end_time: '2025-09-05T15:30:00+05:30',
        hours: 6,
        days_rotate: 2,
        users: ['dinesh', 'melannie', 'prashanth']
      },
      layer2: {
        type: 'weekday',
        start_time: '2025-09-05T15:30:00+05:30',
        end_time: '2025-09-05T21:30:00+05:30',
        hours: 6,
        days_rotate: 2,
        users: ['prashanth', 'dinesh', 'melannie']
      },
      layer3: {
        type: 'weekday',
        start_time: '2025-09-05T21:30:00+05:30',
        end_time: '2025-09-05T03:30:00+05:30',
        hours: 6,
        days_rotate: 0,
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
        start_time: '2025-09-07T09:30:00+05:30',
        end_time: '2025-09-09T09:30:00+05:30',
        hours: 48,
        days_rotate: 7,
        users: ['michael', 'kartikeya']
      }
    }
  };
};

// Load team data from teams.yaml
export const loadTeamData = async () => {
  try {
    // Check if we're in a browser environment (React app)
    if (typeof window !== 'undefined') {
      console.log('🔄 Loading team data from YAML (browser)...');
      const response = await fetch('/redis-sre/teams/teams.yaml');
      if (!response.ok) {
        console.warn('Could not load teams.yaml, using fallback data');
        return getFallbackTeamData();
      }

      const yamlText = await response.text();
      const teamData = yaml.load(yamlText);

      // Extract all team members from all teams
      const allMembers = [];
      teamData.teams.forEach(team => {
        team.members.forEach(member => {
          allMembers.push({
            id: member.id,
            name: member.name,
            email: member.email,
            timezone: member.timezone
          });
        });
      });

      console.log('✅ Loaded team data from YAML (browser):', allMembers);
      return allMembers;
    } else {
      // Node.js environment (notification server) - use dynamic import
      console.log('🔄 Loading team data from YAML (server)...');
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      const fs = require('fs');
      const path = require('path');

      const yamlPath = path.resolve(process.cwd(), '../public/redis-sre/teams/teams.yaml');
      console.log('📁 Loading team YAML from file system:', yamlPath);

      const yamlText = fs.readFileSync(yamlPath, 'utf8');
      const teamData = yaml.load(yamlText);

      // Extract all team members from all teams
      const allMembers = [];
      teamData.teams.forEach(team => {
        team.members.forEach(member => {
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
    }
  } catch (error) {
    console.warn('Error loading team YAML file:', error);
    console.log('Using fallback team data');
    return getFallbackTeamData();
  }
};

// Fallback team data if YAML loading fails
const getFallbackTeamData = () => {
  return [
    {
      id: 'dinesh.kumar',
      name: 'Dinesh Kumar',
      email: 'dinesh.kumar@redis.com',
      timezone: 'Asia/Kolkata'
    },
    {
      id: 'prashanth.sathyanarayana',
      name: 'Prashanth Sathyanarayana',
      email: 'prashanth.sathyanarayana@redis.com',
      timezone: 'Asia/Kolkata'
    },
    {
      id: 'melannie.fernandes',
      name: 'Melannie Fernandes',
      email: 'melannie.fernandes@redis.com',
      timezone: 'Asia/Kolkata'
    },
    {
      id: 'gaurav.ranjan',
      name: 'Gaurav Ranjan',
      email: 'gaurav.ranjan@redis.com',
      timezone: 'Asia/Kolkata'
    },
    {
      id: 'alrida.monteiro',
      name: 'Alrida Monteiro',
      email: 'alrida.monteiro@redis.com',
      timezone: 'Asia/Kolkata'
    },
    {
      id: 'joel.jacob',
      name: 'Joel Jacob',
      email: 'joel.jacob@redis.com',
      timezone: 'America/New_York'
    },
    {
      id: 'kartikeya.gupta',
      name: 'Kartikeya Gupta',
      email: 'kartikeya.gupta@redis.com',
      timezone: 'America/New_York'
    },
    {
      id: 'michael.tchistopolskii',
      name: 'Michael Tchistopolskii',
      email: 'michael.tchistopolskii@redis.com',
      timezone: 'America/New_York'
    }
  ];
};

// Calculate who should be on-call for a specific date and layer
export const calculateCurrentAssignment = (layer, date, overrides = {}, layerKey = null) => {
  // Add safety checks
  if (!layer) {
    console.error('Layer is undefined');
    return { person: 'Unknown', isOverride: false };
  }

  if (!layer.users || layer.users.length === 0) {
    console.error('Layer has no users:', layer);
    return { person: 'No users assigned', isOverride: false };
  }

  // Check for overrides first - support both old and new format
  // New format: { "2025-10-08": { "layer2": "username" } }
  // Old format: { "Wed Oct 08 2025-layer2": { "person": "username", "reason": "..." } }

  const dateStr = date.toISOString().split('T')[0]; // "2025-10-08"
  const layerKeyToUse = layerKey || layer.type || 'weekend';



  // Check new format first
  if (overrides[dateStr] && overrides[dateStr][layerKeyToUse]) {
    const overridePerson = overrides[dateStr][layerKeyToUse];
    console.log(`🔄 Found override (new format) for ${dateStr}-${layerKeyToUse}:`, overridePerson);
    return {
      person: overridePerson,
      isOverride: true,
      reason: 'Manual override'
    };
  }

  // Check old format for backward compatibility
  const overrideKey = `${date.toDateString()}-${layerKeyToUse}`;
  if (overrides[overrideKey]) {
    console.log(`🔄 Found override (old format) for ${overrideKey}:`, overrides[overrideKey]);
    return {
      person: overrides[overrideKey].person,
      isOverride: true,
      reason: overrides[overrideKey].reason
    };
  }

  // Calculate normal rotation
  if (layer.days_rotate === 0) {
    // No rotation, always the same person
    return {
      person: layer.users[0],
      isOverride: false
    };
  }

  // For rotation calculation, we need to determine how many rotation cycles have passed
  const startDate = new Date(layer.start_time);

  // Normalize dates to compare just the date part (ignore time)
  const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const currentDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  // Dynamic rotation calculation based on layer type from schedule.yaml
  let daysDiff;

  if (layer.type === 'weekday') {
    // For weekday layers: count only weekdays (Mon-Fri)
    // Include the start date itself in the count
    daysDiff = 0;
    const tempDate = new Date(startDateOnly);

    while (tempDate <= currentDateOnly) {
      const dayOfWeek = tempDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
        daysDiff++;
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }
  } else if (layer.type === 'weekend') {
    // For weekend layers: count only weekends (Sat-Sun)
    daysDiff = 0;
    const tempDate = new Date(startDateOnly);

    while (tempDate < currentDateOnly) {
      const dayOfWeek = tempDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday (0) or Saturday (6)
        daysDiff++;
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }
  } else {
    // For any other type (or no type specified): use calendar days
    daysDiff = Math.floor((currentDateOnly - startDateOnly) / (1000 * 60 * 60 * 24));
  }

  console.log(`Layer calculation:`, {
    layerType: layer.type,
    startDate: startDateOnly.toDateString(),
    currentDate: currentDateOnly.toDateString(),
    daysDiff,
    daysRotate: layer.days_rotate,
    users: layer.users
  });

  // Additional safety check
  if (!layer.users || layer.users.length === 0) {
    console.error('Layer users is undefined or empty:', layer);
    return { person: 'No users', isOverride: false };
  }

  // Calculate which rotation cycle we're in
  // Since we now include the start date, daysDiff starts from 1
  // Use (daysDiff - 1) to ensure the first day is cycle 0
  const rotationCycle = daysDiff > 0 ? Math.floor((daysDiff - 1) / layer.days_rotate) : 0;
  const userIndex = rotationCycle % layer.users.length;

  console.log(`Rotation result:`, {
    rotationCycle,
    userIndex,
    selectedUser: layer.users[userIndex],
    allUsers: layer.users
  });

  return {
    person: layer.users[userIndex],
    isOverride: false
  };
};
