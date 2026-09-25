#!/usr/bin/env bash
# Iteration 2b: runs one job on N parallel shards (default 16) and records the wall time.
# Usage: [IT2B_CANDIDATE=K1|K2] bash tests/experiments-journal/it2b/launch.sh <job> [shards]
set -u
JOB=$1; N=${2:-16}
LOG=tests/experiments-journal/results/solver2b/timing
mkdir -p "$LOG"
START=$(date +%s)
echo "$(date -Iseconds) start $JOB shards=$N candidate=${IT2B_CANDIDATE:-}" >> "$LOG/launch-times.txt"
FAIL=0
for s in $(seq 0 $((N-1))); do
  IT2B_JOB=$JOB IT2B_SHARD=$s IT2B_SHARDS=$N npx vitest run -c vitest.journal.config.ts it2b/run > "$LOG/$JOB-shard$s.log" 2>&1 &
done
for p in $(jobs -p); do wait "$p" || FAIL=$((FAIL+1)); done
END=$(date +%s)
echo "$(date -Iseconds) end $JOB wall_s=$((END-START)) failed_shards=$FAIL" >> "$LOG/launch-times.txt"
echo "$JOB wall_s=$((END-START)) failed_shards=$FAIL"
