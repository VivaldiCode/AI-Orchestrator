// Dependency-free i18n + small UX helpers for the landing page. English is the
// default; adding a locale is just another dictionary.
const I18N = {
  en: {
    'meta.title': 'AI Orchestrator — conduct your LLM fleet',
    'meta.description':
      'Open-source, self-hosted gateway that mirrors the Ollama API and load-balances inference across your Macs and cloud AI providers.',
    'nav.features': 'Features',
    'nav.architecture': 'Architecture',
    'nav.how': 'How it works',
    'nav.github': 'GitHub ★',
    'hero.eyebrow': '100% open source · MIT · self-hosted',
    'hero.titleLead': 'Conduct your',
    'hero.titleAccent': 'LLM fleet',
    'hero.titleTail': '.',
    'hero.subtitle':
      'A self-hosted gateway that mirrors the Ollama API and load-balances inference across all your Macs — and, optionally, across Anthropic, OpenAI, xAI, Mistral and Amazon Bedrock. Like Vivaldi conducting an orchestra: one baton, many instruments, perfectly in time. 🎻',
    'hero.ctaGithub': 'Get it on GitHub',
    'hero.ctaQuickstart': 'Quick start',
    'copy.label': 'Copy',
    'copy.done': 'Copied!',
    'trust.label': 'Works with',
    'stat.dropinValue': 'Drop-in',
    'stat.dropinLabel': '100% Ollama-compatible API',
    'stat.realtimeValue': 'Real-time',
    'stat.realtimeLabel': 'live dashboard + deep analytics',
    'stat.smartValue': 'Adaptive',
    'stat.smartLabel': 'routes by measured node speed',
    'stat.openValue': 'MIT',
    'stat.openLabel': 'open source, runs on your hardware',
    'features.title': 'Everything you need to run your own AI fleet',
    'features.subtitle':
      'One endpoint in front of every Mac and cloud model — balanced, observable and private.',
    'f.mirror.title': 'Drop-in: Ollama, OpenAI & Claude Code',
    'f.mirror.desc':
      "Every Ollama endpoint, proxied with streaming — plus an OpenAI-compatible /v1 layer and the Anthropic Messages API. Point Claude Code at the orchestrator and it routes across your fleet too. Change the base URL and you're done.",
    'f.lb.title': 'Performance-aware balancing',
    'f.lb.desc':
      "Routes by each machine's measured 24h speed (tokens/s, ms/token) and live load — big prompts go to the fastest node. Round-robin, least-connections, latency and weighted too, with automatic failover.",
    'f.multi.title': 'Multi-provider + cloud overflow',
    'f.multi.desc':
      'Add OpenAI, Anthropic, xAI, Mistral or Bedrock. When every node is saturated, requests spill to the cloud automatically — credentials encrypted at rest.',
    'f.dashboard.title': 'Real-time dashboard',
    'f.dashboard.desc':
      'Watch per-Mac load, in-flight requests and a live feed (timestamp, client IP, tokens). Add nodes, manage providers and switch strategy on the fly.',
    'f.analytics.title': 'Analytics deep-dive',
    'f.analytics.desc':
      'Throughput, latency avg/min/max/p50/p95/p99, token usage over time and per-machine allocation — powered by TimescaleDB.',
    'f.security.title': 'Security & privacy',
    'f.security.desc':
      'JWT + OIDC SSO, hashed API keys, rate limiting, audited deps — plus a privacy mode that keeps chosen prompts 100% local, never touching the cloud.',
    'arch.title': 'One baton, many instruments',
    'arch.subtitle': 'Clients talk to a single endpoint; the orchestrator conducts the fleet.',
    'arch.clients': 'Clients',
    'arch.coreA': 'load balance',
    'arch.coreB': 'health · failover',
    'arch.coreC': 'analytics · auth',
    'arch.cloud': '☁️ Cloud (overflow)',
    'arch.caption': 'PostgreSQL + TimescaleDB stores config and every request event for analytics.',
    'how.title': 'How it works',
    'how.s1.title': 'Run the stack',
    'how.s1.desc': 'One docker compose up brings up the orchestrator, dashboard and database.',
    'how.s2.title': 'Add your Macs',
    'how.s2.desc':
      'Register each node (host + port) from the dashboard. Health checks start instantly.',
    'how.s3.title': 'Point your clients',
    'how.s3.desc':
      'Send Ollama, OpenAI or Claude Code (Anthropic) requests — the orchestra plays in perfect balance.',
    'quickstart.title': 'Quick start',
    'quickstart.subtitle': 'Up and running in under a minute with Docker.',
    'os.title': 'Free and open source, forever',
    'os.desc':
      'AI Orchestrator is MIT-licensed. Contributions are welcome — issues, ideas and pull requests all help the orchestra grow.',
    'os.cta': 'Star on GitHub ★',
    'footer.builtBy': 'Built by',
    'footer.license': 'MIT License',
    'footer.source': 'Source',
    'footer.tagline': 'Conduct your LLM fleet. 🎻',
  },
  pt: {
    'meta.title': 'AI Orchestrator — reja sua frota de LLMs',
    'meta.description':
      'Gateway open-source e self-hosted que espelha a API do Ollama e balanceia a inferência entre seus Macs e provedores de IA na nuvem.',
    'nav.features': 'Recursos',
    'nav.architecture': 'Arquitetura',
    'nav.how': 'Como funciona',
    'nav.github': 'GitHub ★',
    'hero.eyebrow': '100% open source · MIT · auto-hospedado',
    'hero.titleLead': 'Reja a sua',
    'hero.titleAccent': 'frota de LLMs',
    'hero.titleTail': '.',
    'hero.subtitle':
      'Um gateway self-hosted que espelha a API do Ollama e balanceia a inferência entre todos os seus Macs — e, opcionalmente, entre Anthropic, OpenAI, xAI, Mistral e Amazon Bedrock. Como Vivaldi regendo uma orquestra: uma batuta, muitos instrumentos, em perfeita sintonia. 🎻',
    'hero.ctaGithub': 'Baixar no GitHub',
    'hero.ctaQuickstart': 'Início rápido',
    'copy.label': 'Copiar',
    'copy.done': 'Copiado!',
    'trust.label': 'Funciona com',
    'stat.dropinValue': 'Drop-in',
    'stat.dropinLabel': 'API 100% compatível com Ollama',
    'stat.realtimeValue': 'Tempo real',
    'stat.realtimeLabel': 'dashboard ao vivo + análises',
    'stat.smartValue': 'Adaptativo',
    'stat.smartLabel': 'roteia pela velocidade medida',
    'stat.openValue': 'MIT',
    'stat.openLabel': 'open source, no seu hardware',
    'features.title': 'Tudo o que você precisa para rodar sua própria frota de IA',
    'features.subtitle':
      'Um único endpoint à frente de cada Mac e modelo na nuvem — equilibrado, observável e privado.',
    'f.mirror.title': 'Drop-in: Ollama, OpenAI e Claude Code',
    'f.mirror.desc':
      'Todos os endpoints do Ollama, com streaming — além de uma camada compatível com OpenAI (/v1) e da Anthropic Messages API. Aponte o Claude Code para o orquestrador e ele também roteia pela sua frota. Troque a URL base e pronto.',
    'f.lb.title': 'Balanceamento por desempenho',
    'f.lb.desc':
      'Roteia pela velocidade medida de cada máquina nas últimas 24h (tokens/s, ms/token) e pela carga atual — prompts grandes vão para o nó mais rápido. Também round-robin, least-connections, latência e peso, com failover automático.',
    'f.multi.title': 'Multi-provedor + overflow na nuvem',
    'f.multi.desc':
      'Adicione OpenAI, Anthropic, xAI, Mistral ou Bedrock. Quando todos os nós estão saturados, as requisições vão para a nuvem automaticamente — segredos criptografados em repouso.',
    'f.dashboard.title': 'Dashboard em tempo real',
    'f.dashboard.desc':
      'Veja a carga por Mac, requisições em andamento e um feed ao vivo (hora, IP do cliente, tokens). Adicione nós, gerencie provedores e troque a estratégia na hora.',
    'f.analytics.title': 'Análises detalhadas',
    'f.analytics.desc':
      'Vazão, latência média/mín/máx/p50/p95/p99, uso de tokens ao longo do tempo e alocação por máquina — com TimescaleDB.',
    'f.security.title': 'Segurança & privacidade',
    'f.security.desc':
      'JWT + SSO OIDC, chaves de API com hash, rate limiting, dependências auditadas — além de um modo privacidade que mantém prompts escolhidos 100% locais, sem tocar na nuvem.',
    'arch.title': 'Uma batuta, muitos instrumentos',
    'arch.subtitle': 'Os clientes falam com um único endpoint; o orquestrador rege a frota.',
    'arch.clients': 'Clientes',
    'arch.coreA': 'balanceamento',
    'arch.coreB': 'saúde · failover',
    'arch.coreC': 'análises · auth',
    'arch.cloud': '☁️ Nuvem (overflow)',
    'arch.caption':
      'PostgreSQL + TimescaleDB guarda a configuração e cada requisição para as análises.',
    'how.title': 'Como funciona',
    'how.s1.title': 'Suba a stack',
    'how.s1.desc': 'Um docker compose up sobe o orquestrador, o dashboard e o banco.',
    'how.s2.title': 'Adicione seus Macs',
    'how.s2.desc':
      'Cadastre cada nó (host + porta) pelo dashboard. Os health checks começam na hora.',
    'how.s3.title': 'Aponte seus clientes',
    'how.s3.desc':
      'Envie requisições no estilo Ollama, OpenAI ou Claude Code (Anthropic) — a orquestra toca em perfeito equilíbrio.',
    'quickstart.title': 'Início rápido',
    'quickstart.subtitle': 'No ar em menos de um minuto com Docker.',
    'os.title': 'Livre e open source, para sempre',
    'os.desc':
      'O AI Orchestrator é licenciado sob MIT. Contribuições são bem-vindas — issues, ideias e pull requests fazem a orquestra crescer.',
    'os.cta': 'Dar uma estrela no GitHub ★',
    'footer.builtBy': 'Feito por',
    'footer.license': 'Licença MIT',
    'footer.source': 'Código',
    'footer.tagline': 'Reja a sua frota de LLMs. 🎻',
  },
  es: {
    'meta.title': 'AI Orchestrator — dirige tu flota de LLMs',
    'meta.description':
      'Gateway open-source y self-hosted que replica la API de Ollama y balancea la inferencia entre tus Macs y proveedores de IA en la nube.',
    'nav.features': 'Características',
    'nav.architecture': 'Arquitectura',
    'nav.how': 'Cómo funciona',
    'nav.github': 'GitHub ★',
    'hero.eyebrow': '100% open source · MIT · self-hosted',
    'hero.titleLead': 'Dirige tu',
    'hero.titleAccent': 'flota de LLMs',
    'hero.titleTail': '.',
    'hero.subtitle':
      'Un gateway self-hosted que replica la API de Ollama y balancea la inferencia entre todos tus Macs — y, opcionalmente, entre Anthropic, OpenAI, xAI, Mistral y Amazon Bedrock. Como Vivaldi dirigiendo una orquesta: una batuta, muchos instrumentos, en perfecta sincronía. 🎻',
    'hero.ctaGithub': 'Conseguir en GitHub',
    'hero.ctaQuickstart': 'Inicio rápido',
    'copy.label': 'Copiar',
    'copy.done': '¡Copiado!',
    'trust.label': 'Funciona con',
    'stat.dropinValue': 'Drop-in',
    'stat.dropinLabel': 'API 100% compatible con Ollama',
    'stat.realtimeValue': 'Tiempo real',
    'stat.realtimeLabel': 'dashboard en vivo + analíticas',
    'stat.smartValue': 'Adaptativo',
    'stat.smartLabel': 'enruta por la velocidad medida del nodo',
    'stat.openValue': 'MIT',
    'stat.openLabel': 'open source, en tu propio hardware',
    'features.title': 'Todo lo que necesitas para gestionar tu propia flota de IA',
    'features.subtitle':
      'Un único endpoint frente a cada Mac y modelo en la nube — balanceado, observable y privado.',
    'f.mirror.title': 'Drop-in: Ollama, OpenAI y Claude Code',
    'f.mirror.desc':
      'Todos los endpoints de Ollama, con streaming — además de una capa compatible con OpenAI (/v1) y la Anthropic Messages API. Apunta Claude Code al orquestador y también enruta por tu flota. Cambia la URL base y listo.',
    'f.lb.title': 'Balanceo según rendimiento',
    'f.lb.desc':
      'Enruta por la velocidad medida de cada máquina en 24h (tokens/s, ms/token) y la carga actual — los prompts grandes van al nodo más rápido. También round-robin, least-connections, latencia y por peso, con failover automático.',
    'f.multi.title': 'Multi-proveedor + overflow a la nube',
    'f.multi.desc':
      'Añade OpenAI, Anthropic, xAI, Mistral o Bedrock. Cuando todos los nodos están saturados, las solicitudes se desvían a la nube automáticamente — credenciales cifradas en reposo.',
    'f.dashboard.title': 'Dashboard en tiempo real',
    'f.dashboard.desc':
      'Observa la carga por Mac, las solicitudes en curso y un feed en vivo (hora, IP del cliente, tokens). Añade nodos, gestiona proveedores y cambia de estrategia al vuelo.',
    'f.analytics.title': 'Analíticas en profundidad',
    'f.analytics.desc':
      'Rendimiento, latencia media/mín/máx/p50/p95/p99, uso de tokens a lo largo del tiempo y asignación por máquina — con TimescaleDB.',
    'f.security.title': 'Seguridad y privacidad',
    'f.security.desc':
      'JWT + SSO OIDC, claves de API con hash, rate limiting, dependencias auditadas — además de un modo privacidad que mantiene los prompts elegidos 100% locales, sin tocar la nube.',
    'arch.title': 'Una batuta, muchos instrumentos',
    'arch.subtitle': 'Los clientes hablan con un único endpoint; el orquestador dirige la flota.',
    'arch.clients': 'Clientes',
    'arch.coreA': 'balanceo de carga',
    'arch.coreB': 'salud · failover',
    'arch.coreC': 'analíticas · auth',
    'arch.cloud': '☁️ Nube (overflow)',
    'arch.caption':
      'PostgreSQL + TimescaleDB guarda la configuración y cada evento de solicitud para las analíticas.',
    'how.title': 'Cómo funciona',
    'how.s1.title': 'Levanta el stack',
    'how.s1.desc': 'Un docker compose up levanta el orquestador, el dashboard y la base de datos.',
    'how.s2.title': 'Añade tus Macs',
    'how.s2.desc':
      'Registra cada nodo (host + puerto) desde el dashboard. Los health checks empiezan al instante.',
    'how.s3.title': 'Apunta tus clientes',
    'how.s3.desc':
      'Envía solicitudes de Ollama, OpenAI o Claude Code (Anthropic) — la orquesta toca en perfecto equilibrio.',
    'quickstart.title': 'Inicio rápido',
    'quickstart.subtitle': 'En marcha en menos de un minuto con Docker.',
    'os.title': 'Libre y open source, para siempre',
    'os.desc':
      'AI Orchestrator tiene licencia MIT. Las contribuciones son bienvenidas — issues, ideas y pull requests ayudan a que la orquesta crezca.',
    'os.cta': 'Dar una estrella en GitHub ★',
    'footer.builtBy': 'Hecho por',
    'footer.license': 'Licencia MIT',
    'footer.source': 'Código',
    'footer.tagline': 'Dirige tu flota de LLMs. 🎻',
  },
};

