export const GREETING_PHRASES = [
  "{timeGreeting}, {name}!",
  "Stay grinding, {name}.",
  "Welcome back, {name}. Let's get one more entry in.",
  "Ready to build your next packet, {name}?",
  "Small wins add up, {name}.",
  "{timeGreeting}, {name}. Your records are ready when you are.",
  "Good to see you, {name}.",
  "One clear entry at a time, {name}.",
  "{name}, your next application can start here.",
  "Keep a clear record, {name}.",
  "Nice to have you back, {name}.",
  "{timeGreeting}, {name}. A tidy vault saves time later.",
  "Add the proof while you still remember the details, {name}.",
  "You are building a strong packet, {name}.",
  "{name}, pick up where you left off.",
  "Steady progress counts, {name}.",
  "{timeGreeting}, {name}. What would you like to add today?",
  "Your future application will be easier, {name}.",
  "Everything in one place, {name}.",
  "Let's make the next form easier, {name}.",
] as const;

export const NEUTRAL_GREETING = "Welcome back, {name}";

const HONG_KONG = "Asia/Hong_Kong";

export function displayName(
  username: string | null | undefined,
  email: string | null | undefined,
): string {
  const name = username?.trim();
  if (name) return name;

  const trimmedEmail = email?.trim();
  if (!trimmedEmail) return "there";

  const prefix = trimmedEmail.split("@")[0]?.trim();
  return prefix || "there";
}

export function timeGreeting(date: Date = new Date()): string {
  const hour = hourInHongKong(date);
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  if (hour >= 18 && hour < 23) return "Good evening";
  return "Burning the midnight oil";
}

export function fillGreeting(template: string, name: string, now: Date = new Date()): string {
  const withTime = template.includes("{timeGreeting}")
    ? template.split("{timeGreeting}").join(timeGreeting(now))
    : template;
  return withTime.split("{name}").join(name);
}

export function selectGreetingPhrase(
  stored: string | null,
  random: () => number = Math.random,
): (typeof GREETING_PHRASES)[number] {
  if (stored && isGreetingPhrase(stored)) return stored;

  const index = Math.min(
    GREETING_PHRASES.length - 1,
    Math.max(0, Math.floor(random() * GREETING_PHRASES.length)),
  );
  return GREETING_PHRASES[index];
}

export function summaryLine(achievements: number | null, evidenceFiles: number | null): string {
  return `${formatCount(achievements, "achievement", "achievements")} · ${formatCount(evidenceFiles, "evidence file", "evidence files")}`;
}

function isGreetingPhrase(value: string): value is (typeof GREETING_PHRASES)[number] {
  return (GREETING_PHRASES as readonly string[]).includes(value);
}

function formatCount(count: number | null, singular: string, plural: string): string {
  if (count === null) return `- ${plural}`;
  if (count === 1) return `1 ${singular}`;
  return `${count} ${plural}`;
}

function hourInHongKong(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HONG_KONG,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "hour")?.value ?? "0";
  const hour = Number.parseInt(value, 10);
  if (!Number.isFinite(hour)) return 0;
  return ((hour % 24) + 24) % 24;
}
