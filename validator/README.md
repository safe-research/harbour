```sh
npm install
npm run dev
```

```sh
npm run deploy
```

### Validator Worker

The validator worker is listenign for relaying requests via Waku. To run a validator worker it is possible to use the provided docker file. 

1. Setup env file
```sh
cp .dev.vars.sample .dev.vars
```

2. Build the image using docker or podman
```sh
podman build -t validator-worker .
```

3. Start the image using docker or podman
```sh
podman run -d --name harbour-validator --env-file .dev.vars validator-worker
```

4. Follow the logs
```sh
podman logs -f harbour-validator
```

### Minimal Cosigner

To run the minimal cosigner it is require to set the `VALIDATOR_PK_SEED` secret. This can be done via the wrangler cli:

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
