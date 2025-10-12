import React from 'react';
import { Box, Typography } from '@mui/material';

const RedisLogo = ({ size = 'medium', showText = true }) => {
  
  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center'
    }}>
      {/* Redis text only */}
      {showText && (
        <Typography
          variant={size === 'small' ? 'h6' : size === 'large' ? 'h4' : 'h5'}
          component="div"
          sx={{
            fontWeight: 700,
            color: 'white',
            fontFamily: '"Inter", sans-serif',
            letterSpacing: '-0.5px'
          }}
        >
          Redis
        </Typography>
      )}
    </Box>
  );
};

export default RedisLogo;
