export const MAX_SCHEDULE_RANGE_DAYS = 31;

export type ScheduleDateRange = {
  startUtc: string;
  endUtc: string;
};

export function boundedScheduleDateRange(
  startDate: unknown,
  endDate: unknown,
): ScheduleDateRange {
  const start = parseLocalDate(startDate, "startDate");
  const end = parseLocalDate(endDate, "endDate");
  const dayCount =
    (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
      86_400_000 +
    1;

  if (dayCount < 1) {
    throw new Error("endDate must be on or after startDate.");
  }
  if (dayCount > MAX_SCHEDULE_RANGE_DAYS) {
    throw new Error(
      `The schedule range cannot exceed ${MAX_SCHEDULE_RANGE_DAYS} days.`,
    );
  }

  const endExclusive = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate() + 1,
  );
  return {
    startUtc: start.toISOString(),
    endUtc: endExclusive.toISOString(),
  };
}

export function createTrainingStateWindow(now = new Date()) {
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const currentWeek = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysSinceMonday,
  );
  const nextWeek = new Date(
    currentWeek.getFullYear(),
    currentWeek.getMonth(),
    currentWeek.getDate() + 7,
  );
  const recentStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 7,
  );

  return {
    currentWeekStart: localDate(currentWeek),
    nextWeekStart: localDate(nextWeek),
    recentStartUtc: recentStart.toISOString(),
    nowUtc: now.toISOString(),
  };
}

function parseLocalDate(value: unknown, field: string): Date {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a date in YYYY-MM-DD format.`);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error(`${field} must be a date in YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`${field} must be a valid calendar date.`);
  }

  return date;
}

function localDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
