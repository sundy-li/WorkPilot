interface CreateTimestampLabelsOptions {
  locale?: string;
  timeZone?: string;
}

export function createTimestampLabels(value: string, options: CreateTimestampLabelsOptions = {}) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      compact: value,
      precise: value
    };
  }

  const { locale = "en-US", timeZone } = options;

  return {
    compact: new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone
    })
      .format(date)
      .replace(" at ", ", "),
    precise: new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
      timeZone
    })
      .format(date)
      .replace(" at ", ", ")
  };
}
