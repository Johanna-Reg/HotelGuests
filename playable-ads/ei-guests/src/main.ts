// The ei-guests playable-ad slice (ADR 0069). The ad's loop is a merge board whose rules are the
// game's pure functions in src/inn/merge-rules.ts (tested in tests/merge-rules.test.ts); the web
// build (../web) runs those same functions. Import from the game; the game never imports from here.
export {};
