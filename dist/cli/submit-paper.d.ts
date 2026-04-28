/**
 * `dirgha submit-paper <doi>` — fetch Crossref metadata for a DOI, produce a
 * JSON file suitable for the dirgha-org-site `content/papers/` directory, and
 * (optionally) open a pull request against the public repo.
 *
 * Without GITHUB_TOKEN the command prints the JSON + manual PR instructions.
 * With a token it runs `gh api` to fork + branch + PR.
 */
export interface SubmitPaperArgs {
    doi: string;
    targetDir?: string;
    openPr?: boolean;
    repo?: string;
}
export declare function runSubmitPaper(args: SubmitPaperArgs): Promise<number>;
