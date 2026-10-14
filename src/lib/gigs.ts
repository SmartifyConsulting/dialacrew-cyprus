const DAY = 86_400_000;

/** Urgent when the event is less than 3 days away. */
export function isUrgent(eventDate: string, callTime: string, now = new Date()) {
  const start = new Date(`${eventDate}T${callTime.slice(0, 5)}:00`);
  const diff = start.getTime() - now.getTime();
  return diff >= 0 && diff < 3 * DAY;
}

/** Withdrawing with less than 24 hours' notice before call time incurs the penalty. */
export function lateWithdrawal(eventDate: string, callTime: string, now = new Date()) {
  const start = new Date(`${eventDate}T${callTime.slice(0, 5)}:00`);
  return start.getTime() - now.getTime() < DAY;
}
