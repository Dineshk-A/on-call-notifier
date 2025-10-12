import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  Grid,
  Avatar,
  Chip,
  LinearProgress
} from '@mui/material';
import {
  AccessTime as TimeIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import { loadScheduleData, calculateCurrentAssignment } from '../utils/scheduleLoader';


const CurrentShift = () => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [scheduleData, setScheduleData] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load schedule data dynamically
  useEffect(() => {
    const loadSchedule = async () => {
      try {
        const data = await loadScheduleData();
        setScheduleData(data);
      } catch (error) {
        console.error('Failed to load schedule for CurrentShift:', error);
      }
    };
    loadSchedule();
  }, []);

  // Get current shift data using dynamic schedule
  const getCurrentShift = () => {
    if (!scheduleData) return null;
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();
    const currentMinutes = hour * 60 + minute;

    // Convert schedule data to shifts array with dynamic display names
    const layerColors = ['#FF4438', '#00D9FF', '#4CAF50', '#FFB74D']; // Redis colors
    const shifts = Object.entries(scheduleData.weekday).map(([layerKey, layerConfig], index) => {
      const startTime = new Date(layerConfig.start_time);
      const endTime = new Date(layerConfig.end_time);

      return {
        name: layerConfig.display_name || layerKey,
        start: startTime.getHours() * 60 + startTime.getMinutes(),
        end: endTime.getHours() * 60 + endTime.getMinutes(),
        person: layerConfig.users[0], // Will be replaced with proper rotation calculation
        color: layerColors[index % layerColors.length],
        layerKey
      };
    });

    // Check if it's weekend
    const isWeekend = currentTime.getDay() === 0 || currentTime.getDay() === 6;
    if (isWeekend) {
      const weekendConfig = scheduleData.weekend.full_weekend;
      if (weekendConfig) {
        // Load overrides from localStorage (same as calendar)
        const overrides = JSON.parse(localStorage.getItem('shiftOverrides') || '{}');
        const assignment = calculateCurrentAssignment(weekendConfig, currentTime, overrides, 'full_weekend');

        // Format weekend times in UTC - parse the timezone correctly
        const weekendStartTime = new Date(weekendConfig.start_time);
        const weekendEndTime = new Date(weekendConfig.end_time);

        return {
          name: weekendConfig.display_name || 'Weekend Coverage',
          person: assignment.person,
          color: '#6b7280',
          start: `Sat ${weekendStartTime.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC'
          })} UTC`,
          end: `Mon ${weekendEndTime.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC'
          })} UTC`,
          progress: 50, // Mock progress
          isWeekend: true,
          isOverride: assignment.isOverride
        };
      }
    }

    // Find current weekday shift using proper rotation logic
    const overrides = JSON.parse(localStorage.getItem('shiftOverrides') || '{}');

    for (const shift of shifts) {
      let isCurrentShift = false;

      // Check if current time falls within this shift's time range
      if (shift.end > shift.start) {
        // Same day shift (e.g., 9:30 AM - 3:30 PM)
        isCurrentShift = currentMinutes >= shift.start && currentMinutes < shift.end;
      } else {
        // Overnight shift (e.g., 9:30 PM - 3:30 AM)
        isCurrentShift = currentMinutes >= shift.start || currentMinutes < shift.end;
      }

      if (isCurrentShift) {
        // Get the layer config to calculate proper rotation
        const layerConfig = scheduleData.weekday[shift.layerKey];
        const assignment = calculateCurrentAssignment(layerConfig, currentTime, overrides, shift.layerKey);

        // Calculate progress
        let progress = 0;
        if (shift.end > shift.start) {
          // Same day
          const elapsed = currentMinutes - shift.start;
          const total = shift.end - shift.start;
          progress = (elapsed / total) * 100;
        } else {
          // Overnight
          const totalMinutes = (24 * 60 - shift.start) + shift.end;
          const elapsed = currentMinutes >= shift.start ?
            currentMinutes - shift.start :
            (24 * 60 - shift.start) + currentMinutes;
          progress = (elapsed / totalMinutes) * 100;
        }

        // Format time display
        const startTime = new Date(layerConfig.start_time);
        const endTime = new Date(layerConfig.end_time);

        return {
          ...shift,
          person: assignment.person, // Use calculated rotation instead of hardcoded
          start: startTime.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC'
          }) + ' UTC',
          end: endTime.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC'
          }) + ' UTC',
          progress: Math.max(0, Math.min(100, progress)),
          isWeekend: false,
          isOverride: assignment.isOverride
        };
      }
    }

    return null;
  };

  const currentShift = getCurrentShift();

  // Show loading state while schedule data loads
  if (!scheduleData) {
    return (
      <Paper elevation={3} sx={{ p: 3, borderRadius: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        <Typography variant="h5" fontWeight={600}>
          Loading Schedule...
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.9 }}>
          Fetching current shift information
        </Typography>
      </Paper>
    );
  }

  if (!currentShift) {
    return (
      <Paper elevation={3} sx={{ p: 3, borderRadius: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
        <Typography variant="h5" fontWeight={600}>
          No Active Shift
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.9 }}>
          Currently outside of scheduled on-call hours
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={6}
      sx={{
        p: 4,
        borderRadius: 3,
        background: `linear-gradient(135deg, ${currentShift.color} 0%, ${currentShift.color}CC 100%)`,
        color: 'white',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
        <Box position="absolute" top={0} right={0} sx={{ opacity: 0.1, fontSize: '8rem' }}>
          <ScheduleIcon sx={{ fontSize: 'inherit' }} />
        </Box>
        
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12}>
            <Box display="flex" alignItems="center" mb={2}>
              <TimeIcon sx={{ mr: 2, fontSize: '2rem' }} />
              <Box>
                <Typography variant="h4" fontWeight={700}>
                  {currentShift.name}
                </Typography>
                <Typography variant="h6" sx={{ opacity: 0.9 }}>
                  Currently Active
                </Typography>
              </Box>
            </Box>

            <Box display="flex" alignItems="center" mb={3}>
              <Avatar 
                sx={{ 
                  width: 56, 
                  height: 56, 
                  mr: 2,
                  bgcolor: 'rgba(255,255,255,0.2)',
                  fontSize: '1.5rem',
                  fontWeight: 600
                }}
              >
                {currentShift.person.split(' ').map(n => n[0]).join('')}
              </Avatar>
              <Box>
                <Box display="flex" alignItems="center">
                  <Typography variant="h5" fontWeight={600}>
                    {currentShift.person}
                  </Typography>
                  {currentShift.isOverride && (
                    <Chip
                      label="OVERRIDE"
                      size="small"
                      sx={{
                        ml: 1,
                        backgroundColor: '#ff6b35',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '0.7rem'
                      }}
                    />
                  )}
                </Box>
                <Typography variant="body1" sx={{ opacity: 0.9 }}>
                  {currentShift.isOverride ? 'Override Assignment' : 'On-Call Engineer'}
                </Typography>
              </Box>
            </Box>

            <Box display="flex" alignItems="center" mb={2}>
              <Typography variant="body1" sx={{ mr: 2 }}>
                {currentShift.start} - {currentShift.end}
              </Typography>
              <Chip 
                label={currentShift.isWeekend ? "Weekend" : "Weekday"}
                size="small"
                sx={{ 
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  fontWeight: 500
                }}
              />
            </Box>

            <Box>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  Shift Progress
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  {Math.round(currentShift.progress)}%
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={currentShift.progress} 
                sx={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: 'rgba(255,255,255,0.8)',
                    borderRadius: 4
                  }
                }}
              />
            </Box>
          </Grid>
        </Grid>
      </Paper>
  );
};

export default CurrentShift;
