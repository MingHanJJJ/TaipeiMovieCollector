export interface VersionTitle {
  /** raw text, e.g. "(4DX 3D 英)歡迎光臨魔法秘境" */
  raw: string;
  /** bare title */
  title: string;
  /** e.g. "數位", "4DX 3D", "IV 4DX 3D", "LIVE" ; "" when absent */
  format: string;
  /** single-character spoken language: 英 國 日 韓 …; undefined when absent */
  language?: string;
}

const CJK_CHAR = /^[一-鿿]$/;

/**
 * Vieshow lists one entry per format/language: "(數位 英)片名", "(4DX 3D 英)片名", "(數位)片名", "(IV 4DX 3D)片名".
 * The last token inside the parentheses is the language only when it is a single CJK character.
 */
export function parseVersionTitle(raw: string): VersionTitle {
  const text = raw.replace(/\s+/g, " ").trim();
  const m = /^[(（]([^)）]*)[)）]\s*(.*)$/.exec(text);
  if (!m) return { raw: text, title: text, format: "" };
  const tokens = m[1].trim().split(/\s+/).filter(Boolean);
  let language: string | undefined;
  if (tokens.length > 1 && CJK_CHAR.test(tokens[tokens.length - 1])) language = tokens.pop();
  return { raw: text, title: m[2].trim(), format: tokens.join(" "), language };
}
