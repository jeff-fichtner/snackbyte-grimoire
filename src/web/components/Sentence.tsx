import type { SentencePart } from '../view-model';
import styles from './Sentence.module.css';

/**
 * Renders a spell's sentence. Every run is coloured by what it MEANS — a verb, a noun it
 * points at, a language keyword, an irreversible act — never by position. That is what
 * lets someone read the model off the page without reading the words.
 */
export function Sentence({ parts, className }: { parts: SentencePart[]; className?: string }) {
  return (
    <span className={[styles.sentence, className].filter(Boolean).join(' ')}>
      {parts.map((part, index) => (
        <span key={index} className={styles[part.kind]}>
          {part.text}
        </span>
      ))}
    </span>
  );
}
