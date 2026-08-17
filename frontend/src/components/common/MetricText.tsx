import { Fragment } from 'react';

/**
 * Marks named product metrics inside generated prose.
 *
 * The mockup used `{{double braces}}` typed by hand. That cannot survive here:
 * this text comes from a model, and a marker it forgets to emit is a term that
 * silently loses its definition. So the glossary is fixed and the terms are
 * detected on render — the page decides what a metric is, not the model.
 *
 * Two jobs at once. It signals that a product person is at work, and it gives a
 * reader who does not know the term a definition without leaving the page.
 *
 * Matching is on plain text and the output is React elements, never HTML, so a
 * term appearing inside model output cannot inject markup.
 */

export const METRIC_GLOSSARY: Record<string, string> = {
  'checkout completion rate':
    'The share of shoppers who reach checkout and finish paying. The clearest single measure of whether checkout works.',
  'completion rate': 'The share of people who reach a step and finish it.',
  conversion: 'Turning someone who wants to buy into someone who has bought.',
  churn: 'Customers leaving for good, rather than complaining and staying.',
  telemetry:
    'Measurements the app reports automatically, as opposed to what a customer chooses to write in a review.',
  'crash rate': 'How often the app fails outright, as a share of sessions.',
  'add-to-cart': 'The step where a shopper puts an item in the basket — the first stage of checkout.',
  funnel: 'The chain of steps from browsing to paying. A break at one step loses everyone after it.',
  'opt-out':
    'A control that lets a customer switch a feature off. Its absence is a different complaint from the feature working badly.',
  retention: 'Whether customers come back, measured over a period.',
  'support ticket': 'A request a customer raised with support — a second, separate record of the same problem.',
};

/**
 * Longest first, so "checkout completion rate" wins over "completion rate".
 * Escaped because several terms contain a hyphen.
 */
const PATTERN = new RegExp(
  `\\b(${Object.keys(METRIC_GLOSSARY)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'gi',
);

export function MetricText({ children }: { children?: string | null }) {
  if (!children) return null;

  const parts = children.split(PATTERN);
  // split() with one capture group yields [text, match, text, match, …], so the
  // odd indices are the terms.
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const definition = METRIC_GLOSSARY[part.toLowerCase()];
        return (
          <span
            key={i}
            title={definition}
            className="cursor-help rounded-[3px] border-b-[1.5px] border-sky-400/70 bg-sky-500/10 px-1 font-medium text-sky-900 dark:border-sky-500/60 dark:text-sky-200"
          >
            {part}
          </span>
        );
      })}
    </>
  );
}
