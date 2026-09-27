#!/usr/bin/env bash
# Iteration 2d (prompt 41): runs one job on N parallel shards (default 16) and records the wall time.
# Usage: bash tests/experiments-journal/it2d/launch.sh <job> [shards]
set -u
JOB=$1; N=${2:-16}
LOG=tests/experiments-journal/results/it2d/timing
mkdir -p "$LOG"
START=$(date +%s)
echo "$(date -Iseconds) start $JOB shards=$N" >> "$LOG/launch-times.txt"
FAIL=0
for s in $(seq 0 $((N-1))); do
  IT2D_JOB=$JOB IT2D_SHARD=$s IT2D_SHARDS=$N npx vitest run -c vitest.journal.config.ts it2d/run > "$LOG/$JOB-shard$s.log" 2>&1 &
done
for p in $(jobs -p); do wait "$p" || FAIL=$((FAIL+1)); done
END=$(date +%s)
echo "$(date -Iseconds) end $JOB wall_s=$((END-START)) failed_shards=$FAIL" >> "$LOG/launch-times.txt"
echo "$JOB wall_s=$((END-START)) failed_shards=$FAIL"
