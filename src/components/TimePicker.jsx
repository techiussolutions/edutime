import React from 'react';

export default function TimePicker({ value, onChange, onBlur, style }) {
  const [hh, mm] = (value || '08:00').split(':');
  
  let h = parseInt(hh, 10);
  if (isNaN(h)) h = 8;
  const m = mm || '00';
  
  const ampm = h >= 12 ? 'PM' : 'AM';
  
  let displayHour = h % 12;
  displayHour = displayHour === 0 ? 12 : displayHour;
  const hStr = displayHour.toString().padStart(2, '0');

  const handleHourChange = (e) => {
    let newH = parseInt(e.target.value, 10);
    if (ampm === 'PM' && newH !== 12) newH += 12;
    if (ampm === 'AM' && newH === 12) newH = 0;
    onChange(`${newH.toString().padStart(2, '0')}:${m}`);
  };

  const handleMinChange = (e) => {
    let hr = h.toString().padStart(2, '0');
    onChange(`${hr}:${e.target.value}`);
  };

  const handleAmPmChange = (e) => {
    const newAmPm = e.target.value;
    if (newAmPm === ampm) return;
    
    let currentH24 = h;
    if (newAmPm === 'PM' && currentH24 < 12) currentH24 += 12;
    if (newAmPm === 'AM' && currentH24 >= 12) currentH24 -= 12;
    
    onChange(`${currentH24.toString().padStart(2, '0')}:${m}`);
  };

  return (
    <div 
      style={{ display: 'inline-flex', gap: '3px', alignItems: 'center', ...style }}
      onBlur={(e) => {
        // Only trigger onBlur if focus leaves the container entirely
        if (!e.currentTarget.contains(e.relatedTarget)) {
          if (onBlur) onBlur();
        }
      }}
    >
      <select className="input input-sm" style={{ padding: '0 4px', width: '42px', textAlign: 'center', height: '100%' }} value={hStr} onChange={handleHourChange}>
        {Array.from({length: 12}, (_, i) => i + 1).map(hr => (
          <option key={hr} value={hr.toString().padStart(2, '0')}>{hr.toString().padStart(2, '0')}</option>
        ))}
      </select>
      <span style={{ fontWeight: 600, color: 'var(--tx-muted)' }}>:</span>
      <select className="input input-sm" style={{ padding: '0 4px', width: '42px', textAlign: 'center', height: '100%' }} value={m} onChange={handleMinChange}>
        {Array.from({length: 60}, (_, i) => i).map(min => (
          <option key={min} value={min.toString().padStart(2, '0')}>{min.toString().padStart(2, '0')}</option>
        ))}
      </select>
      <select className="input input-sm" style={{ padding: '0 4px', width: '48px', textAlign: 'center', height: '100%', marginLeft: '2px' }} value={ampm} onChange={handleAmPmChange}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
