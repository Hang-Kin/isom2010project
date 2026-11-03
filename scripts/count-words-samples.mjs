import {
  countChars,
  countWords,
  formatCountLabel,
  parseAnswerLimit,
  summarizeAnswers,
} from "../lib/textcount.ts";

const samples = [
  {
    name: "latin",
    text: "Clear writing wins scholarships",
    words: 4,
  },
  {
    name: "cjk",
    text: "奖学金申请需要证据",
    words: 9,
  },
  {
    name: "mixed",
    text: "I won 一等奖 in 2024",
    words: 7,
  },
  {
    name: "empty",
    text: "",
    words: 0,
  },
  {
    name: "bullets",
    text: "- Clear writing\n* wins scholarships\n• every time",
    words: 6,
  },
  {
    name: "extra spaces",
    text: "  hello   world  ",
    words: 2,
  },
];

const failures = [];

function expect(name, actual, expected) {
  if (actual !== expected) {
    failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok  ${name}`);
  }
}

for (const sample of samples) {
  const actual = countWords(sample.text);
  expect(`countWords ${sample.name}`, actual, sample.words);
  console.log(`    ${JSON.stringify(sample.text)} -> ${actual}`);
}

const chinese = "字".repeat(100);
expect("cjk 100 characters", countWords(chinese), 100);
expect("cjk 100 chars with spaces", countChars(chinese).withSpaces, 100);
expect("cjk 100 chars without spaces", countChars(chinese).withoutSpaces, 100);

expect("whitespace only", countWords(" \n\t "), 0);
expect("punctuation hyphen is not a word", countWords("hello - world"), 2);
expect("mixed token", countWords("Hello世界"), 3);
expect("bullet does not inflate", countWords("- item"), 1);

const spaced = countChars("a b");
expect("chars with spaces", spaced.withSpaces, 3);
expect("chars without spaces", spaced.withoutSpaces, 2);

const over = formatCountLabel(
  Array.from({ length: 251 }, () => "word").join(" "),
  250,
  "words",
);
expect("251 tone", over.tone, "over");
expect("251 label", over.label, "251 / 250 words · 1 word over");

const exact = formatCountLabel(Array.from({ length: 250 }, () => "word").join(" "), 250, "words");
expect("250 tone", exact.tone, "warning");
expect("250 label", exact.label, "250 / 250 words");

const near = formatCountLabel(Array.from({ length: 225 }, () => "word").join(" "), 250, "words");
expect("225 tone", near.tone, "warning");

const under = formatCountLabel(Array.from({ length: 224 }, () => "word").join(" "), 250, "words");
expect("224 tone", under.tone, "normal");

expect("blank limit", formatCountLabel("one two", null, "words").label, "2 words");
expect("one word", formatCountLabel("one", null, "words").label, "1 word");

const charLabel = formatCountLabel("a b", 10, "chars");
expect("char label", charLabel.label, "3 / 10 characters (2 without spaces)");

expect(
  "summary",
  summarizeAnswers(["one two", Array.from({ length: 3 }, () => "word").join(" ")], 2, "words"),
  "Total: 5 words across 2 answers; 1 over the limit",
);

expect("blank parses", parseAnswerLimit("").limit, null);
expect("blank error", parseAnswerLimit("  ").error, null);
expect("valid parses", parseAnswerLimit("250").limit, 250);
expect("zero error", parseAnswerLimit("0").error, "Limit must be at least 1. The current limit is unchanged.");
expect(
  "too big error",
  parseAnswerLimit("5001").error,
  "Limit cannot be more than 5000. The current limit is unchanged.",
);
expect(
  "one character over",
  formatCountLabel("字".repeat(101), 100, "chars").label,
  "101 / 100 characters (101 without spaces) · 1 character over",
);
expect("decimal error", parseAnswerLimit("1.5").error !== null, true);

if (failures.length > 0) {
  console.error(`\n${failures.length} failed`);
  for (const failure of failures) console.error(`not ${failure}`);
  process.exit(1);
}

console.log(`\n${samples.length} countWords samples passed`);
