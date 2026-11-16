export function startOfDayInTimezone(dateValue: string, timeZone: string) {
  const [year, month, day] = dateValue.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) throw new Error('Invalid local date');
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const get = (name: string) => Number(parts.find(part => part.type === name)?.value);
    const represented = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    guess += target - represented;
  }
  return new Date(guess);
}

export function endOfDayInTimezone(dateValue: string, timeZone: string) {
  const [year, month, day] = dateValue.slice(0, 10).split('-').map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return new Date(startOfDayInTimezone(nextDay, timeZone).getTime() - 1);
}