const STORAGE_KEY = 'aio.lang';

function detectLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'pt' || stored === 'es') return stored;
  } catch {
    /* ignore */
  }
  const lang = (navigator.language || 'en').toLowerCase();
  if (lang.startsWith('pt')) return 'pt';
  if (lang.startsWith('es')) return 'es';
  return 'en';
}

function applyLang(lang) {
  const dict = I18N[lang] || I18N.en;
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] != null) el.textContent = dict[key];
  });

  if (dict['meta.title']) document.title = dict['meta.title'];
  const desc = document.querySelector('meta[name="description"]');
  if (desc && dict['meta.description']) desc.setAttribute('content', dict['meta.description']);

  document.querySelectorAll('#lang-switch button').forEach((btn) => {
    const active = btn.dataset.lang === lang;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function setLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  applyLang(lang);
}

function initCopyButtons() {
  document.querySelectorAll('.snippet .copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.parentElement && btn.parentElement.querySelector('code');
      const span = btn.querySelector('span');
      if (!code || !navigator.clipboard) return;
      void navigator.clipboard.writeText(code.textContent || '').then(() => {
        const lang = document.documentElement.lang === 'pt' ? 'pt' : 'en';
        const dict = I18N[lang] || I18N.en;
        if (span) span.textContent = dict['copy.done'];
        btn.classList.add('done');
        setTimeout(() => {
          if (span) span.textContent = dict['copy.label'];
          btn.classList.remove('done');
        }, 1500);
      });
    });
  });
}

function initStickyNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

document.addEventListener('DOMContentLoaded', () => {
  document
    .querySelectorAll('#lang-switch button')
    .forEach((btn) => btn.addEventListener('click', () => setLang(btn.dataset.lang)));
  applyLang(detectLang());
  initCopyButtons();
  initStickyNav();
});
