"""Alembic 迁移体系冒烟测试（不连真实 MySQL）。"""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


def test_alembic_linear_history_has_single_head() -> None:
    root = Path(__file__).resolve().parents[1]
    cfg = Config(str(root / "alembic.ini"))
    script = ScriptDirectory.from_config(cfg)

    heads = script.get_heads()
    assert len(heads) == 1

    revisions = list(script.walk_revisions())
    assert len(revisions) >= 1

    # 链底应为 initial revision
    base = next(r for r in revisions if r.down_revision is None)
    assert "initial" in (base.doc or "").lower() or base.revision == "c8c69763bd07"


def test_alembic_versions_dir_not_empty() -> None:
    versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
    files = list(versions.glob("*.py"))
    assert files, "alembic/versions 下应至少有一份 revision"
