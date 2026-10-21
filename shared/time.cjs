'use strict';
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit' });
function cairoDate(time=new Date()) {
  const parts=Object.fromEntries(formatter.formatToParts(time).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function nextDay(date) { return new Date(Date.parse(`${date}T12:00:00Z`)+86400000).toISOString().slice(0,10); }
function dayStart(date) {
  // Locate the first UTC instant of this Cairo calendar date, including DST midnight jumps.
  const midnight=Date.parse(`${date}T00:00:00Z`);
  let lo=midnight-18*3600000,hi=midnight+18*3600000;
  while(hi-lo>1000) { const mid=Math.floor((lo+hi)/2000)*1000; if(cairoDate(new Date(mid))<date)lo=mid;else hi=mid; }
  return new Date(hi).toISOString();
}
module.exports={cairoDate,nextDay,dayStart};
