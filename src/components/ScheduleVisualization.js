import React, { useState } from 'react';
import {
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Chip,
  Avatar,
  IconButton,
  Tooltip,
  Tabs,
  Tab
} from '@mui/material';
import {
  AccessTime as TimeIcon,
  Weekend as WeekendIcon,
  Work as WorkIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { loadScheduleData } from '../utils/scheduleLoader';
import { getTimeRangeAllZones } from '../utils/timeUtils';


const ScheduleVisualization = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [schedule, setSchedule] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Load schedule data dynamically from YAML
  React.useEffect(() => {
    const loadSchedule = async () => {
      try {
        setIsLoading(true);
        const data = await loadScheduleData();
        setSchedule(data);
        console.log('📊 Schedule Overview loaded:', data);
      } catch (error) {
        console.error('Failed to load schedule for overview:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSchedule();
  }, []);

  // Show loading state
  if (isLoading || !schedule) {
    return (
      <Paper elevation={3} sx={{ p: 3, borderRadius: 3 }}>
        <Box display="flex" alignItems="center" justifyContent="center" minHeight="200px">
          <Typography variant="h6">Loading Schedule Overview...</Typography>
        </Box>
      </Paper>
    );
  }

  // Use the loaded schedule data instead of hardcoded mock data
  // Now using the dynamically loaded schedule data

  const getTimeString = (timeStr) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC'
    });
  };

  const getUserColor = (user) => {
    const colors = {
      dinesh: '#FF4438',    // Redis red
      melannie: '#00D9FF',  // Redis blue
      prashanth: '#4CAF50', // Redis green
      kartikeya: '#FFB74D', // Redis orange
      michael: '#9C27B0'    // Redis purple
    };
    return colors[user] || '#6b7280';
  };

  const LayerCard = ({ layer, layerName, isWeekend = false }) => (
    <Card
      sx={{
        mb: 2,
        background: isWeekend
          ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
          : 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
        color: 'white',
        position: 'relative',
        overflow: 'visible'
      }}
    >
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center">
            {isWeekend ? <WeekendIcon sx={{ mr: 1 }} /> : <WorkIcon sx={{ mr: 1 }} />}
            <Typography variant="h6" fontWeight={600}>
              {layer.display_name || layerName.replace('_', ' ').toUpperCase()}
            </Typography>
          </Box>
          <Chip
            label={`${layer.hours}h`}
            size="small"
            sx={{
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
              fontWeight: 500
            }}
          />
        </Box>

        <Box display="flex" alignItems="center" mb={2}>
          <TimeIcon sx={{ mr: 1, fontSize: 18 }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {getTimeString(layer.start_time)} - {getTimeString(layer.end_time)} UTC
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8, display: 'block' }}>
              IST: {new Date(layer.start_time).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
              })} - {new Date(layer.end_time).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
              })} | EST: {new Date(layer.start_time).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York'
              })} - {new Date(layer.end_time).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York'
              })}
            </Typography>
          </Box>
        </Box>

        <Box>
          <Typography variant="body2" sx={{ mb: 1, opacity: 0.9 }}>
            Rotation: {layer.days_rotate === 0 ? 'No rotation' : `Every ${layer.days_rotate} days`}
          </Typography>

          <Box display="flex" flexWrap="wrap" gap={1}>
            {layer.users.map((user) => (
              <Chip
                key={user}
                avatar={<Avatar sx={{ bgcolor: getUserColor(user) }}>{user[0].toUpperCase()}</Avatar>}
                label={user.charAt(0).toUpperCase() + user.slice(1)}
                variant="filled"
                sx={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  color: 'white',
                  fontWeight: 500,
                  '& .MuiChip-avatar': {
                    color: 'white'
                  }
                }}
              />
            ))}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  return (
    <Paper elevation={3} sx={{ p: 3, borderRadius: 3 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" fontWeight={600} sx={{ display: 'flex', alignItems: 'center' }}>
          <TimeIcon sx={{ mr: 2, color: 'primary.main' }} />
          Schedule Overview
        </Typography>
        <Tooltip title="Refresh Schedule">
          <IconButton>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Tabs 
        value={activeTab} 
        onChange={(e, newValue) => setActiveTab(newValue)}
        sx={{ mb: 3 }}
      >
        <Tab label="Weekday Shifts" icon={<WorkIcon />} />
        <Tab label="Weekend Coverage" icon={<WeekendIcon />} />
      </Tabs>

      {activeTab === 0 && (
        <Box>
          {Object.entries(schedule.weekday).map(([layerName, layer]) => (
            <LayerCard key={layerName} layer={layer} layerName={layerName} />
          ))}
        </Box>
      )}

      {activeTab === 1 && (
        <Box>
          {Object.entries(schedule.weekend).map(([layerName, layer]) => (
            <LayerCard key={layerName} layer={layer} layerName={layerName} isWeekend={true} />
          ))}
        </Box>
      )}
    </Paper>
  );
};

export default ScheduleVisualization;
