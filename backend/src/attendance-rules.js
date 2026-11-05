// Local Malaysian wall-clock arithmetic. Never parse a browser datetime as UTC.
export const attendanceStatuses=['Present','Late','Absent','Half Day','Annual Leave','Medical Leave','Unpaid Leave','Emergency Leave','Rest Day','Public Holiday'];
export const nonWorkStatuses=['Absent','Annual Leave','Medical Leave','Unpaid Leave','Emergency Leave','Rest Day','Public Holiday'];
export const attendanceSources=['Manual','Web','Mobile','POS','Biometric','Import','Leave'];
export const attendanceImportHeaders=['staff_no','attendance_date','session_no','scheduled_clock_in','scheduled_clock_out','clock_in','clock_out','break_minutes','attendance_status','clock_in_notes','clock_out_notes','status'];
export class AttendanceError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
const invalid=(c)=>{throw new AttendanceError(c);};
export function attendanceDate(raw){const s=String(raw??'').trim();let y,m,d;const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s),my=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);if(iso){[,y,m,d]=iso;}else if(my){[,d,m,y]=my;}else invalid('INVALID_ATTENDANCE_DATE');const t=Date.UTC(Number(y),Number(m)-1,Number(d));const date=new Date(t);if(date.getUTCFullYear()!==Number(y)||date.getUTCMonth()+1!==Number(m)||date.getUTCDate()!==Number(d))invalid('INVALID_ATTENDANCE_DATE');return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
export function attendanceTime(raw){if(raw===null||raw===undefined||String(raw).trim()==='')return null;let s=String(raw).trim().replace('T',' ');const my=/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);if(my)s=`${my[3]}-${my[2].padStart(2,'0')}-${my[1].padStart(2,'0')} ${my[4].padStart(2,'0')}:${my[5]}:${my[6]||'00'}`;const match=/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);if(!match)invalid('INVALID_ATTENDANCE_TIME');const date=attendanceDate(match[1]),h=Number(match[2]),m=Number(match[3]),sec=Number(match[4]||0);if(h>23||m>59||sec>59)invalid('INVALID_ATTENDANCE_TIME');return `${date} ${match[2]}:${match[3]}:${String(sec).padStart(2,'0')}`;}
const minuteValue=s=>{const [date,time]=s.split(' ');const [y,m,d]=date.split('-').map(Number);const [h,min]=time.split(':').map(Number);return Math.floor(Date.UTC(y,m-1,d,h,min)/60000);};
export function calculateAttendance(data){const a=data.scheduled_clock_in?attendanceTime(data.scheduled_clock_in):null,b=data.scheduled_clock_out?attendanceTime(data.scheduled_clock_out):null,c=data.clock_in?attendanceTime(data.clock_in):null,d=data.clock_out?attendanceTime(data.clock_out):null,breakMinutes=Number(data.break_minutes??0);if(!Number.isInteger(breakMinutes)||breakMinutes<0||breakMinutes>1440)invalid('INVALID_BREAK_MINUTES');if(b&&!a||d&&!c)invalid('CLOCK_IN_REQUIRED');if(a&&b&&(minuteValue(b)<minuteValue(a)||minuteValue(b)-minuteValue(a)>2880))invalid('INVALID_SCHEDULE_RANGE');if(c&&d&&(minuteValue(d)<minuteValue(c)||minuteValue(d)-minuteValue(c)>2880))invalid('INVALID_CLOCK_RANGE');if(nonWorkStatuses.includes(data.attendance_status)&&(c||d))invalid('NON_WORK_STATUS_CANNOT_HAVE_CLOCK');const worked=c&&d?Math.max(0,minuteValue(d)-minuteValue(c)-breakMinutes):0,scheduled=a&&b?Math.max(0,minuteValue(b)-minuteValue(a)-breakMinutes):0;return {scheduled_clock_in:a,scheduled_clock_out:b,clock_in:c,clock_out:d,break_minutes:breakMinutes,working_minutes:worked,overtime_minutes:c&&d&&a&&b?Math.max(0,worked-scheduled):0,late_minutes:c&&a?Math.max(0,minuteValue(c)-minuteValue(a)):0,early_leave_minutes:d&&b?Math.max(0,minuteValue(b)-minuteValue(d)):0};}
export function approvalReady(row){return !['Present','Late','Half Day'].includes(row.attendance_status)||Boolean(row.clock_in&&row.clock_out);}
export function parseAttendanceCsv(source){
 if(typeof source!=='string'||Buffer.byteLength(source,'utf8')>1024*1024)invalid('ATTENDANCE_CSV_TOO_LARGE');
 const lines=[];let row=[],field='',quoted=false,closed=false;
 const s=source.replace(/^\uFEFF/,'');
 const pushField=()=>{row.push(field);field='';closed=false;};
 const pushRow=()=>{pushField();if(row.some(v=>v.trim()))lines.push(row);row=[];};
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(c==='"'){
   if(quoted&&s[i+1]==='"'){field+='"';i++;}
   else if(quoted){quoted=false;closed=true;}
   else if(field.length||closed)invalid('CSV_INVALID_QUOTES');
   else quoted=true;
  }else if(c===','&&!quoted){pushField();}
  else if((c==='\n'||c==='\r')&&!quoted){pushRow();if(c==='\r'&&s[i+1]==='\n')i++;}
  else{if(closed)invalid('CSV_INVALID_QUOTES');field+=c;}
 }
 if(quoted)invalid('CSV_UNCLOSED_QUOTE');pushRow();
 if(lines.length<2||lines.length>1001)invalid('CSV_ROWS_LIMIT_1000');
 const headers=lines.shift().map(v=>v.trim().toLowerCase());
 if(headers.join(',')!==attendanceImportHeaders.join(','))invalid('CSV_HEADERS_MISMATCH');
 return lines.map((values,i)=>{if(values.length!==headers.length)invalid(`CSV_ROW_${i+2}_COLUMN_COUNT`);return Object.fromEntries(headers.map((k,j)=>[k,values[j].trim()]));});
}
export function attendanceCsvTemplate(){return '\uFEFF'+attendanceImportHeaders.join(',')+'\r\n';}
