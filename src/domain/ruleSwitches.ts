/**
 * Rules of report 49 (decisions of the product owner, 11/11/2026), each with a switch reserved to the tests: the equivalence
 * of 6.2 replays a call with one rule turned off to attribute a difference to it. Every rule is on in the app; nothing in
 * src/ writes these switches.
 * - d3: no automatic update of the plan, and no projection, when the last weigh-in is more than 7 days old (point 4);
 * - d4: the recalibration gate counts the current tracking period, since the last pause (point 6);
 * - d5: one plan change at a time: a periodic replan waits while a recalibration is ready (point 5);
 * - d6: no "écart important" deduced under the target (point 3).
 */
export const RULES_6A: { d3: boolean; d4: boolean; d5: boolean; d6: boolean } = { d3: true, d4: true, d5: true, d6: true };
