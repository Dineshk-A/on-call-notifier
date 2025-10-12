import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Notifications as NotificationIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Send as SendIcon
} from '@mui/icons-material';

const NotificationControl = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const API_BASE = 'http://localhost:3001/api';

  // Fetch status on component mount and periodically
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/status`);
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data);
        setLastUpdate(new Date());
        setError(null);
      } else {
        setError('Failed to fetch status');
      }
    } catch (err) {
      setError('Notification server not running');
      setStatus(null);
    }
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/start`, { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data);
        setError(null);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to start notification service');
    }
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/stop`, { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.data);
        setError(null);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to stop notification service');
    }
    setLoading(false);
  };

  const handleTestSlack = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/test-slack`, { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setError(null);
        alert('✅ Slack connection test successful! Check your Slack channel.');
      } else {
        setError('Slack connection test failed');
      }
    } catch (err) {
      setError('Failed to test Slack connection');
    }
    setLoading(false);
  };

  const handleSendCurrentOnCallNotification = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/send-test-notification`, { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        setError(null);
        alert('✅ Current on-call notification sent! Check your Slack channel.');
      } else {
        setError('Failed to send current on-call notification');
      }
    } catch (err) {
      setError('Failed to send current on-call notification');
    }
    setLoading(false);
  };

  const getStatusColor = (isRunning) => {
    return isRunning ? 'success' : 'error';
  };

  const getStatusIcon = (isRunning) => {
    return isRunning ? <SuccessIcon /> : <ErrorIcon />;
  };

  return (
    <Paper elevation={3} sx={{ p: 3, borderRadius: 3 }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" fontWeight={600} sx={{ display: 'flex', alignItems: 'center' }}>
          <NotificationIcon sx={{ mr: 2, color: 'primary.main' }} />
          Slack Notifications
        </Typography>
        <Tooltip title="Refresh Status">
          <IconButton onClick={fetchStatus} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Status Cards */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" gutterBottom>
                Service Status
              </Typography>
              {status ? (
                <Box>
                  <Box display="flex" alignItems="center" mb={2}>
                    <Chip
                      icon={getStatusIcon(status.isRunning)}
                      label={status.isRunning ? 'Running' : 'Stopped'}
                      color={getStatusColor(status.isRunning)}
                      variant="filled"
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Active Notifications: {status.activeNotifications}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Schedule Loaded: {status.scheduleLoaded ? 'Yes' : 'No'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Slack Enabled: {status.slackEnabled ? 'Yes' : 'No'}
                  </Typography>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {loading ? 'Loading...' : 'Service not available'}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" gutterBottom>
                Configuration
              </Typography>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Notifications sent at exact shift start times
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Last Updated: {lastUpdate ? lastUpdate.toLocaleTimeString() : 'Never'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Control Buttons */}
        <Grid item xs={12}>
          <Box display="flex" gap={2} flexWrap="wrap">
            <Button
              variant="contained"
              color="success"
              startIcon={loading ? <CircularProgress size={20} /> : <StartIcon />}
              onClick={handleStart}
              disabled={loading || (status && status.isRunning)}
            >
              Start Service
            </Button>

            <Button
              variant="contained"
              color="error"
              startIcon={loading ? <CircularProgress size={20} /> : <StopIcon />}
              onClick={handleStop}
              disabled={loading || (status && !status.isRunning)}
            >
              Stop Service
            </Button>

            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={20} /> : <SendIcon />}
              onClick={handleTestSlack}
              disabled={loading}
            >
              Test Slack Connection
            </Button>

            <Button
              variant="outlined"
              color="secondary"
              startIcon={loading ? <CircularProgress size={20} /> : <NotificationIcon />}
              onClick={handleSendCurrentOnCallNotification}
              disabled={loading}
            >
              Send Current On-Call Notification
            </Button>
          </Box>
        </Grid>

        {/* Instructions */}
        <Grid item xs={12}>
          <Alert severity="info">
            <Typography variant="subtitle2" gutterBottom>
              How it works:
            </Typography>
            <Typography variant="body2">
              • The notification service monitors your schedule.yaml file<br/>
              • It automatically sends Slack notifications at the exact moment each shift starts<br/>
              • Notifications are clean and simple: "📟 [Engineer] is now on-call for AMR-Redis-SRE schedule until [End Time]"<br/>
              • The service runs independently and will restart notifications after server restarts
            </Typography>
          </Alert>
        </Grid>

        {/* Footer */}
        <Grid item xs={12}>
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            mt={2}
            sx={{ opacity: 0.7 }}
          >
            <Typography variant="body2" color="text.secondary">
              Created with ❤️ by Dinesh Kumar
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
};

export default NotificationControl;
