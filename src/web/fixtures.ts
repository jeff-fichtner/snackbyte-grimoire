/**
 * Sample content for the surface, lifted from the design.
 *
 * This is presentation scaffolding: it exists so the screens can be built and judged
 * before the spine exists. It is NOT a schema, and nothing may import it outside the web
 * surface. When real data arrives, these values are replaced — the components take props
 * and neither know nor care where they came from.
 */
import type { NounCount, Record_, Spell, SpellPage, Tenant, Trace } from './view-model';

export const tenant: Tenant = {
  name: 'Ashfall Guild',
  spellCount: 6,
  castingToday: 4,
};

export const nounCounts: NounCount[] = [
  { label: 'Spells', count: 6, icon: '◆' },
  { label: 'Faces', count: 2, icon: '◎' },
  { label: 'Secrets', count: 2, icon: '🔑' },
  { label: 'Targets', count: 6, icon: '#' },
  { label: 'Records', icon: '■' },
];

export const spells: Spell[] = [
  {
    id: 'welcome',
    name: 'Welcome the newly arrived',
    when: 'when a member joins',
    does: [
      { kind: 'verb', text: 'post as' },
      { kind: 'noun', text: 'The Doorkeeper' },
      { kind: 'plain', text: '·' },
      { kind: 'verb', text: 'grant' },
      { kind: 'noun', text: '@initiate' },
    ],
    spellClass: 'charm',
    status: 'active',
    guarantees: ['idempotent', 'recorded'],
    castCount: 214,
    lastCast: '20m ago',
  },
  {
    id: 'release',
    name: 'Relay the deployment',
    when: 'when GitHub cuts a release',
    does: [
      { kind: 'keyword', text: 'if' },
      { kind: 'noun', text: 'tag ~ v*' },
      { kind: 'plain', text: '·' },
      { kind: 'verb', text: 'post to' },
      { kind: 'noun', text: '#ship-log' },
    ],
    spellClass: 'charm',
    status: 'active',
    guarantees: ['deduped', 'recorded'],
    castCount: 51,
    lastCast: '2h ago',
  },
  {
    id: 'spank',
    name: '/spank',
    when: 'when someone runs the command',
    does: [
      { kind: 'verb', text: 'reply' },
      { kind: 'plain', text: 'a random taunt at' },
      { kind: 'noun', text: '@target' },
    ],
    spellClass: 'charm',
    status: 'active',
    guarantees: ['recorded', 'private'],
    castCount: 1043,
    lastCast: '4m ago',
  },
  {
    id: 'patrons',
    name: 'Crown the patrons',
    when: 'when a payment succeeds',
    does: [
      { kind: 'verb', text: 'grant' },
      { kind: 'noun', text: '@patron' },
      { kind: 'plain', text: '·' },
      { kind: 'verb', text: 'post to' },
      { kind: 'noun', text: '#hall-of-patrons' },
    ],
    spellClass: 'charm',
    status: 'paused',
    guarantees: ['paused by you'],
    castCount: 38,
    lastCast: '3d ago',
  },
  {
    id: 'banish',
    name: 'Banish',
    when: 'engineer-authored · cast by hand',
    does: [
      { kind: 'danger', text: 'ban' },
      { kind: 'noun', text: '@target' },
      { kind: 'plain', text: '·' },
      { kind: 'danger', text: 'purge' },
      { kind: 'plain', text: '7 days' },
    ],
    spellClass: 'hex',
    status: 'sealed',
    guarantees: ['not composable', 'cast by hand'],
    sealed: true,
  },
];

