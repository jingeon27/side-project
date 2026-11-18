"""Each package imports only the packages below it. Checks, not the running code, own this rule.

TypeScript keeps the same kind of rule in projects/clash-bot/eslint.config.ts.
"""

import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Lowest first: a unit may import the units before it in its own list.
ARENA = [
    "catalogue",
    "placement",
    "sim",
    "tables",
    "policy",
    "training",
    "study",
    "league",
    "commands",
    "cli",
]
# `qwen` is the contract modules directly under qwen; `entry` the modules started by name.
QWEN = ["qwen", "qwen.inputs", "qwen.learning", "qwen.records", "qwen.adoption", "qwen.worker"]
QWEN_ENTRIES = {"learning_worker", "setup", "download"}
# What else each unit may import. `root` is the modules directly under clash_bot.
ALLOWED = {
    "root": set(),
    "perception": {"root"},
    "arena.setup": {"root"},
    # The tactical teacher writes Qwen supervision in Qwen's own input and record formats.
    "arena.study": {"qwen", "qwen.inputs", "qwen.records"},
    # The trophy learner reuses the arena policy's features and weights, never its simulator.
    "trophy": {"root", "arena.catalogue", "arena.placement", "arena.policy"},
}


def unit(module):
    """`arena.sim` for clash_bot.arena.sim.engine, `qwen.worker` for clash_bot.qwen.worker.runtime."""
    parts = module.split(".")[1:]
    if not parts or (ROOT / f"{parts[0]}.py").exists():
        return "root"
    if parts[0] == "arena" and len(parts) > 1:
        return f"arena.{parts[1]}"
    if parts[0] == "qwen" and len(parts) > 1:
        if (ROOT / "qwen" / parts[1]).is_dir():
            return f"qwen.{parts[1]}"
        return "qwen.entry" if parts[1] in QWEN_ENTRIES else "qwen"
    return parts[0]


def allowed(source):
    if source == "qwen.entry":
        return {"root", *QWEN}
    if source in QWEN:
        return {"root", *QWEN[: QWEN.index(source)]}
    if not source.startswith("arena.") or source == "arena.setup":
        return ALLOWED[source]
    below = ARENA[: ARENA.index(source.split(".")[1])]
    return {"root", *(f"arena.{name}" for name in below), *ALLOWED.get(source, ())}


def imported(path):
    """Full names of the clash_bot modules a file imports, lazy imports included."""
    package = ".".join(path.relative_to(ROOT.parent).with_suffix("").parts[:-1])
    for node in ast.walk(ast.parse(path.read_text())):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = package.split(".")[: len(package.split(".")) - (node.level - 1)]
            module = (
                ".".join([*base, node.module] if node.module else base)
                if node.level
                else node.module
            )
            for alias in node.names:
                # `from .tables import balance` names a module; `from .rules import TILE` does not.
                inner = ROOT.parent.joinpath(*module.split("."), alias.name)
                is_module = inner.with_suffix(".py").exists() or inner.is_dir()
                yield f"{module}.{alias.name}" if is_module else module


def implementation():
    return [
        path
        for path in sorted(ROOT.rglob("*.py"))
        if not path.name.endswith(("_test.py", "_fixture.py")) and path.name != "__init__.py"
    ]


class LayerTest(unittest.TestCase):
    def test_every_import_points_at_a_lower_package(self):
        broken = []
        for path in implementation():
            source = unit(".".join(path.relative_to(ROOT.parent).with_suffix("").parts))
            for module in imported(path):
                if not module.startswith("clash_bot.") or unit(module) in (
                    source,
                    *allowed(source),
                ):
                    continue
                broken.append(
                    f"{path.relative_to(ROOT)} imports {module}: "
                    f"{source} may use only {sorted(allowed(source))}"
                )
        self.assertEqual(broken, [])

    def test_the_rule_names_every_package(self):
        units = {
            unit(".".join(path.relative_to(ROOT.parent).with_suffix("").parts))
            for path in implementation()
        }
        named = {"root", *ALLOWED, *QWEN, "qwen.entry", *(f"arena.{name}" for name in ARENA)}
        self.assertEqual(units - named, set())

    def test_an_upward_import_is_reported(self):
        self.assertEqual(unit("clash_bot.arena.sim.engine"), "arena.sim")
        self.assertEqual(unit("clash_bot.paths"), "root")
        self.assertNotIn("arena.league", allowed("arena.sim"))
        self.assertNotIn("qwen", allowed("arena.training"))
        self.assertEqual(unit("clash_bot.qwen.worker.runtime"), "qwen.worker")
        self.assertEqual(unit("clash_bot.qwen.learning_worker"), "qwen.entry")
        self.assertEqual(unit("clash_bot.qwen.protocol"), "qwen")
        self.assertNotIn("qwen.worker", allowed("qwen.learning"))
        self.assertNotIn("qwen.entry", allowed("qwen.worker"))
        self.assertIn("arena.sim", allowed("arena.league"))
        self.assertNotIn("arena.sim", allowed("trophy"))
        self.assertNotIn("perception", allowed("trophy"))


if __name__ == "__main__":
    unittest.main()
