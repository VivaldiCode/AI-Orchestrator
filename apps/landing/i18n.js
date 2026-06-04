// Dependency-free i18n for the landing page. English is the default; the
// structure makes adding a locale a matter of dropping another dictionary.
const I18N = {
  en: {
    'meta.title': 'AI Orchestrator — conduct your LLM fleet',
    'meta.description':
      'Open-source, self-hosted gateway that mirrors the Ollama API and load-balances inference across your Macs and cloud AI providers.',
    'nav.features': 'Features',
    'nav.how': 'How it works',
    'nav.github': 'GitHub',
    'hero.eyebrow': '100% open source · MIT',
    'hero.titleLead': 'Conduct your',
    'hero.titleAccent': 'LLM fleet',
    'hero.titleTail': '.',
    'hero.subtitle':
      'A self-hosted gateway that mirrors the Ollama API and load-balances inference across all your Macs — and, optionally, across Anthropic, OpenAI, xAI and Amazon Bedrock. Like Vivaldi conducting an orchestra: one baton, many instruments, perfectly in time. 🎻',
    'hero.ctaGithub': 'Get it on GitHub',
    'hero.ctaQuickstart': 'Quick start',
    'features.title': 'Everything you need to run your own AI fleet',
    'f.mirror.title': '🔀 Drop-in Ollama mirror',
    'f.mirror.desc':
      "Every Ollama endpoint, proxied with streaming. Change the base URL and you're done.",
    'f.lb.title': '⚖️ Smart load balancing',
    'f.lb.desc':
      'Round-robin, least-connections, least-latency, weighted — plus model-aware routing and failover.',
    'f.multi.title': '🧩 Multi-provider',
    'f.multi.desc':
      'An OpenAI-compatible /v1 layer routes to cloud providers. Secrets encrypted at rest.',
    'f.dashboard.title': '📊 Real-time dashboard',
    'f.dashboard.desc':
      'See per-Mac load live, add nodes, manage providers and pick the routing strategy.',
    'f.analytics.title': '📈 Analytics',
    'f.analytics.desc':
      'Throughput, latency p50/p95/p99, tokens and error rates, powered by TimescaleDB.',
    'f.security.title': '🔒 Security-first',
    'f.security.desc':
      'Helmet, strict CORS, rate limiting, JWT auth, hashed API keys, audited dependencies.',
    'how.title': 'How it works',
    'how.s1.title': 'Run the stack',
    'how.s1.desc': 'docker compose up brings up the orchestrator, dashboard and database.',
    'how.s2.title': 'Add your Macs',
    'how.s2.desc':
      'Register each node (host + port) from the dashboard. Health checks start instantly.',
    'how.s3.title': 'Point your clients',
    'how.s3.desc': 'Send Ollama or OpenAI-style requests — the orchestra plays in balance.',
    'quickstart.title': 'Quick start',
    'os.title': 'Free and open source, forever',
    'os.desc':
      'AI Orchestrator is MIT-licensed. Contributions are welcome — issues, ideas and pull requests all help the orchestra grow.',
    'os.cta': 'Star on GitHub ★',
    'footer.builtBy': 'Built by',
    'footer.license': 'MIT License',
    'footer.source': 'Source',
  },
  pt: {
    'meta.title': 'AI Orchestrator — reja sua frota de LLMs',
    'meta.description':
      'Gateway open-source e self-hosted que espelha a API do Ollama e balanceia a inferência entre seus Macs e provedores de IA na nuvem.',
    'nav.features': 'Recursos',
    'nav.how': 'Como funciona',
    'nav.github': 'GitHub',
    'hero.eyebrow': '100% open source · MIT',
    'hero.titleLead': 'Reja a sua',
    'hero.titleAccent': 'frota de LLMs',
    'hero.titleTail': '.',
    'hero.subtitle':
      'Um gateway self-hosted que espelha a API do Ollama e balanceia a inferência entre todos os seus Macs — e, opcionalmente, entre Anthropic, OpenAI, xAI e Amazon Bedrock. Como Vivaldi regendo uma orquestra: uma batuta, muitos instrumentos, em perfeita sintonia. 🎻',
    'hero.ctaGithub': 'Baixar no GitHub',
    'hero.ctaQuickstart': 'Início rápido',
    'features.title': 'Tudo o que você precisa para rodar sua própria frota de IA',
    'f.mirror.title': '🔀 Espelho do Ollama (drop-in)',
    'f.mirror.desc': 'Todos os endpoints do Ollama, com streaming. Troque a URL base e pronto.',
    'f.lb.title': '⚖️ Balanceamento inteligente',
    'f.lb.desc':
      'Round-robin, least-connections, least-latency, weighted — além de roteamento ciente de modelo e failover.',
    'f.multi.title': '🧩 Multi-provedor',
    'f.multi.desc':
      'Uma camada compatível com OpenAI (/v1) roteia para provedores na nuvem. Segredos criptografados.',
    'f.dashboard.title': '📊 Dashboard em tempo real',
    'f.dashboard.desc':
      'Veja a carga por Mac ao vivo, adicione nós, gerencie provedores e escolha a estratégia.',
    'f.analytics.title': '📈 Análises',
    'f.analytics.desc': 'Vazão, latência p50/p95/p99, tokens e taxas de erro, com TimescaleDB.',
    'f.security.title': '🔒 Segurança em primeiro lugar',
    'f.security.desc':
      'Helmet, CORS restrito, rate limiting, JWT, chaves de API com hash, dependências auditadas.',
    'how.title': 'Como funciona',
    'how.s1.title': 'Suba a stack',
    'how.s1.desc': 'docker compose up sobe o orquestrador, o dashboard e o banco.',
    'how.s2.title': 'Adicione seus Macs',
    'how.s2.desc':
      'Cadastre cada nó (host + porta) pelo dashboard. Os health checks começam na hora.',
    'how.s3.title': 'Aponte seus clientes',
    'how.s3.desc': 'Envie requisições no estilo Ollama ou OpenAI — a orquestra toca equilibrada.',
    'quickstart.title': 'Início rápido',
    'os.title': 'Livre e open source, para sempre',
    'os.desc':
      'O AI Orchestrator é licenciado sob MIT. Contribuições são bem-vindas — issues, ideias e pull requests fazem a orquestra crescer.',
    'os.cta': 'Dar uma estrela no GitHub ★',
    'footer.builtBy': 'Feito por',
    'footer.license': 'Licença MIT',
    'footer.source': 'Código',
  },
};

const STORAGE_KEY = 'aio.lang';

function detectLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'pt') return stored;
  } catch {
    /* ignore */
  }
  return (navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en';
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

document.addEventListener('DOMContentLoaded', () => {
  document
    .querySelectorAll('#lang-switch button')
    .forEach((btn) => btn.addEventListener('click', () => setLang(btn.dataset.lang)));
  applyLang(detectLang());
});
