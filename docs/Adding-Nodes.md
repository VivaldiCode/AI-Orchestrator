# Adding Nodes

A "node" is one Mac running Ollama.

## 1. Expose Ollama on the network

By default Ollama only listens on `localhost`. On each Mac:

```bash
launchctl setenv OLLAMA_HOST 0.0.0.0:11434
# then restart Ollama
```

Verify from another machine: `curl http://<mac-ip>:11434/api/version`.

## 2. Register it

Dashboard → **Nodes** → **Add a node**:

| Field           | Meaning                                                    |
| --------------- | ---------------------------------------------------------- |
| Name            | A label, e.g. `studio`                                     |
| Host / IP       | e.g. `192.168.0.21`                                        |
| Port            | usually `11434`                                            |
| Weight          | relative capacity (used by the `weighted` strategy)        |
| Max concurrency | soft cap hint                                              |
| Tags            | free-form labels                                           |
| Agent port      | optional — [node agent](Node-Agent.md) port for CPU/memory |

Use **Test** to check connectivity. The node is health-checked automatically and starts
receiving traffic once it reports **up**.

## Via the API

```bash
curl -X POST http://localhost:11435/admin/nodes \
  -H "authorization: Bearer <admin-jwt>" \
  -H 'content-type: application/json' \
  -d '{ "name": "studio", "host": "192.168.0.21", "port": 11434, "weight": 2 }'
```
