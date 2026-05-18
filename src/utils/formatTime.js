export function formatAMPM(timeStr) {
  if (!timeStr) return '';
  const [hourString, minute] = timeStr.split(':');
  if (!hourString || !minute) return timeStr;
  
  let hour = parseInt(hourString, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  
  hour = hour % 12;
  hour = hour ? hour : 12; // the hour '0' should be '12'
  
  const hourFormatted = hour < 10 ? '0' + hour : hour;
  
  return `${hourFormatted}:${minute} ${ampm}`;
}
