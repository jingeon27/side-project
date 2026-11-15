# Local battle engine and references

RoyaleSim 0.1.53 is loaded as a pinned Python dependency. Source commit:
`a849c29ae632e12f81442c45b0d9b2d2f2f99f15` at
[RoyaleGym/RoyaleSim](https://github.com/RoyaleGym/RoyaleSim).
Its source code is MIT licensed, copyright 2026 RoyaleGym contributors.
The dependency's LICENSE is retained in its installed distribution.
The license explicitly excludes raw Supercell game-data tables; those are not
copied into this repository. Runtime downloads remain in ignored `.data/`.

Design references requested by the user:

- [ClashRoyaleAi](https://github.com/itzik123/ClashRoyaleAi), MIT: frozen opponent
  pools, lookahead/expert iteration, paired evaluation and reward-hacking examples.
- [Author's discussion](https://www.reddit.com/r/MachineLearning/comments/1wrj0t3/clashroyaleai_an_opensource_deterministic_clash/).
- [crforge](https://github.com/voonhous/crforge), Apache-2.0: versioned game tables,
  deterministic battle validation and explicit fidelity/unsupported-mechanic ledgers.
- [ClashAI](https://github.com/vegetableleaf/ClashAI), commit
  `6f54a58042b1ea4c504bb89f503303204c7099bc`: public observations, inferred enemy
  resources and separated evaluation. No license file was found, so its source
  is consulted as a design reference and is not copied into this repository.

Performance and fidelity claims in those projects are not measurements of this
bot. Our own tests, rule hashes, seeds and evaluation reports are recorded separately.
