# Turtleherder

> **Rewrite in progress (2026):** this app is being rebuilt as a React + Node
> (TypeScript) monorepo backed by Postgres. See [DESIGN.md](DESIGN.md) for the
> full design. The original PHP app lives in [`legacy/`](legacy/) as the
> reference spec. Development setup:
>
> ```sh
> pnpm install
> pnpm db:up        # Postgres via Docker Compose
> pnpm db:migrate   # run migrations
> pnpm db:seed      # demo "bobcats" team
> pnpm dev          # API on :3000, client on :5173 (visit /bobcats)
> ```
>
> **Deploying (Railway):** the repo is deploy-ready as a single service —
> `railway.json` builds the client and bundles the server, runs migrations as
> the pre-deploy step, and starts the server, which also serves the built
> client. Create a Railway project from this repo, add a Postgres service, and
> set three variables on the app service (`railway.json` can't hold variables,
> only commands):
>
> ```sh
> DATABASE_URL=${{Postgres.DATABASE_URL}}
> NODE_ENV=production           # the session cookie's Secure flag keys off this
> APP_ORIGIN=https://your-domain.example   # so scripts print real join links
> ```
>
> Railway provides `PORT`. Create a team with the create-team script, which
> inserts one team plus its captain and prints the captain's join link:
>
> ```sh
> pnpm db:create-team --name "Brooklyn Bocce" --slug brooklyn-bocce \
>   --min-players 7 --min-quota-players 2 \
>   --quota-noun-singular woman --quota-noun-plural women \
>   --timezone America/New_York --captain "Alison Bechdel"
> ```
>
> **Never run `pnpm db:seed` against a real database** — it's the dev seed, and
> it TRUNCATEs every table. It refuses to run with `NODE_ENV=production` or
> against a non-local `DATABASE_URL`, but don't rely on that.


This is a bare-bones attendance tracking app for use with recreational sports teams. It's particularly helpful with co-ed teams, because you'll be able to set both the number of players you need to field and also the number of women (many co-ed leagues require a team to have a mininum number of women present in order to play).

It's really important to have some kind of system in the days leading up to a game for figuring out who's going to be there, because if you're short, you'll need subs, but if all your regular-roster people show up, you'll have too many people and you might have to tell the subs they can't play.

To see how it works, explore the example at [turtleherder.com](http://www.turtleherder.com).

I wrote this for a team I was on a few years ago. They're still using it. People like it because the alternatives (facebook, evite, email, calling or texting each other, various league scoring sites) all had a lot more bells and whistles than they need, or are too cumbersome or otherwise painful.

This was written a while ago when I was first learning PHP.  I didn't even know Javascript at all at the time, actually -- it was all server-side behavior. I added some Javascript a couple years later, as I was learning that language.

I'm planning to significantly revamp the whole thing very soon, either in Ruby or Node (Ruby because I'm thinking of learning Rails and it seems like that wouldbe a good fit, Node because I happen to know it). The upcoming version will allow the user to set up and configure their own instances of the app.

If you have a team and want me to set you up with an instance before that, let me know. It's easy, and I'm already hosting that domain name.
