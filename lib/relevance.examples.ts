import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import {
  STOP_WORDS,
  extractKeywords,
  mergeRelevanceSelection,
  rankAchievements,
  scoreAchievement,
  type RelevanceEntry,
} from "./relevance";

const leadershipCriteria = "leadership experience and community service";

const beachCleanup: RelevanceEntry = {
  title: "Beach cleanup",
  category: "volunteering",
  role: "President",
  organizer: "Green Society",
  description: "Organised weekend cleanups.",
};

const gamingClub: RelevanceEntry = {
  title: "Gaming club",
  category: "activity",
  role: "Member",
  organizer: "Campus",
  description: "Played weekly tournaments.",
};

const communityFair: RelevanceEntry = {
  title: "Community fair",
  category: "volunteering",
  role: "Helper",
  description: "Ran a campus fair.",
};

const robotics: RelevanceEntry = {
  title: "Robotics",
  category: "activity",
  role: "President",
  description: "Built robots.",
};

function exampleExtractKeywords(): void {
  assert.equal(STOP_WORDS.size, 150);
  assert.ok(STOP_WORDS.has("and"));
  assert.ok(STOP_WORDS.has("the"));
  assert.equal(STOP_WORDS.has("leadership"), false);
  assert.equal(STOP_WORDS.has("experience"), false);

  assert.deepEqual(extractKeywords("The services and the service of Services"), [
    { term: "service", count: 3 },
  ]);
  assert.deepEqual(extractKeywords("boxes"), [{ term: "box", count: 1 }]);
  assert.deepEqual(extractKeywords("volunteering"), [{ term: "volunteer", count: 1 }]);
  assert.deepEqual(extractKeywords("activities"), [{ term: "activity", count: 1 }]);
  assert.deepEqual(
    extractKeywords(leadershipCriteria).map((item) => item.term),
    ["leadership", "experience", "community", "service"],
  );
  assert.deepEqual(extractKeywords("leadership leadership"), [
    { term: "leadership", count: 2 },
  ]);
  assert.deepEqual(extractKeywords(""), []);
  assert.deepEqual(extractKeywords("and the of a"), []);
  assert.deepEqual(extractKeywords("to an"), []);
}

function exampleCjkKeywords(): void {
  assert.deepEqual(extractKeywords("领导力"), [
    { term: "领导", count: 1 },
    { term: "导力", count: 1 },
  ]);

  const phrase = extractKeywords("注重社区服务与领导经验");
  const terms = new Set(phrase.map((item) => item.term));
  assert.ok(terms.has("社区"));
  assert.ok(terms.has("服务"));
  assert.ok(terms.has("领导"));

  const mixed = extractKeywords("leadership 领导");
  assert.ok(mixed.some((item) => item.term === "leadership"));
  assert.ok(mixed.some((item) => item.term === "领导"));

  assert.doesNotThrow(() => extractKeywords("社区服务！！！123"));
  assert.deepEqual(extractKeywords("社"), []);

  const ranked = rankAchievements(
    [
      {
        title: "社区服务",
        category: "volunteering",
        role: "主席",
        description: "组织社区服务和领导同学",
      },
      {
        title: "电子游戏",
        category: "activity",
        role: "成员",
        description: "参加电子游戏比赛",
      },
    ],
    extractKeywords("社区服务与领导"),
  );
  assert.equal(ranked[0]?.entry.title, "社区服务");
  assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));
  assert.equal(ranked[1]?.score, 0);
}

function exampleScoreAchievement(): void {
  const keywords = extractKeywords(leadershipCriteria);
  const volunteer = scoreAchievement(beachCleanup, keywords);
  const gaming = scoreAchievement(gamingClub, keywords);

  assert.equal(volunteer.score, 4);
  assert.deepEqual(volunteer.matched, ["leadership (role)", "community (category)"]);
  assert.equal(gaming.score, 0);
  assert.deepEqual(gaming.matched, []);
  assert.ok(volunteer.score > gaming.score);
  assert.deepEqual(scoreAchievement(beachCleanup, []), { score: 0, matched: [] });

  const repeated = scoreAchievement(beachCleanup, extractKeywords("leadership leadership"));
  assert.equal(repeated.score, 4);
  assert.deepEqual(repeated.matched, ["leadership (role)"]);
}

