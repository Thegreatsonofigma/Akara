# Akara CLI Prototype

This is a tiny local simulator for the WhatsApp bot flow. It uses in-memory data only and does not connect to WhatsApp, banks, MoMo, or a database.

Run it:

```bash
node akara/prototype/akara-cli.js
```

Try this path:

1. `verify`
2. `find offer`
3. `RWF`
4. `NGN`
5. `55000`
6. `1`
7. `sent`
8. `received`
9. `fee paid`

Try creating a listing:

1. `create listing`
2. `NGN`
3. `RWF`
4. `50000`
5. `55000`
6. `fixed`
7. `publish`

The goal is to test the product logic before connecting the real WhatsApp Business Platform webhook.