export const spellPages: Record<string, SpellPage> = {
  release: {
    spellId: 'release',
    summary: "Announce every GitHub release in the guild's ship channel, once and only once.",
    sections: [
      {
        label: 'When',
        body: [
          { kind: 'noun', text: 'github.release' },
          { kind: 'plain', text: '— an external call' },
        ],
      },
      {
        label: 'Who may',
        body: [
          {
            kind: 'plain',
            text: "a signed call on this tenant's secret. An unknown caller fails like a forged one.",
          },
        ],
      },
      {
        label: 'What happens',
        body: [
          { kind: 'keyword', text: 'if' },
          { kind: 'plain', text: 'tag matches' },
          { kind: 'noun', text: 'v*' },
          { kind: 'verb', text: 'post to' },
          { kind: 'noun', text: '#ship-log' },
        ],
      },
    ],
    guarantees: [
      'deduped · the same release never posts twice',
      'retried with backoff if Discord is down',
      "outcome recorded — never reports done what didn't happen",
    ],
  },
  banish: {
    spellId: 'banish',
    summary:
      'Remove a member and erase their last week. There is no undo, and no version of this you may assemble yourself.',
    sections: [
      {
        label: 'When',
        body: [
          { kind: 'noun', text: 'interaction' },
          { kind: 'plain', text: '— a human runs' },
          { kind: 'danger', text: '/banish' },
          { kind: 'plain', text: ', in the moment' },
        ],
      },
      {
        label: 'Who may',
        body: [
          {
            kind: 'plain',
            text: "only a member whose standing covers both the verb and the target. Checked against the server's own power at the instant it is cast.",
          },
        ],
      },
      {
        label: 'What happens',
        body: [
          { kind: 'danger', text: 'ban' },
          { kind: 'noun', text: '@target' },
          { kind: 'plain', text: '·' },
          { kind: 'danger', text: 'purge' },
          { kind: 'plain', text: '7 days of messages' },
        ],
      },
    ],
    guarantees: [],
    sealedNote:
      'Hexes cannot be composed by tenants. This one exists as an engineer-authored spell, cast only by a human with standing — never automated.',
  },
};

export const records: Record_[] = [
  {
    id: 'r1',
    time: '10:42:07',
    spellName: null,
    detail: 'external call · /webhooks/…/clickup',
    outcome: 'refused',
    qualifier: 'law',
    traceId: 't1',
  },
  {
    id: 'r2',
    time: '10:41:55',
    spellName: '/spank',
    detail: 'reply at @grib',
    outcome: 'delivered',
  },
  {
    id: 'r3',
    time: '10:38:12',
    spellName: 'Relay the deployment',
    detail: 'release v2.4.0',
    outcome: 'deduped',
    qualifier: 'skipped',
  },
  {
    id: 'r4',
    time: '10:31:40',
    spellName: 'Crown the patrons',
    detail: 'grant @patron',
    outcome: 'retrying',
    qualifier: '3/6',
  },
  {
    id: 'r5',
    time: '10:22:03',
    spellName: 'Welcome the newly arrived',
    detail: '@lark joined',
    outcome: 'delivered',
  },
  {
    id: 'r6',
    time: '07:58:19',
    spellName: 'Crown the patrons',
    detail: 'grant @patron',
    outcome: 'gave-up',
    qualifier: 'held',
  },
];

export const traces: Record<string, Trace> = {
  t1: {
    id: 't1',
    time: '10:42:07',
    title: 'Refused at the law',
    summary: 'One invocation, walked across the whole grammar — and where it stopped.',
    refusalKind: 'unspeakable',
    stations: [
      {
        name: 'trigger',
        branch: 'language',
        state: 'passed',
        detail: 'an external call arrived on a tenant path',
      },
      {
        name: 'law admits',
        branch: 'law',
        state: 'refused',
        detail: 'unrecognized or unauthenticated caller',
        note: "We can't tell you which. An unknown caller and a forged one look identical here — and that is the point: a wrong guess must learn nothing.",
      },
      {
        name: 'spell · logic · verb',
        branch: 'tenant',
        state: 'not-reached',
        detail: 'not reached',
      },
      { name: 'nouns', branch: 'tenant', state: 'not-reached', detail: 'not reached' },
      {
        name: 'logistics performs',
        branch: 'logistics',
        state: 'not-reached',
        detail: 'nothing was delivered — correctly',
      },
    ],
  },
};
