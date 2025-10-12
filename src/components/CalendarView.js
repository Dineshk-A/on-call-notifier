import React, { useState } from 'react';
import {
  Paper,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Avatar,
  IconButton,
  Tabs,
  Tab,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Snackbar
} from '@mui/material';
import {
  CalendarToday as CalendarIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Warning as WarningIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { loadScheduleData, loadTeamData, calculateCurrentAssignment } from '../utils/scheduleLoader';
import { exportMonth } from '../utils/excelExporter';

const CalendarView = () => {
  const [viewMode, setViewMode] = useState(0); // 0: Week, 1: Month
  // Start with current date
  const [currentDate, setCurrentDate] = useState(new Date());
  const [overrideDialog, setOverrideDialog] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [overrideData, setOverrideData] = useState({
    person: '',
    reason: '',
    startTime: '',
    endTime: ''
  });
  const [overrides, setOverrides] = useState({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // State for dynamically loaded schedule data
  const [scheduleData, setScheduleData] = React.useState(null);
  const [isLoadingSchedule, setIsLoadingSchedule] = React.useState(true);

  // Team members for the override dialog - loaded from teams.yaml (all team members)
  const [teamMembers, setTeamMembers] = React.useState([]);

  // Load all team members from teams.yaml for override dropdown
  React.useEffect(() => {
    const loadTeamMembers = async () => {
      try {
        const allTeamMembers = await loadTeamData();
        setTeamMembers(allTeamMembers);
        console.log('👥 Loaded all team members for overrides:', allTeamMembers);
      } catch (error) {
        console.error('Failed to load team members:', error);
        setTeamMembers([]);
      }
    };

    loadTeamMembers();
  }, []);

  // Load schedule data dynamically from YAML
  React.useEffect(() => {
    const loadSchedule = async () => {
      try {
        setIsLoadingSchedule(true);
        const data = await loadScheduleData();
        setScheduleData(data);
        console.log('📅 Schedule loaded successfully:', data);
      } catch (error) {
        console.error('Failed to load schedule:', error);
      } finally {
        setIsLoadingSchedule(false);
      }
    };

    loadSchedule();
  }, []);

  // Load overrides from localStorage
  const loadOverrides = () => {
    try {
      const saved = localStorage.getItem('shiftOverrides');
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('Error loading overrides:', error);
      return {};
    }
  };

  // Save overrides to localStorage and sync to backend
  const saveOverrides = async (newOverrides) => {
    try {
      localStorage.setItem('shiftOverrides', JSON.stringify(newOverrides));
      setOverrides(newOverrides);

      // Sync overrides to backend for notifications
      try {
        const response = await fetch('http://localhost:3001/api/sync-overrides', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ overrides: newOverrides }),
        });

        if (response.ok) {
          console.log('✅ Overrides synced to backend successfully');
        } else {
          console.warn('⚠️ Failed to sync overrides to backend');
        }
      } catch (syncError) {
        console.warn('⚠️ Could not sync overrides to backend:', syncError.message);
        // Don't fail the override save if backend sync fails
      }
    } catch (error) {
      console.error('Error saving overrides:', error);
    }
  };

  // Initialize overrides from localStorage
  React.useEffect(() => {
    const loadedOverrides = loadOverrides();
    setOverrides(loadedOverrides);
  }, []);

  // Generate week view data using real schedule
  const generateWeekData = () => {
    if (!scheduleData) return []; // Return empty if schedule not loaded yet

    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const weekData = [];



    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);

      const isWeekend = date.getDay() === 0 || date.getDay() === 6;

      if (isWeekend) {
        // Weekend schedule - rotates every 7 days
        const weekendConfig = scheduleData.weekend.full_weekend;
        const weekendStartDate = new Date(weekendConfig.start_time); // Dynamic start date from YAML
        const weeksDiff = Math.floor((date - weekendStartDate) / (1000 * 60 * 60 * 24 * 7));
        const weekendRotationIndex = ((weeksDiff % weekendConfig.users.length) + weekendConfig.users.length) % weekendConfig.users.length;

        const dateKey = date.toDateString();
        const overrideKey = `${dateKey}-full_weekend`;
        const isOverridden = !!overrides[overrideKey];

        weekData.push({
          date: date,
          dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNumber: date.getDate(),
          isWeekend,
          shifts: [{
            name: weekendConfig.display_name || 'Weekend Coverage',
            time: `${new Date(weekendConfig.start_time).toLocaleTimeString('en-US', {
              hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC'
            })} - ${new Date(weekendConfig.end_time).toLocaleTimeString('en-US', {
              hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC'
            })} UTC`,
            person: isOverridden ? overrides[overrideKey].person : weekendConfig.users[weekendRotationIndex],
            color: isOverridden ? '#ff6b35' : '#6b7280',
            isOverride: isOverridden,
            reason: overrides[overrideKey]?.reason,
            layerKey: 'full_weekend'
          }]
        });
      } else {
        // Weekday schedule - each layer has its own start date

        // Calculate weekdays only (skip weekends)
        const getWeekdaysDiff = (startDate, currentDate) => {
          let weekdayCount = 0;
          const tempDate = new Date(startDate);
          tempDate.setDate(tempDate.getDate() + 1); // Start from day after start date

          while (tempDate <= currentDate) {
            const dayOfWeek = tempDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
              weekdayCount++;
            }
            tempDate.setDate(tempDate.getDate() + 1);
          }

          return weekdayCount;
        };

        // Calculate rotation index safely (handle negative days)
        const getRotationIndex = (weekdaysDiff, rotationDays, usersLength) => {
          const rotationCycle = Math.floor(weekdaysDiff / rotationDays);
          const index = ((rotationCycle % usersLength) + usersLength) % usersLength;

          // Debug logging
          console.log(`Date: ${date.toDateString()}, weekdaysDiff: ${weekdaysDiff}, rotationCycle: ${rotationCycle}, index: ${index}, rotationDays: ${rotationDays}`);

          return index;
        };

        // Check for overrides for this date
        const dateKey = date.toDateString();

        // Generate shifts for each layer with proper rotation - FULLY DYNAMIC
        const shifts = [];
        const layerColors = ['#FF4438', '#00D9FF', '#4CAF50', '#FFB74D', '#9C27B0', '#FF6B6B', '#26A69A', '#FFA726']; // Redis color palette

        // Dynamically create layers from schedule data
        const layers = Object.keys(scheduleData.weekday).map((layerKey, index) => ({
          key: layerKey,
          name: scheduleData.weekday[layerKey].display_name || layerKey.charAt(0).toUpperCase() + layerKey.slice(1).replace(/([A-Z])/g, ' $1'),
          color: layerColors[index % layerColors.length]
        }));

        layers.forEach(({ key, name, color }) => {
          const layerConfig = scheduleData.weekday[key];

          // Use the calculateCurrentAssignment function from scheduleLoader
          // This is the same logic used everywhere else in the app
          const assignment = calculateCurrentAssignment(layerConfig, date, overrides, key);

          // Safety check for assignment result
          if (!assignment || !assignment.person) {
            console.error('Invalid assignment result:', assignment, 'for layer:', key);
            return; // Skip this layer
          }

          // Use the person from calculateCurrentAssignment
          const person = assignment.person;

          console.log(`\n=== ${key} on ${date.toDateString()} ===`);
          console.log('Assignment result:', assignment);

          // Extract time from layer configuration - display in UTC
          const startTime = new Date(layerConfig.start_time).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'UTC'
          });
          const endTime = new Date(layerConfig.end_time).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'UTC'
          });
          const timeSlot = `${startTime} - ${endTime} UTC`;

          // Check for overrides
          const overrideKey = `${dateKey}-${key}`;
          const isOverridden = !!overrides[overrideKey];

          shifts.push({
            name,
            time: timeSlot,
            person: isOverridden ? overrides[overrideKey].person : person,
            color: isOverridden ? '#ff6b35' : color, // Orange if overridden
            isOverride: isOverridden,
            reason: overrides[overrideKey]?.reason,
            layerKey: key
          });
        });

        weekData.push({
          date: date,
          dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
          dayNumber: date.getDate(),
          isWeekend,
          shifts
        });
      }
    }
    return weekData;
  };

  // Generate month view data
  const generateMonthData = () => {
    if (!scheduleData) return []; // Return empty if schedule not loaded yet

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Get first day of month and calculate starting date (including previous month days)
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday

    const monthData = [];

    // Generate 6 weeks (42 days) to cover the entire month view
    for (let week = 0; week < 6; week++) {
      const weekData = [];
      for (let day = 0; day < 7; day++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + (week * 7) + day);

        const isCurrentMonth = date.getMonth() === month;
        const isToday = date.toDateString() === new Date().toDateString();
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        // Get primary shift for the day (Layer 1 for weekdays, weekend coverage for weekends)
        let primaryShift = null;
        if (isWeekend) {
          // Weekend schedule - rotates every 7 days
          const weekendConfig = scheduleData.weekend.full_weekend;
          const weekendStartDate = new Date(weekendConfig.start_time); // Dynamic start date from YAML
          const weeksDiff = Math.floor((date - weekendStartDate) / (1000 * 60 * 60 * 24 * 7));
          const weekendRotationIndex = ((weeksDiff % weekendConfig.users.length) + weekendConfig.users.length) % weekendConfig.users.length;

          const dateKey = date.toDateString();
          primaryShift = {
            person: overrides[`${dateKey}-full_weekend`]?.person || weekendConfig.users[weekendRotationIndex],
            isOverride: !!overrides[`${dateKey}-full_weekend`],
            reason: overrides[`${dateKey}-full_weekend`]?.reason
          };
        } else {
          const firstLayer = Object.values(scheduleData.weekday)[0];
          const startDate = new Date(firstLayer.start_time);

          // Calculate weekdays only (skip weekends) - same logic as weekly view
          const getWeekdaysDiff = (startDate, currentDate) => {
            let weekdayCount = 0;
            const tempDate = new Date(startDate);

            tempDate.setDate(tempDate.getDate() + 1); // Start from day after start date

            while (tempDate <= currentDate) {
              const dayOfWeek = tempDate.getDay();
              if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
                weekdayCount++;
              }
              tempDate.setDate(tempDate.getDate() + 1);
            }

            return weekdayCount;
          };

          const weekdaysDiff = getWeekdaysDiff(startDate, date);

          const getRotationIndex = (weekdaysDiff, rotationDays, usersLength) => {
            const rotationCycle = Math.floor(weekdaysDiff / rotationDays);
            const index = ((rotationCycle % usersLength) + usersLength) % usersLength;
            return index;
          };

          const dateKey = date.toDateString();

          // If date is before start date, show as not scheduled
          if (date < startDate) {
            primaryShift = {
              person: 'Not Scheduled',
              isOverride: false,
              reason: 'Schedule starts Sep 5th'
            };
          } else {
            const layer1Config = scheduleData.weekday.layer1;
            const rotationIndex = getRotationIndex(weekdaysDiff, layer1Config.days_rotate, layer1Config.users.length);

            primaryShift = {
              person: overrides[`${dateKey}-layer1`]?.person || layer1Config.users[rotationIndex],
              isOverride: !!overrides[`${dateKey}-layer1`],
              reason: overrides[`${dateKey}-layer1`]?.reason
            };
          }
        }

        weekData.push({
          date,
          dayNumber: date.getDate(),
          isCurrentMonth,
          isToday,
          isWeekend,
          primaryShift
        });
      }
      monthData.push(weekData);
    }

    return monthData;
  };

  const handleOverrideClick = (day, shift) => {
    setSelectedSlot({ day, shift });

    // Parse time safely and remove UTC text
    let startTime = '';
    let endTime = '';
    if (shift.time && shift.time.includes(' - ')) {
      const timeParts = shift.time.split(' - ');
      startTime = (timeParts[0] || '').replace(' UTC', '').trim();
      endTime = (timeParts[1] || '').replace(' UTC', '').trim();
    }

    setOverrideData({
      person: shift.person,
      reason: shift.reason || '',
      startTime: startTime,
      endTime: endTime
    });
    setOverrideDialog(true);
  };

  // Time validation helper - 24-hour format only
  const validateTime = (timeStr) => {
    if (!timeStr) return false;
    // 24-hour format: HH:MM or H:MM
    const regex24 = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return regex24.test(timeStr.trim());
  };

  const handleOverrideRemove = async () => {
    if (!selectedSlot) return;

    const overrideKey = `${selectedSlot.day.date.toDateString()}-${selectedSlot.shift.layerKey}`;

    try {
      // Remove from localStorage
      const existingOverrides = JSON.parse(localStorage.getItem('shiftOverrides') || '{}');
      delete existingOverrides[overrideKey];
      localStorage.setItem('shiftOverrides', JSON.stringify(existingOverrides));

      // Sync to backend
      const response = await fetch('http://localhost:3001/api/sync-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: existingOverrides })
      });

      if (!response.ok) {
        throw new Error('Failed to sync overrides to backend');
      }

      setSnackbar({
        open: true,
        message: 'Override removed successfully!',
        severity: 'success'
      });

      setOverrideDialog(false);
      // Force re-render by updating a state and clearing selected slot
      setOverrideData({ person: '', reason: '', startTime: '', endTime: '' });
      setSelectedSlot(null);
      // Trigger re-render by updating the overrides state after a small delay
      setTimeout(() => {
        const updatedOverrides = JSON.parse(localStorage.getItem('shiftOverrides') || '{}');
        setOverrides(updatedOverrides);
      }, 100);
    } catch (error) {
      console.error('Error removing override:', error);
      setSnackbar({
        open: true,
        message: 'Failed to remove override',
        severity: 'error'
      });
    }
  };

  const handleOverrideSubmit = async () => {
    if (!overrideData.person || !overrideData.reason) {
      setSnackbar({
        open: true,
        message: 'Please fill in all required fields',
        severity: 'error'
      });
      return;
    }

    // Validate time format if provided
    if (overrideData.startTime && !validateTime(overrideData.startTime)) {
      setSnackbar({
        open: true,
        message: 'Invalid start time format. Please use HH:MM format (e.g., 09:30).',
        severity: 'error'
      });
      return;
    }

    if (overrideData.endTime && !validateTime(overrideData.endTime)) {
      setSnackbar({
        open: true,
        message: 'Invalid end time format. Please use HH:MM format (e.g., 15:30).',
        severity: 'error'
      });
      return;
    }

    // Safety check for selectedSlot
    if (!selectedSlot || !selectedSlot.day || !selectedSlot.shift) {
      setSnackbar({
        open: true,
        message: 'Invalid selection. Please try again.',
        severity: 'error'
      });
      return;
    }

    // Create override key - use the same format as in shift generation
    const overrideKey = `${selectedSlot.day.date.toDateString()}-${selectedSlot.shift.layerKey}`;

    // Update overrides and save to localStorage
    const newOverrides = {
      ...overrides,
      [overrideKey]: {
        person: overrideData.person,
        reason: overrideData.reason,
        startTime: overrideData.startTime,
        endTime: overrideData.endTime,
        originalPerson: selectedSlot.shift.person,
        timestamp: new Date().toISOString()
      }
    };

    await saveOverrides(newOverrides);

    setSnackbar({
      open: true,
      message: `Override applied successfully for ${selectedSlot.shift.name}`,
      severity: 'success'
    });

    setOverrideDialog(false);
    setSelectedSlot(null);
    setOverrideData({ person: '', reason: '', startTime: '', endTime: '' });
  };

  const navigateWeek = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + (direction * 7));
    setCurrentDate(newDate);
  };

  const navigateMonth = (direction) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const handleExcelExport = async () => {
    try {
      setSnackbar({
        open: true,
        message: 'Generating Excel file...',
        severity: 'info'
      });

      const result = await exportMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);

      if (result.success) {
        setSnackbar({
          open: true,
          message: `Excel file downloaded: ${result.filename}`,
          severity: 'success'
        });
      } else {
        setSnackbar({
          open: true,
          message: `Export failed: ${result.error}`,
          severity: 'error'
        });
      }
    } catch (error) {
      console.error('Excel export error:', error);
      setSnackbar({
        open: true,
        message: 'Failed to export Excel file',
        severity: 'error'
      });
    }
  };

  const weekData = generateWeekData();
  const monthData = generateMonthData();

  // Show loading state while schedule is being loaded
  if (isLoadingSchedule) {
    return (
      <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="center" minHeight="400px">
          <Box textAlign="center">
            <Typography variant="h6" gutterBottom>
              Loading Schedule...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Reading schedule.yaml configuration
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" fontWeight={600} sx={{ display: 'flex', alignItems: 'center' }}>
          <CalendarIcon sx={{ mr: 2, color: 'primary.main' }} />
          Schedule Calendar
        </Typography>
        
        <Box display="flex" alignItems="center" gap={2}>
          <Tabs value={viewMode} onChange={(e, newValue) => setViewMode(newValue)}>
            <Tab label="Week View" />
            <Tab label="Month View" />
          </Tabs>
        </Box>
      </Box>

      {/* Navigation */}
      <Box display="flex" alignItems="center" justifyContent="between" mb={3}>
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton
            onClick={() => viewMode === 0 ? navigateWeek(-1) : navigateMonth(-1)}
            size="small"
          >
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="h6" sx={{ minWidth: 200, textAlign: 'center' }}>
            {viewMode === 0
              ? weekData[0]?.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              : currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            }
          </Typography>
          <IconButton
            onClick={() => viewMode === 0 ? navigateWeek(1) : navigateMonth(1)}
            size="small"
          >
            <ChevronRightIcon />
          </IconButton>
        </Box>
        
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExcelExport}
            size="small"
          >
            Export Excel
          </Button>


        </Box>
      </Box>

      {/* Week View */}
      {viewMode === 0 && (
        <Grid container spacing={1}>
          {weekData.map((day, dayIndex) => (
            <Grid item xs={12/7} key={dayIndex}>
              <Card 
                sx={{ 
                  minHeight: 400,
                  backgroundColor: day.isWeekend ? 'action.hover' : 'background.paper',
                  border: day.date.toDateString() === new Date().toDateString() ? 2 : 1,
                  borderColor: day.date.toDateString() === new Date().toDateString() ? 'primary.main' : 'divider'
                }}
              >
                <CardContent sx={{ p: 1 }}>
                  <Box textAlign="center" mb={1}>
                    <Typography variant="caption" color="text.secondary">
                      {day.dayName}
                    </Typography>
                    <Typography variant="h6" fontWeight={600}>
                      {day.dayNumber}
                    </Typography>
                  </Box>
                  
                  <Box display="flex" flexDirection="column" gap={0.5}>
                    {day.shifts.map((shift, shiftIndex) => (
                      <Card
                        key={shiftIndex}
                        sx={{
                          backgroundColor: shift.color,
                          color: 'white',
                          cursor: 'pointer',
                          '&:hover': {
                            opacity: 0.8
                          },
                          position: 'relative'
                        }}
                        onClick={() => handleOverrideClick(day, shift)}
                      >
                        <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                          {shift.isOverride && (
                            <WarningIcon sx={{ position: 'absolute', top: 2, right: 2, fontSize: 16 }} />
                          )}
                          <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.9 }}>
                            {shift.name}
                          </Typography>
                          <Typography variant="caption" display="block" sx={{ fontSize: '0.65rem' }}>
                            {shift.time}
                          </Typography>
                          <Box display="flex" alignItems="center" mt={0.5}>
                            <Avatar sx={{ width: 16, height: 16, fontSize: '0.6rem', mr: 0.5 }}>
                              {shift.person[0].toUpperCase()}
                            </Avatar>
                            <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
                              {shift.person}
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Month View */}
      {viewMode === 1 && (
        <Box>
          {/* Month Header */}
          <Grid container spacing={1} mb={2}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Grid item xs key={day}>
                <Typography
                  variant="subtitle2"
                  textAlign="center"
                  fontWeight={600}
                  color="text.secondary"
                >
                  {day}
                </Typography>
              </Grid>
            ))}
          </Grid>

          {/* Month Calendar */}
          {monthData.map((week, weekIndex) => (
            <Grid container spacing={1} key={weekIndex} mb={1}>
              {week.map((day, dayIndex) => (
                <Grid item xs key={dayIndex}>
                  <Card
                    sx={{
                      minHeight: 80,
                      backgroundColor: day.isCurrentMonth ? 'background.paper' : 'action.hover',
                      border: day.isToday ? '2px solid' : '1px solid',
                      borderColor: day.isToday ? 'primary.main' : 'divider',
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: day.isCurrentMonth ? 'action.hover' : 'action.selected'
                      }
                    }}
                    onClick={() => {
                      if (day.isCurrentMonth) {
                        // For month view, create a simple shift object for override
                        const shift = {
                          name: day.isWeekend ?
                            (scheduleData.weekend.full_weekend.display_name || 'Weekend Coverage') :
                            (scheduleData.weekday.layer1.display_name || 'Layer 1'),
                          time: day.isWeekend ? '04:00 - 04:00+2 UTC' : '04:00 - 10:00 UTC',
                          person: day.primaryShift.person,
                          isOverride: day.primaryShift.isOverride,
                          reason: day.primaryShift.reason,
                          layerKey: day.isWeekend ? 'full_weekend' : 'layer1',
                          color: day.primaryShift.isOverride ? '#ff6b35' : (day.isWeekend ? '#6b7280' : '#059669')
                        };
                        handleOverrideClick(day, shift);
                      }
                    }}
                  >
                    <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Typography
                          variant="body2"
                          fontWeight={day.isToday ? 600 : 400}
                          color={day.isCurrentMonth ? 'text.primary' : 'text.disabled'}
                        >
                          {day.dayNumber}
                        </Typography>
                        {day.primaryShift.isOverride && (
                          <WarningIcon sx={{ fontSize: 12, color: 'warning.main' }} />
                        )}
                      </Box>

                      {day.isCurrentMonth && (
                        <Box mt={0.5}>
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: '0.6rem',
                              color: day.primaryShift.isOverride ? 'warning.main' : 'text.secondary',
                              fontWeight: day.primaryShift.isOverride ? 600 : 400
                            }}
                          >
                            {day.primaryShift.person}
                          </Typography>
                          {day.primaryShift.isOverride && (
                            <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'warning.main', display: 'block' }}>
                              Override
                            </Typography>
                          )}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ))}
        </Box>
      )}

      {/* Override Dialog */}
      <Dialog open={overrideDialog} onClose={() => setOverrideDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <WarningIcon sx={{ mr: 1, color: 'warning.main' }} />
            Schedule Override
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will temporarily override the scheduled person for this shift.
          </Alert>
          
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Assign To</InputLabel>
                <Select
                  value={overrideData.person}
                  onChange={(e) => setOverrideData({...overrideData, person: e.target.value})}
                  label="Assign To"
                >
                  {teamMembers.map(member => (
                    <MenuItem key={member.id} value={member.name}>
                      <Box display="flex" alignItems="center">
                        <Avatar sx={{ width: 24, height: 24, mr: 1, fontSize: '0.8rem' }}>
                          {member.name[0].toUpperCase()}
                        </Avatar>
                        {member.name}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Start Time"
                value={overrideData.startTime}
                onChange={(e) => setOverrideData({...overrideData, startTime: e.target.value})}
                placeholder="09:30"
                helperText="Format: HH:MM (24-hour)"
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                fullWidth
                label="End Time"
                value={overrideData.endTime}
                onChange={(e) => setOverrideData({...overrideData, endTime: e.target.value})}
                placeholder="15:30"
                helperText="Format: HH:MM (24-hour)"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Reason for Override"
                value={overrideData.reason}
                onChange={(e) => setOverrideData({...overrideData, reason: e.target.value})}
                placeholder="e.g., Emergency incident, Original person unavailable..."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverrideDialog(false)}>Cancel</Button>
          {selectedSlot && selectedSlot.shift.isOverride && (
            <Button
              onClick={handleOverrideRemove}
              variant="outlined"
              color="error"
              sx={{ mr: 1 }}
            >
              Remove Override
            </Button>
          )}
          <Button
            onClick={handleOverrideSubmit}
            variant="contained"
            color="warning"
            disabled={!overrideData.person || !overrideData.reason}
          >
            Apply Override
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success/Error Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Paper>
  );
};

export default CalendarView;
