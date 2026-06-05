import { useI18n } from '../i18n';
import { Card } from '../components/ui';

const GITHUB = 'https://github.com/VivaldiCode/ollama-orquestrator';
// The Ollama mirror is served by the orchestrator (default port 11435), not by
// the dashboard origin, so we show the documented default here.
const MIRROR = 'http://localhost:11435';

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300">
      <code>{children}</code>
    </pre>
  );
}

export function DocsPage() {
  const { t } = useI18n();

  const linkClass = (primary = false) =>
    primary
      ? 'rounded-lg bg-concert-600 px-4 py-2 text-sm font-medium text-white hover:bg-concert-500'
      : 'rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-50">{t('docs.title')}</h1>
        <p className="text-sm text-slate-400">{t('docs.subtitle')}</p>
      </header>

      <Card>
        <h2 className="mb-3 text-lg font-medium text-slate-100">{t('docs.links')}</h2>
        <div className="flex flex-wrap gap-3">
          <a className={linkClass(true)} href="/docs" target="_blank" rel="noopener">
            {t('docs.apiRef')} ↗
          </a>
          <a className={linkClass()} href="/openapi.json" target="_blank" rel="noopener">
            {t('docs.openApi')} ↗
          </a>
          <a className={linkClass()} href={`${GITHUB}/wiki`} target="_blank" rel="noopener">
            {t('docs.wiki')} ↗
          </a>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-medium text-slate-100">{t('docs.quickUsage')}</h2>
        <p className="mt-2 text-sm text-slate-400">{t('docs.pointClients')}</p>
        <Code>{`curl ${MIRROR}/api/chat -d '{
  "model": "llama3.2",
  "messages": [{ "role": "user", "content": "Hello!" }]
}'`}</Code>
        <p className="mt-4 text-sm text-slate-400">{t('docs.openaiCompat')}</p>
        <Code>{`curl ${MIRROR}/v1/chat/completions \\
  -H 'content-type: application/json' \\
  -d '{ "model": "llama3.2", "messages": [{ "role": "user", "content": "Hi" }] }'`}</Code>
      </Card>

      <Card>
        <h2 className="text-lg font-medium text-slate-100">{t('docs.smoke')}</h2>
        <p className="mt-2 text-sm text-slate-400">{t('docs.smokeDesc')}</p>
        <Code>{`ORCHESTRATOR_URL=${MIRROR} MODEL=llama3.2 N=12 node scripts/smoke-test.mjs`}</Code>
      </Card>
    </div>
  );
}
