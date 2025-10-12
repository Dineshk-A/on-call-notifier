import React, { useState, useEffect } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  Typography,
  Box,
  Grid,
  AppBar,
  Toolbar
} from '@mui/material';
import './styles/redis-background.css';

import ScheduleVisualization from './components/ScheduleVisualization';
import TeamMembers from './components/TeamMembers';
import CurrentShift from './components/CurrentShift';
import CalendarView from './components/CalendarView';
import NotificationControl from './components/NotificationControl';
import RedisLogo from './components/RedisLogo';

const App = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  const theme = createTheme({
    palette: {
      mode: 'dark', // Always use dark mode for Redis branding
      primary: {
        main: '#FF4438', // Redis red
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#00D9FF', // Redis blue accent
        contrastText: '#ffffff',
      },
      background: {
        default: '#1a2332', // Redis dark navy
        paper: '#2a3441', // Slightly lighter for cards
      },
      text: {
        primary: '#ffffff',
        secondary: '#b0bec5',
      },
      success: {
        main: '#4CAF50',
      },
      warning: {
        main: '#FFB74D',
      },
      error: {
        main: '#FF6B6B',
      },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h4: {
        fontWeight: 700,
        color: '#ffffff',
      },
      h5: {
        fontWeight: 600,
        color: '#ffffff',
      },
      h6: {
        fontWeight: 600,
        color: '#ffffff',
      },
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: '#FF4438', // Redis red header
            boxShadow: '0 2px 8px rgba(255, 68, 56, 0.2)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundColor: '#2a3441',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
          },
          contained: {
            backgroundColor: '#FF4438',
            '&:hover': {
              backgroundColor: '#e63c32',
            },
          },
        },
      },
    },
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className="redis-background">
        {/* Subtle Redis "e" watermark */}
        <div className="redis-watermark">e</div>
        <div className="redis-content">
          <AppBar position="static" elevation={2} sx={{
            backgroundColor: '#FF4438', // Redis red
            boxShadow: '0 2px 8px rgba(255, 68, 56, 0.2)',
          }}>
          <Toolbar sx={{ py: 1 }}>
            {/* Redis Logo */}
            <Box sx={{ mr: 3 }}>
              <RedisLogo size="medium" showText={true} />
            </Box>

            <Typography variant="h6" component="div" sx={{
              flexGrow: 1,
              fontWeight: 500,
              color: 'rgba(255, 255, 255, 0.9)',
              ml: 2
            }}>
              On-Call Schedule
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', mr: 2 }}>
              <Typography variant="body2" sx={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '0.75rem',
                fontWeight: 500
              }}>
                UTC: {currentTime.toLocaleString('en-US', {
                  timeZone: 'UTC',
                  dateStyle: 'short',
                  timeStyle: 'medium'
                })}
              </Typography>
              <Typography variant="body2" sx={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.7rem'
              }}>
                IST: {currentTime.toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata',
                  timeStyle: 'short'
                })} | EST: {currentTime.toLocaleString('en-US', {
                  timeZone: 'America/New_York',
                  timeStyle: 'short'
                })}
              </Typography>
            </Box>

          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ py: 4, position: 'relative', zIndex: 5 }}>
          <Grid container spacing={3}>
            {/* Current Shift Status */}
            <Grid item xs={12}>
              <CurrentShift />
            </Grid>

            {/* Calendar View - Now Working! */}
            <Grid item xs={12}>
              <CalendarView />
            </Grid>

            {/* Schedule Visualization */}
            <Grid item xs={12} lg={8}>
              <ScheduleVisualization />
            </Grid>

            {/* Team Members */}
            <Grid item xs={12} lg={4}>
              <TeamMembers />
            </Grid>

            {/* Notification Control */}
            <Grid item xs={12}>
              <NotificationControl />
            </Grid>
          </Grid>
        </Container>
        </div>
      </Box>
    </ThemeProvider>
  );
};

export default App;
