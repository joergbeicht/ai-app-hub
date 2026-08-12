/** Minimaler `--key value`-Parser für die Provisioning-/Test-Skripte unter `backend/scripts/` - kein
 * externes CLI-Framework, da hier nur wenige, einfache Flags gebraucht werden (YAGNI). Ein `--key`
 * ohne folgenden Wert (z. B. am Ende oder direkt vor dem nächsten `--...`) gilt als reiner
 * Boolean-Flag (Wert `"true"`) statt als Fehler. */
export function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token?.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        args.set(key, 'true');
        continue;
      }
      args.set(key, value);
      i += 1;
    }
  }
  return args;
}

export function requireArg(args: Map<string, string>, key: string): string {
  const value = args.get(key);
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return value;
}
