#!/bin/bash

# Usage: ./test_durability.sh [URL]
URL="${1:-http://example.com}"
CONCURRENT=200
TIMEOUT=20  # max seconds per request
OUTFILE=$(mktemp)

echo "Sending $CONCURRENT concurrent requests to $URL..."
echo "Timeout per request: ${TIMEOUT}s"

# Export variables for subshells used by xargs
export URL TIMEOUT

# Run requests in parallel and capture status + time
seq $CONCURRENT | xargs -n1 -P"$CONCURRENT" -I{} bash -c '
    curl -s -o /dev/null --max-time "$TIMEOUT" \
        -w "%{http_code} %{time_total}\n" "$URL"
' > "$OUTFILE"

# Quick summary
echo "----- Results -----"
awk -v timeout="$TIMEOUT" '
{
    code = $1
    time = $2
    codes[code]++
    total_time += time
    count++
}
END {
    print "Total requests: " count
    for (c in codes)
        print "HTTP " c ": " codes[c]
    if (count > 0)
        printf "Avg response time: %.3f sec\n", total_time/count
    if ("000" in codes)
        print codes["000"] " requests failed (timeout or connection error, max " timeout "s)"
}
' "$OUTFILE"

rm -f "$OUTFILE"