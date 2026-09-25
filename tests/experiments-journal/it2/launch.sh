#!/usr/bin/env bash
# Journal battery, iteration 2: runs one job on N parallel shards (default 16) and records the wall time.
# Usage: bash tests/experiments-journal/it2/launch.sh <job> <X> [shards]
set -u
JOB=$1; X=$2; N=${3:-16}
LOG=tests/experiments-journal/results/timing2
mkdirSync() { mkdir -p "$1"; }
mkdirSync "$LOG"
START=$(date +%s)
echo "$(date -Iseconds) start $JOB X=$X shards=$N" >> "$LOG/launch-times.txt"
FAIL=0
for s in $(seq 0 $((N-1))); do
  IT2_JOB=$JOB IT2_SHARD=$s IT2_SHARDS=$N IT2_X=$X npx vitest run -c vitest.journal.config.ts it2/run > "$LOG/$JOB-shard$s.log" 2>&1 &
done
for p in $(jobs -p); do wait "$p" || FAIL=$((FAIL+1)); done
END=$(date +%s)
echo "$(date -Iseconds) end $JOB X=$X wall_s=$((END-START)) failed_shards=$FAIL" >> "$LOG/launch-times.txt"
echo "$JOB wall_s=$((END-START)) failed_shards=$FAIL"