function exampleNormaliseScores(): void {
  const keywords = extractKeywords(leadershipCriteria);
  const ranked = rankAchievements([gamingClub, robotics, communityFair], keywords);

  assert.deepEqual(
    ranked.map((item) => item.entry.title),
    ["Community fair", "Robotics", "Gaming club"],
  );
  assert.deepEqual(
    ranked.map((item) => item.score),
    [100, 40, 0],
  );
  assert.equal(scoreAchievement(communityFair, keywords).score, 5);
  assert.equal(scoreAchievement(robotics, keywords).score, 2);

  const none = rankAchievements(
    [gamingClub, { ...gamingClub, title: "Another club" }],
    keywords,
  );
  assert.deepEqual(
    none.map((item) => item.score),
    [0, 0],
  );

  const many = Array.from({ length: 200 }, (_, index) => ({
    title: index % 2 === 0 ? `Community project ${index}` : `Gaming club ${index}`,
    category: index % 2 === 0 ? "volunteering" : "activity",
    role: index % 5 === 0 ? "President" : "Member",
    description: "Sample description for timing only.",
  }));
  const started = Date.now();
  const timed = rankAchievements(many, keywords);
  const elapsed = Date.now() - started;
  assert.equal(timed.length, 200);
  assert.ok(timed.some((item) => item.score === 100));
  assert.ok(timed.some((item) => item.score === 0));
  assert.ok(elapsed < 500, `ranking 200 entries took ${elapsed}ms`);
}

function exampleRemovingCommunityChangesRank(): void {
  const keywords = extractKeywords(leadershipCriteria);
  const before = rankAchievements([gamingClub, robotics, communityFair], keywords);
  const withoutCommunity = keywords.filter((item) => item.term !== "community");
  const after = rankAchievements([gamingClub, robotics, communityFair], withoutCommunity);

  assert.equal(before[0]?.entry.title, "Community fair");
  assert.equal(after[0]?.entry.title, "Robotics");
  assert.equal(after.find((item) => item.entry.title === "Community fair")?.score, 0);
  assert.equal(after.find((item) => item.entry.title === "Robotics")?.score, 100);
  assert.notDeepEqual(
    before.map((item) => item.entry.title),
    after.map((item) => item.entry.title),
  );

  assert.deepEqual(mergeRelevanceSelection(["a"], ["b", "c"], false), ["a", "b", "c"]);
  assert.deepEqual(mergeRelevanceSelection(["a", "b"], ["b", "c"], false), ["a", "b", "c"]);
  assert.deepEqual(mergeRelevanceSelection(["a", "b"], ["c"], true), ["c"]);
  assert.deepEqual(mergeRelevanceSelection(["a"], ["b", "b"], false), ["a", "b"]);
  assert.deepEqual(
    mergeRelevanceSelection([], ["one", "two", "three"], false),
    ["one", "two", "three"],
  );
}

const examples = [
  ["extractKeywords stems, drops stop words, and counts", exampleExtractKeywords],
  ["extractKeywords uses CJK character bigrams", exampleCjkKeywords],
  ["scoreAchievement ranks a president volunteer above gaming", exampleScoreAchievement],
  ["rankAchievements normalises scores to 0-100", exampleNormaliseScores],
  ["removing community changes the ranking", exampleRemovingCommunityChangesRank],
] as const;

export function runRelevanceExamples(): void {
  const failures: string[] = [];
  for (const [name, run] of examples) {
    try {
      run();
      console.log(`ok ${name}`);
    } catch (cause) {
      failures.push(name);
      console.error(`fail ${name}`);
      console.error(cause);
    }
  }
  if (failures.length > 0) {
    throw new Error(`${failures.length} relevance example${failures.length === 1 ? "" : "s"} failed`);
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  try {
    runRelevanceExamples();
  } catch {
    process.exitCode = 1;
  }
}
