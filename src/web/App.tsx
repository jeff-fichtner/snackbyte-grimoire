import { Shell } from './components/Shell';
import { nounCounts, spellPages, spells, tenant } from './fixtures';
import { Home } from './screens/Home';

/**
 * The Grimoire surface.
 *
 * Presentation only, and deliberately so: every component takes props and holds no
 * business logic. Whether a spell is legal, who may cast it, and what a verb does are
 * answered by the platform — the web surface is a face that invokes those answers, never
 * a second place they are decided.
 */
export function App() {
  return (
    <Shell tenantName={tenant.name} nouns={nounCounts} active="Spells">
      <Home tenant={tenant} spells={spells} pages={spellPages} />
    </Shell>
  );
}
