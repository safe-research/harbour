```sh
npm install
npm run dev
```

```sh
npm run deploy
```

To run the cosigner it is require to set the `VALIDATOR_PK_SEED` secret. This can be done via the wrangler cli:

```sh
echo "some_secrete_validator_seed" | npm exec -- wrangler secret put VALIDATOR_PK_SEED
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```sh
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
