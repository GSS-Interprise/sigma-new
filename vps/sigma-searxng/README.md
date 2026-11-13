# SearXNG do Sigma (busca de perfil de médico)

Reserva da busca da edge `redes-sociais-buscar` (Fase 9.3). Ordem da busca: Serper (Google, `SERPER_API_KEY`),
Brave (`BRAVE_SEARCH_API_KEY`), e por último este SearXNG (grátis, sem limite).

- VPS Pulse `147.93.71.48`, serviço Docker Swarm `sigma-searxng` (rede `easypanel`), imagem `searxng/searxng` fixada por digest.
- Config em `/opt/sigma-searxng/settings.yml` (modelo abaixo; o `secret_key` real só existe na VPS).
- Rota pública só com senha: `/etc/easypanel/traefik/config/sigma-searxng.yaml` (Traefik do Easypanel, `basicAuth`),
  domínio `https://busca-sigma.srv983143.hstgr.cloud`. Sem senha responde 401.
- Segredos no Supabase: `SEARXNG_URL` e `SEARXNG_AUTH` (`sigma:<senha>`). A senha não fica no repositório nem no Vault.

## settings.yml (modelo)

```yaml
use_default_settings:
  engines:
    keep_only: [google, bing, duckduckgo, brave, startpage, mojeek]
general:
  instance_name: sigma-busca
server:
  secret_key: "<openssl rand -hex 32>"
  limiter: false          # acesso já protegido pelo Traefik
  public_instance: false
  image_proxy: false
search:
  safe_search: 0
  formats: [html, json]
outgoing:
  request_timeout: 6.0
```

## Operar

```bash
docker service ps sigma-searxng
docker service logs --tail 50 sigma-searxng
curl -u "sigma:<senha>" "https://busca-sigma.srv983143.hstgr.cloud/search?q=teste&format=json"
```

Se o Google bloquear a VPS (resultado só de Bing/DuckDuckGo), dá para mandar as buscas pelo proxy Bright Data BR
(`outgoing.proxies` no settings.yml).
