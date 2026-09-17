// @vitest-environment node
/**
 * provision-command — the operator tool that registers a slash command and seeds its spell from
 * a definition file. The tool is the mechanism and knows no instance: the properties that matter
 * are that a well-formed definition passes through intact and every malformed one is refused
 * loudly, before anything reaches Discord or the database.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain JS operator script, no types
import { parseDefinition } from '../../scripts/provision-command.mjs';

const good = {
  command: {
    name: 'greet',
    description: 'Greet someone.',
    options: [{ name: 'target', description: 'who', type: 6, required: true }],
  },
  spell: { name: 'Greet', lines: ['{caster} greets {target}!', 'Hello, {target}.'] },
};

const withCommand = (patch: Record<string, unknown>) =>
  JSON.stringify({ ...good, command: { ...good.command, ...patch } });
const withSpell = (patch: Record<string, unknown>) =>
  JSON.stringify({ ...good, spell: { ...good.spell, ...patch } });

describe('parseDefinition', () => {
  it('passes a well-formed definition through, marking the command CHAT_INPUT', () => {
    expect(parseDefinition(JSON.stringify(good))).toEqual({
      command: { ...good.command, type: 1 },
      spell: good.spell,
    });
  });

  it('refuses a definition missing either half', () => {
    expect(() => parseDefinition(JSON.stringify({ spell: good.spell }))).toThrow(/"command"/);
    expect(() => parseDefinition(JSON.stringify({ command: good.command }))).toThrow(/"spell"/);
  });

  it('refuses a command name Discord would reject, including one with the slash typed in', () => {
    expect(() => parseDefinition(withCommand({ name: '/greet' }))).toThrow(/command\.name/);
    expect(() => parseDefinition(withCommand({ name: 'Greet' }))).toThrow(/command\.name/);
    expect(() => parseDefinition(withCommand({ name: '' }))).toThrow(/command\.name/);
  });

  it('refuses a missing description, non-array options, and a half-shaped option', () => {
    expect(() => parseDefinition(withCommand({ description: '' }))).toThrow(/description/);
    expect(() => parseDefinition(withCommand({ options: 'target' }))).toThrow(/options/);
    expect(() => parseDefinition(withCommand({ options: [{ name: 'target' }] }))).toThrow(/option/);
  });

  it('refuses a spell with no name, no lines, or an empty line', () => {
    expect(() => parseDefinition(withSpell({ name: '' }))).toThrow(/spell\.name/);
    expect(() => parseDefinition(withSpell({ lines: [] }))).toThrow(/spell\.lines/);
    expect(() => parseDefinition(withSpell({ lines: ['ok', ''] }))).toThrow(/line/);
  });
});
