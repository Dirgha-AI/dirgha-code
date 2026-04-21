# Why Dirgha Code is FSL, not MIT

Short version: we're bootstrapped, not VC-funded. FSL lets us share the source with the community while keeping Dirgha LLC alive long enough to keep shipping.

If you just want to know what you can do: skip to [What you can do with the code](#what-you-can-do-with-the-code). Everything you'd reasonably want to do with an open-source tool is allowed.

---

## The honest trade-off

Every license is a trade-off between three things: how freely the source flows, how much the authors can capture of the value they create, and how much a well-funded third party can capture the same value without giving back.

Pure MIT sits at one end: maximum flow, zero capture for the authors, maximum capture for anyone who hosts it as a service. Proprietary sits at the other: zero flow, full capture for the authors, zero contribution back.

MIT is the right answer for a lot of projects. It's the wrong answer for a terminal-native AI agent in 2026. Here's why.

## Why not MIT

We want every developer to be able to:

- Read the source, audit it, compile it themselves.
- Run it on their own machine with their own API keys.
- Fork it, modify it, use it inside their company, study how it works.
- Contribute fixes and new features back.

MIT allows all of that. But MIT also allows:

- A well-funded cloud provider to wrap the CLI into a managed service, spend $100M on marketing, and sell it back to the same developers we're trying to help — without contributing a line of code, without employing the maintainers, without keeping the project going when it stops being fashionable.

Dirgha LLC is bootstrapped. No venture capital, no runway to subsidize a fight against Big Cloud. If a hyperscaler decides to take an MIT Dirgha and rehost it, we have no path to sustain the work. The code survives; the project does not.

The post-open-source conversation of the last few years (Sentry, HashiCorp, Elastic, MongoDB, Redis, Cal.com, Plausible) has been the industry working out a middle ground: source stays visible, competitive re-hosting gets a time delay, everything else stays permissive.

FSL is that middle ground.

## What FSL-1.1-MIT actually is

The [Functional Source License][fsl] was designed by Sentry for exactly this situation. The simplest possible summary:

- You can use the code for **any purpose**, including commercial use, except **hosting a competing commercial product** that substitutes for ours.
- After **two years**, that restriction expires and the code becomes MIT. Every release eventually turns into permanent, unrestricted open source.

That's it. It's roughly four paragraphs of legal text.

The `-MIT` suffix means the conversion target is MIT (rather than Apache 2.0). We picked MIT because it's the simplest permissive license and the one most contributors recognize.

[fsl]: https://fsl.software

## What you can do with the code

Everything you'd reasonably want to do:

| You want to… | Allowed under FSL-1.1-MIT today? | Allowed under MIT once converted? |
|---|---|---|
| Install it from npm, use it personally | Yes | Yes |
| Use it at your company on your team's machines | Yes | Yes |
| Use it inside a product you sell, as a dev-time tool | Yes | Yes |
| Read the source, study, audit, compile yourself | Yes | Yes |
| Fork it, modify it, keep it for yourself or your team | Yes | Yes |
| Open a pull request against our repo | Yes | Yes |
| Redistribute a modified fork under a different name | Yes | Yes |
| Package it for Homebrew, apt, Nix | Yes | Yes |
| Teach with it, write books about it, include it in a course | Yes | Yes |
| Run a commercial hosted service that competes with api.dirgha.ai | **Not for 2 years after each release** | Yes once converted |

The one restriction in the "not for 2 years" row is narrow on purpose. If you're wondering whether your use is allowed: it almost certainly is. If you're not sure, email `legal@dirgha.ai` and we'll give you a plain answer.

## What FSL protects

- **Maintainer time.** Someone has to keep the releases rolling, review PRs, cut new versions, handle security incidents. FSL keeps that work fundable.
- **Product quality.** When the same team owns both the open CLI and the hosted platform, they care about the developer experience of both. When those split, the CLI stops getting attention.
- **Trust.** Brand and trademark protections (see `NOTICE.md`) mean "Dirgha" keeps meaning one thing. Forks are allowed and encouraged — under a different name.

## What stays Dirgha LLC proprietary

FSL covers the CLI source in this repository. Other pieces of the Dirgha stack are **not** in this repository and are not FSL:

- `api.dirgha.ai` — the hosted gateway (auth, credits, cross-provider failover for subscription users).
- The hosted platform (`dirgha.ai`, the dashboard, billing).
- Proprietary models and fine-tuning data, where they exist.
- The `Dirgha` name, logo, and product family (trademarks of Dirgha LLC).

The CLI can talk to the hosted platform, but the CLI itself runs entirely on your machine with your own keys if you prefer. That's the "Sovereign by default. Bring-your-own-key." promise in the README.

## What about contributions?

Contributions to the CLI repo are welcomed under the project's DCO + CLA. The CLA assigns copyright in your contribution to Dirgha LLC while granting you a perpetual license back to your own work. This is how we can keep the license coherent across thousands of contributions without orphan-rights problems. Several large projects use the same pattern — see `CONTRIBUTING.md` for the full text and signing flow.

## Will Dirgha ever be fully MIT?

- Each individual release converts to MIT two years after publication, automatically, per FSL's terms.
- If Dirgha LLC winds down or is acquired, we commit to either (a) accelerating the conversion of unreleased changes to MIT, or (b) transferring stewardship to a foundation or the contributor community. This isn't a legal guarantee — you don't need to trust us, because FSL's two-year conversion is already irrevocable.

## Further reading

- [Functional Source License — official site][fsl]
- [Sentry: Introducing the FSL](https://blog.sentry.io/introducing-functional-source-license-freedom-without-free-riders/)
- [Cal.com: Why we chose AGPL + enterprise](https://cal.com/blog/cal-com-is-now-open-source) (similar reasoning, different license)
- [Our LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for the file-by-file breakdown.

## If this feels wrong

If you believe a specific use is blocked and shouldn't be, open a discussion. If you think the license itself is a mistake, we'd rather hear it than lose you silently. The trade-off is real; reasonable people can land on different answers.

Email `legal@dirgha.ai` or open a Discussion tagged `licensing`.
