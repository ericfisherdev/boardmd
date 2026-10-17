import { Clock } from '../application/ports';
import { formatCalendarDate } from '../domain/calendarDate';

export class SystemClock implements Clock {
	today(): string {
		return formatCalendarDate(new Date());
	}

	timestamp(): string {
		return new Date().toISOString();
	}
}
