# VPS Deployment Policy

This document is the deployment rule for the Flowers B2B production site.

Production:
- Domain: `https://uralskflowers.kz`
- VPS: `109.235.118.214`
- Runtime path: `/srv/flowers-b2b`
- Process: `pm2` app `flowers-b2b`

## Problem This Prevents

Next.js standalone output and `/_next/static` must always come from the same build.

If `server.js` / `.next/server` comes from one build and `.next/static` comes from another build, the server can render HTML that references CSS or JS files that do not exist on disk. The visible symptom is:

- pages render as an unstyled grid;
- admin UI looks broken or unformatted;
- browser gets 404 for `/_next/static/chunks/*.css`;
- Next.js logs may show older/newer deployment mismatches.

This happened when the VPS had HTML referencing:

`/_next/static/chunks/0qz-~nona9tzy.css`

but the deployed `.next/static` directory did not contain that file.

## Mandatory Rule

Do not deploy a Next.js build by unpacking new artifacts over the active production directory.

Deployments must be atomic:

1. Build once.
2. Package all artifacts from that same build.
3. Upload to a new release directory.
4. Validate the release before switching traffic.
5. Switch `current` symlink only after validation passes.
6. Reload PM2 after the symlink points to the validated release.
7. Keep previous releases for rollback.

## Required Directory Layout

Recommended layout:

```text
/srv/flowers-b2b/
  current -> /srv/flowers-b2b/releases/20260729-170000
  releases/
    20260729-170000/
      server.js
      .next/
        server/
        static/
      public/
      node_modules/
      package.json
  shared/
    .env.production
  logs/
```

PM2 should run:

```text
/srv/flowers-b2b/current/server.js
```

with:

```text
cwd=/srv/flowers-b2b/current
env_file=/srv/flowers-b2b/shared/.env.production
```

## Required Artifacts

Every production deploy must use artifacts produced by the same local or CI build:

```bash
tar -czf deploy.tar.gz -C .next/standalone .
tar -czf static.tar.gz -C .next static
tar -czf public.tar.gz -C . public
```

Do not mix `deploy.tar.gz` from one build with `static.tar.gz` from another build.

## Pre-Switch Validation

Before updating `current`, validate the new release directory.

Minimum checks:

```bash
test -f server.js
test -d .next/server
test -d .next/static
test -d public
test -f .next/BUILD_ID
find .next/static -type f -name '*.css' | grep -q .
```

Then start or probe the candidate release on a temporary port, or run a local check against its generated HTML if temporary startup is not available.

For every CSS reference found in generated HTML/RSC files, the file must exist:

```bash
grep -Roh '/_next/static/[^"]*\.css' .next/server | sort -u |
while read asset; do
  test -f ".${asset#/_next}" || {
    echo "Missing CSS asset: $asset"
    exit 1
  }
done
```

For every JS reference found in generated HTML/RSC files, the file must exist:

```bash
grep -Roh '/_next/static/[^"]*\.js' .next/server | sort -u |
while read asset; do
  test -f ".${asset#/_next}" || {
    echo "Missing JS asset: $asset"
    exit 1
  }
done
```

After switching `current` and reloading PM2, verify through nginx:

```bash
curl -fsS https://uralskflowers.kz/admin -o /tmp/admin.html
grep -o '/_next/static/[^"]*\.css' /tmp/admin.html | head
curl -fsSI https://uralskflowers.kz/_next/static/chunks/<css-file-from-html>.css
```

Expected result for CSS:

```text
HTTP/1.1 200 OK
Content-Type: text/css
```

## Rollback Rule

Keep at least the last 3 releases.

Rollback must be a symlink switch, not a rebuild:

```bash
ln -sfn /srv/flowers-b2b/releases/<previous-release> /srv/flowers-b2b/current
pm2 reload flowers-b2b --update-env
```

Then verify:

```bash
curl -fsSI https://uralskflowers.kz/admin
```

## Emergency Repair

If production is already broken because CSS/JS assets are missing:

1. Rebuild locally or in CI.
2. Recreate all three archives from the same build.
3. Upload all three archives together.
4. Deploy them into one clean release directory.
5. Validate assets.
6. Switch `current`.
7. Reload PM2.

Do not copy a single CSS file as the normal fix unless the site must be restored for a few minutes while a proper release is prepared.

## Rule For Agents

Before any VPS deploy, read this document.

If the current deployment workflow still unpacks artifacts directly over `/srv/flowers-b2b`, stop and warn that it can recreate the server/static mismatch. Prefer implementing the release-directory deployment first.

Do not change this policy silently. If a deploy must bypass it, explain why and document the risk in the final report.
