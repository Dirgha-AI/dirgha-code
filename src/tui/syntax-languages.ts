import chalk from 'chalk';

export function highlightDiff(code: string): string {
  return code.split('\n').map(line => {
    if (line.startsWith('+++') || line.startsWith('---')) return chalk.hex('#9CA3AF')(line);
    if (line.startsWith('@@')) return chalk.hex('#38BDF8').bold(line);
    if (line.startsWith('+')) return chalk.hex('#4ADE80')(line);
    if (line.startsWith('-')) return chalk.hex('#F87171')(line);
    return chalk.hex('#D4D4D4')(line);
  }).map(l => '  ' + l).join('\n');
}

const SQL_KW = new Set('SELECT FROM WHERE INSERT INTO UPDATE DELETE CREATE DROP ALTER TABLE INDEX JOIN LEFT RIGHT INNER OUTER ON AS GROUP BY ORDER HAVING LIMIT OFFSET SET VALUES AND OR NOT NULL IS IN LIKE BETWEEN EXISTS DISTINCT ALL ANY UNION WITH RETURNING BEGIN COMMIT ROLLBACK PRIMARY KEY FOREIGN REFERENCES UNIQUE DEFAULT CONSTRAINT IF THEN END CASE WHEN ELSE DATABASE SCHEMA VIEW TRIGGER PROCEDURE FUNCTION'.split(' '));

export function highlightSQL(code: string): string {
  return code.split('\n').map(line => {
    if (line.trimStart().startsWith('--')) return '  ' + chalk.hex('#6A9955').italic(line);
    return '  ' + line.replace(/'[^']*'/g, m => chalk.hex('#CE9178')(m))
      .replace(/\b(\d+\.?\d*)\b/g, m => chalk.hex('#B5CEA8')(m))
      .replace(/\b([A-Za-z_][\w]*)\b/g, w => SQL_KW.has(w.toUpperCase()) ? chalk.hex('#569CD6').bold(w) : w);
  }).join('\n');
}

const SHELL_CMD = new Set('echo export cd ls mkdir rm cp mv grep sed awk cat find chmod chown source which curl wget git npm node python python3 pip pnpm yarn'.split(' '));

export function highlightShell(code: string): string {
  return code.split('\n').map(line => {
    if (line.trimStart().startsWith('#')) return '  ' + chalk.hex('#6A9955').italic(line);
    return '  ' + line.replace(/(\$\{?[\w]+\}?)/g, m => chalk.hex('#9CDCFE')(m))
      .replace(/"([^"]*)"/g, (_m, s) => chalk.hex('#CE9178')(`"${s}"`))
      .replace(/\b([\w-]+)\b/g, w => SHELL_CMD.has(w) ? chalk.hex('#DCDCAA')(w) : w);
  }).join('\n');
}

export function highlightJSON(code: string): string {
  return code.split('\n').map(line => {
    return '  ' + line.replace(/"([^"]+)"(\s*:)/g, (_m, k, colon) => chalk.hex('#9CDCFE')(`"${k}"`) + colon)
      .replace(/:\s*"([^"]*)"/g, (_m, v) => ': ' + chalk.hex('#CE9178')(`"${v}"`))
      .replace(/\b(true|false|null)\b/g, m => chalk.hex('#569CD6')(m));
  }).join('\n');
}
