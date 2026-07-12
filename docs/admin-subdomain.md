# Admin Subdomain Setup

Akara’s admin dashboard should live on:

```text
https://admin.tryakara.com/admin
```

The backend now treats `admin.tryakara.com` as the admin host through:

```text
AKARA_ADMIN_HOST=admin.tryakara.com
```

## Routing Behavior

- `https://admin.tryakara.com/` redirects to `/admin`.
- `https://admin.tryakara.com/admin` serves the admin dashboard.
- `https://admin.tryakara.com/admin/api/*` serves admin API requests.
- `/admin` on the main website host redirects to `https://admin.tryakara.com/admin`.

This keeps the marketing website on `tryakara.com` and the private admin surface on a separate subdomain.

## DNS

Point `admin.tryakara.com` to the same production backend that runs the WhatsApp webhook server.

Use whichever record your backend host provides:

```text
Type: CNAME
Name: admin
Value: your-backend-host.example.com
Proxy: DNS only unless your host explicitly supports Cloudflare proxying
```

If the backend is deployed on a platform that gives an A record instead, use:

```text
Type: A
Name: admin
Value: the-backend-ip
Proxy: DNS only unless your host explicitly supports Cloudflare proxying
```

## Production Environment

Set this in the backend production environment:

```text
AKARA_ADMIN_HOST=admin.tryakara.com
AKARA_ADMIN_TOKEN=use_a_long_private_admin_token
```

Do not reuse the local `local-admin` token in production.
