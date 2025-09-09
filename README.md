# Supabase Community Starter

*Automatically synced with your [v0.dev](https://v0.dev) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/yourstyles-projects/v0-supabase-community-starter)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.dev-black?style=for-the-badge)](https://v0.dev/chat/projects/ocg9GSKiMVZ)

## Overview

This repository will stay in sync with your deployed chats on [v0.dev](https://v0.dev).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.dev](https://v0.dev).

## Deployment

Your project is live at:

**[https://vercel.com/yourstyles-projects/v0-supabase-community-starter](https://vercel.com/yourstyles-projects/v0-supabase-community-starter)**

## Build your app

Continue building your app on:

**[https://v0.dev/chat/projects/ocg9GSKiMVZ](https://v0.dev/chat/projects/ocg9GSKiMVZ)**

## How It Works

1. Create and modify your project using [v0.dev](https://v0.dev)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

## Development

To run the app locally without Telegram, you can mock a Telegram user by
setting the `NEXT_PUBLIC_TG_MOCK_INIT_DATA` environment variable. The value
should be the raw query string received from Telegram, for example:

```
NEXT_PUBLIC_TG_MOCK_INIT_DATA="query_id=AAEAbuQjAAAAAABu5CN7srnn&user=%7B%22id%22%3A602172928%2C%22first_name%22%3A%22Mercy%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22Memmasterhe%22%2C%22language_code%22%3A%22ru%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FRvfAPRWu2lVUKm5djxIVKWI6wd-gObFS92YU46n86Ww.svg%22%7D&auth_date=1757441342&signature=w2N-wSDZ3kwbXRqRV4nhbSJb7kUqsacYbshOU7Xvfcc94qK3usjvUnm_-5wlc861PBE93f7m82vtcji9hgGWDw&hash=096a3d12615279d4fcb713e88df0b077a9dd7fdba220efb3621e38c27efe6800"
```

When this variable is present in `development` mode, the app will populate
`window.Telegram.WebApp` with the provided user and allow you to test the
Telegram flow locally.
