# Quotient Quest

Quotient Quest is a math battle game for kids. Players walk around a shared map and attack other players or computer players. Each attack starts a battle. Both players answer math problems, and better and faster answers make a stronger attack. The winner gets coins. Players use the coins to buy skins and items in the shop. The math starts with addition and gets harder up to fractions and decimals.

The game uses Phaser and runs in the browser on a computer, a phone, and an iPad. Players do not install anything.

## The code

The game is TypeScript on Cloudflare.

- `src/client` holds the Phaser game. Vite builds it, and Cloudflare serves it as static files.
- `src/server` holds one Cloudflare Worker. The Worker answers `/api/*` and sends `/api/hub` to the `HubWorld` Durable Object.
- `src/shared` holds the messages that the client and the server send to each other.
- `migrations` holds the D1 database changes, in order.
- `test` holds the tests. They run inside the Workers runtime with a local D1 database.

## Run the game

Use Node 24 and npm 11.6.2 or later. npm 11.5 crashes when it installs the test tools.

1. Install the packages: `npm install`.
2. Make the local database: `npm run db:migrate:local`.
3. Start the game: `npm run dev`.
4. Open the URL that Vite shows.

## Test the game

- Run the tests: `npm test`.
- Check the types: `npm run typecheck`.
- Check the lint and the format: `npm run lint`. Fix the format with `npm run format`.
- After a change to `wrangler.jsonc`, make the Worker types again: `npm run types`.

GitHub Actions runs all these checks and a build on each pull request.

## Deploy the game

GitHub Actions deploys each push to `main` when the repo has the `CLOUDFLARE_API_TOKEN` secret. It applies the D1 migrations first, then it deploys the Worker. Without the secret, the deploy job skips.

To deploy from a Mac, log in with `npx wrangler login`. Then run these two commands:

1. Apply the migrations: `npm run db:migrate:remote`.
2. Deploy: `npm run deploy`.
