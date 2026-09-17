#!/bin/sh
set -e

# The persistent volume is mounted here at container start, AFTER this
# image's own build-time chown ran. The volume's own filesystem (including an
# ext4 "lost+found" directory owned by root:root, mode 700) replaces whatever
# ownership the image had at that path — so the nextjs user couldn't even
# scandir it: "EACCES: permission denied, scandir '/app/public/uploads/lost+found'".
#
# This runs as root (before su-exec drops privileges), once per container
# start, so it always matches whatever the volume actually looks like right
# now rather than whatever the image was built with.
chown -R nextjs:nodejs /app/public/uploads 2>/dev/null || true

exec su-exec nextjs:nodejs sh -c "node migrate.cjs && node server.js"
