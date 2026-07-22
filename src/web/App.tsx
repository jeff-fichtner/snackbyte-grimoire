import { useState } from 'react';
import { Shell } from './components/Shell';
import { nounCounts, records, spellPages, spells, tenant, traces } from './fixtures';
import { Home } from './screens/Home';
import { Records } from './screens/Records';

/**
 * The Grimoire surface.
 *
 * Presentation only, and deliberately so: every component takes props and holds no
 * business logic. Whether a spell is legal, who may cast it, and what a verb does are
 * answered by the platform — the web surface is a face that invokes those answers, never
 * a second place they are decided.
 *
 * Section state is local rather than routed; real routing arrives with the spec that
 * gives these screens real data.
 */
export function App() {
  const [section, setSection] = useState('Spells');

  return (
    <Shell tenantName={tenant.name} nouns={nounCounts} active={section} onNavigate={setSection}>
      {section === 'Records' ? (
        <Records records={records} traces={traces} />
      ) : (
        <Home tenant={tenant} spells={spells} pages={spellPages} />
      )}
    </Shell>
  );
}
