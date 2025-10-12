import * as XLSX from 'xlsx';
import { loadScheduleData, calculateCurrentAssignment } from './scheduleLoader';

// Generate Excel file with monthly schedule data
export const exportScheduleToExcel = async (year, month) => {
  try {
    // Load schedule data
    const scheduleData = await loadScheduleData();
    const overrides = JSON.parse(localStorage.getItem('schedule-overrides') || '{}');
    
    // Get the number of days in the month
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Generate data for each day of the month
    const scheduleRows = [];
    
    // Header row
    const headers = ['Date', 'Day'];
    const layers = Object.keys(scheduleData.weekday || {});
    const weekendLayers = Object.keys(scheduleData.weekend || {});
    
    // Add layer headers
    layers.forEach(layerKey => {
      const layerConfig = scheduleData.weekday[layerKey];
      headers.push(layerConfig.display_name || layerKey);
    });
    
    weekendLayers.forEach(layerKey => {
      const layerConfig = scheduleData.weekend[layerKey];
      headers.push(layerConfig.display_name || layerKey);
    });
    
    scheduleRows.push(headers);
    
    // Generate data for each day
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const dateStr = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
      
      const row = [dateStr, dayName];
      
      // Check if it's a weekend
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      
      if (isWeekend) {
        // For weekends, show weekend schedule
        layers.forEach(() => row.push('Weekend'));
        
        weekendLayers.forEach(layerKey => {
          const layerConfig = scheduleData.weekend[layerKey];
          const assignment = calculateCurrentAssignment(layerConfig, date, overrides);
          row.push(assignment.person);
        });
      } else {
        // For weekdays, show weekday schedule
        layers.forEach(layerKey => {
          const layerConfig = scheduleData.weekday[layerKey];
          const assignment = calculateCurrentAssignment(layerConfig, date, overrides);
          row.push(assignment.person);
        });
        
        weekendLayers.forEach(() => row.push('Weekday'));
      }
      
      scheduleRows.push(row);
    }
    
    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(scheduleRows);
    
    // Set column widths
    const colWidths = [
      { wch: 10 }, // Date
      { wch: 8 },  // Day
    ];
    
    // Add widths for each layer
    [...layers, ...weekendLayers].forEach(() => {
      colWidths.push({ wch: 15 });
    });
    
    worksheet['!cols'] = colWidths;
    
    // Style the header row
    const headerRange = XLSX.utils.decode_range(worksheet['!ref']);
    for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!worksheet[cellAddress]) continue;
      
      worksheet[cellAddress].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "CCCCCC" } },
        alignment: { horizontal: "center" }
      };
    }
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule');
    
    // Create summary sheet
    const summaryData = [
      ['Redis On-Call Schedule Summary'],
      ['Month:', monthName],
      ['Generated:', new Date().toLocaleString()],
      [''],
      ['Layer Information:']
    ];
    
    // Add layer details
    layers.forEach(layerKey => {
      const layerConfig = scheduleData.weekday[layerKey];
      summaryData.push([
        layerConfig.display_name || layerKey,
        `${layerConfig.start_time} - ${layerConfig.end_time}`,
        `Rotation: ${layerConfig.days_rotate} days`,
        `Users: ${layerConfig.users.join(', ')}`
      ]);
    });
    
    weekendLayers.forEach(layerKey => {
      const layerConfig = scheduleData.weekend[layerKey];
      summaryData.push([
        layerConfig.display_name || layerKey,
        `${layerConfig.start_time} - ${layerConfig.end_time}`,
        `Rotation: ${layerConfig.days_rotate} days`,
        `Users: ${layerConfig.users.join(', ')}`
      ]);
    });
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 30 }];
    
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Generate filename
    const filename = `Redis_OnCall_Schedule_${monthName.replace(' ', '_')}.xlsx`;
    
    // Download the file
    XLSX.writeFile(workbook, filename);
    
    return { success: true, filename };
    
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    return { success: false, error: error.message };
  }
};

// Export current month by default
export const exportCurrentMonth = () => {
  const now = new Date();
  return exportScheduleToExcel(now.getFullYear(), now.getMonth() + 1);
};

// Export specific month
export const exportMonth = (year, month) => {
  return exportScheduleToExcel(year, month);
};
