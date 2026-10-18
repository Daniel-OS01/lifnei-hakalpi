# Deploy

The site is static. The Docker image builds it and serves it with nginx on port 8080 as the non-root `nginx` user. No environment variables, secrets or databases are needed.

## Dokploy, step by step

1. In Dokploy create an application (or a Compose service) and choose the GitHub repository. Pick the branch `main`.
2. Build type:
   - **Compose** (recommended): compose path `./docker-compose.yml`. It works as is: one service `web`, no external networks.
   - **Dockerfile**: Dockerfile path `./Dockerfile`, context `.`.
3. Port: container port `8080`.
4. Domain: add the domain in the Domains tab, container port `8080`, enable HTTPS (Let's Encrypt). With a Dokploy domain you can remove the `ports` entry from `docker-compose.yml`; with plain Compose and no domain, `8080:8080` publishes the port on the host.
5. Health check: path `/healthz`, expected body `ok`. The image and the Compose file already define the same check.
6. Auto deploy: enable "Auto Deploy" so every push to `main` redeploys. (For GitHub, Dokploy gives a webhook URL if the GitHub App is not used.)
7. Environment: none.

### Traefik labels and the Dokploy network

If you route with your own Traefik labels instead of the Domains tab, the container must share a network with Traefik. Dokploy's is `dokploy-network` (external). In `docker-compose.yml` uncomment the `labels`, the service `networks` entry and the top level `networks` block, change the host in the rule, and remove `ports`.

## Rollback

- In Dokploy open the deployment list and redeploy the previous successful deployment (Rollback / Redeploy on that row).
- Or revert the bad commit on `main` (`git revert <sha>`, PR, merge); auto deploy ships the revert.
- Data problems: revert the data PR. Never edit files on the server.

## Verify headers

```
curl -sI https://YOUR-DOMAIN/ | grep -iE 'content-security|referrer|nosniff|permissions|cache-control|^server'
curl -s  https://YOUR-DOMAIN/healthz
curl -sI https://YOUR-DOMAIN/data/elections/2026-knesset-26/site.json | grep -i cache-control   # no-cache
curl -sI https://YOUR-DOMAIN/assets/ | head -1
```

Expected: the Content-Security-Policy, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, Permissions-Policy; `Cache-Control: no-cache` on `/` and `/data/`; `public, max-age=31536000, immutable` on files under `/assets/`; `Server: nginx` without a version; no `Set-Cookie`.

## Local check

```
scripts/compose-smoke.sh
```

The script runs `docker compose up -d --build --wait`, then checks `/healthz`, the page, the current election's `site.json`, `no-cache` on HTML, `immutable` on hashed assets, gzip and the CSP header. CI runs the same script in the `docker` job. Stop the stack with `docker compose down`.

## Compression

`npm run build` writes `.gz` copies of html, js, css, json, svg, txt, xml and map files (`scripts/precompress.ts`). nginx serves them with `gzip_static on`, and falls back to on the fly gzip for anything else. Fonts (woff2) are already compressed and are skipped.

Brotli is optional and not enabled: it needs the `ngx_brotli` module, which the stock `nginx:1.27-alpine` image does not include. To add it you would build a custom nginx image with the module, add `.br` copies to `scripts/precompress.ts` (Node has `zlib.brotliCompressSync`) and set `brotli_static on;`.
