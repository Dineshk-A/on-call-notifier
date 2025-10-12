import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  Divider,
  Badge
} from '@mui/material';
import {
  Person as PersonIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import { loadScheduleData, calculateCurrentAssignment } from '../utils/scheduleLoader';


const TeamMembers = () => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [scheduleData, setScheduleData] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute to refresh on-call status
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  // Load team data and schedule data
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load team members from YAML
        const teamsResponse = await fetch('/redis-sre/teams/teams.yaml');
        const teamsYaml = await teamsResponse.text();
        const yaml = await import('js-yaml');
        const teamsData = yaml.load(teamsYaml);

        // Load schedule data
        const scheduleData = await loadScheduleData();
        setScheduleData(scheduleData);

        // Extract team members and calculate their current status
        const members = teamsData.teams[0].members.map(member => ({
          ...member,
          status: 'available', // Default status
          currentShift: null
        }));

        setTeamMembers(members);
      } catch (error) {
        console.error('Failed to load team data:', error);
        // Fallback to empty array
        setTeamMembers([]);
      }
    };

    loadData();
  }, []);

  // Calculate who is currently on-call
  useEffect(() => {
    if (!scheduleData || teamMembers.length === 0) return;

    const updateMemberStatus = () => {
      const overrides = JSON.parse(localStorage.getItem('shiftOverrides') || '{}');
      const updatedMembers = teamMembers.map(member => {
        let status = 'available';
        let currentShift = null;

        // Check if member is currently on-call in any layer
        const isWeekend = currentTime.getDay() === 0 || currentTime.getDay() === 6;

        if (isWeekend) {
          // Check weekend coverage
          const weekendConfig = scheduleData.weekend?.full_weekend;
          if (weekendConfig) {
            const assignment = calculateCurrentAssignment(weekendConfig, currentTime, overrides, 'full_weekend');
            if (assignment.person === member.name) {
              status = 'active';
              currentShift = weekendConfig.display_name || 'Weekend Coverage';
            }
          }
        } else {
          // Check weekday layers
          Object.entries(scheduleData.weekday || {}).forEach(([layerKey, layerConfig]) => {
            const assignment = calculateCurrentAssignment(layerConfig, currentTime, overrides, layerKey);
            if (assignment.person === member.name) {
              // Check if current time is within this layer's active hours
              const hour = currentTime.getHours();
              const minute = currentTime.getMinutes();
              const currentMinutes = hour * 60 + minute;

              const startTime = new Date(layerConfig.start_time);
              const endTime = new Date(layerConfig.end_time);
              const layerStart = startTime.getHours() * 60 + startTime.getMinutes();
              const layerEnd = endTime.getHours() * 60 + endTime.getMinutes();

              let isInActiveHours = false;
              if (layerEnd > layerStart) {
                // Same day shift
                isInActiveHours = currentMinutes >= layerStart && currentMinutes < layerEnd;
              } else {
                // Overnight shift
                isInActiveHours = currentMinutes >= layerStart || currentMinutes < layerEnd;
              }

              if (isInActiveHours) {
                status = 'active';
                currentShift = layerConfig.display_name || layerKey;
              }
            }
          });
        }

        return {
          ...member,
          status,
          currentShift
        };
      });

      setTeamMembers(updatedMembers);
    };

    updateMemberStatus();
  }, [scheduleData, currentTime]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'available': return 'default';
      case 'offline': return 'error';
      default: return 'default';
    }
  };

  const getAvatarColor = (name) => {
    const colors = ['#6b7280', '#8b5cf6', '#0ea5e9', '#059669', '#f59e0b', '#ef4444', '#ec4899', '#10b981'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getTimezoneDisplay = (timezone) => {
    // Remove flags, just show timezone abbreviation
    if (timezone.includes('America')) {
      return 'EST/EDT';
    } else if (timezone.includes('Asia/Kolkata')) {
      return 'IST';
    }
    return timezone.split('/').pop(); // Fallback to city name
  };

  return (
    <Paper elevation={3} sx={{ p: 3, borderRadius: 3, height: 'fit-content' }}>
      <Typography variant="h5" fontWeight={600} sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
        <PersonIcon sx={{ mr: 2, color: 'primary.main' }} />
        Team Members
      </Typography>

      <List sx={{ width: '100%' }}>
        {teamMembers.map((member, index) => (
          <React.Fragment key={member.id}>
            <ListItem
              alignItems="flex-start"
              sx={{
                px: 0,
                py: 2,
                '&:hover': {
                  backgroundColor: 'action.hover',
                  borderRadius: 2,
                  px: 2
                },
                transition: 'all 0.2s ease'
              }}
            >
              <ListItemAvatar>
                <Badge
                  overlap="circular"
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  badgeContent={
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: member.status === 'active' ? 'success.main' : 'grey.400',
                        border: '2px solid white'
                      }}
                    />
                  }
                >
                  <Avatar
                    sx={{
                      bgcolor: getAvatarColor(member.name),
                      width: 48,
                      height: 48,
                      fontSize: '1.2rem',
                      fontWeight: 600
                    }}
                  >
                    {member.name.split(' ').map(n => n[0]).join('')}
                  </Avatar>
                </Badge>
              </ListItemAvatar>

              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle1" fontWeight={500}>
                      {member.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {getTimezoneDisplay(member.timezone)}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {member.email}
                    </Typography>
                    <Box display="flex" gap={1} flexWrap="wrap">
                      <Chip
                        label={member.status}
                        size="small"
                        color={getStatusColor(member.status)}
                        variant="outlined"
                      />
                      {member.currentShift && (
                        <Chip
                          label={member.currentShift}
                          size="small"
                          color="primary"
                          variant="filled"
                          icon={<ScheduleIcon />}
                        />
                      )}
                    </Box>
                  </Box>
                }
              />
            </ListItem>
            {index < teamMembers.length - 1 && <Divider variant="inset" component="li" />}
          </React.Fragment>
        ))}
      </List>
    </Paper>
  );
};

export default TeamMembers;
