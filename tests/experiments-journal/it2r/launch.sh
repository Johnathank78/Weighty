#!/usr/bin/env bash
# Relaunch of iteration 2 (prompt 40): runs one job on N parallel shards (default 16) and records the wall time.
# Usage: IT2R_X=<x> bash tests/experiments-journal/it2r/launch.sh <job> [shards]
set -u
JOB=$1; N=${2:-16}
LOG=tests/experiments-journal/results/it2r/timing
mkdir -p "$LOG"
START=$(date +%s)
echo "$(date -Iseconds) start $JOB shards=$N x=${IT2R_X:-}" >> "$LOG/launch-times.txt"
FAIL=0
for s in $(seq 0 $((N-1))); do
  IT2R_JOB=$JOB IT2R_SHARD=$s IT2R_SHARDS=$N npx vitest run -c vitest.journal.config.ts it2r/run > "$LOG/$JOB-shard$s.log" 2>&1 &
done
for p in $(jobs -p); do wait "$p" || FAIL=$((FAIL+1)); done
END=$(date +%s)
echo "$(date -Iseconds) end $JOB wall_s=$((END-START)) failed_shards=$FAIL" >> "$LOG/launch-times.txt"
echo "$JOB wall_s=$((END-START)) failed_shards=$FAIL"
