# 02: 清理验收孤儿包 008cf111（The dragon dance 重复卡根因）

**What to build:** spec §2。删除 `data/content/standard/008cf111-14ec-4315-9459-7935304660a0.json`（v0.3.4 验收测试残留：临时库已删、包文件残留共享磁盘、真实库无草稿行 → UI 不可删）；并清理孤儿练习记录 unit_id IN ('518aa05e-1bbf-43da-b16a-97cdb2bbde41','7e2fdd25-ac10-43f5-a5f4-634ccd2782f1')（共 9 行，无对应包/草稿）。

**Blocked by:** None

**Status:** ready-for-agent

## 注意

- f5fcec05 / 2f8e5173 / 8aca6e91 三个运行时包有对应 published 草稿，**保留**
- 随代码包 content/units/*（含 u2-dragon-dance）是仓库本体，**不动**
- 只删数据文件与孤儿行，不改任何代码

## 验收

- [x] 教材内容列表只剩 1 个 The dragon dance（随代码 7 句版）
- [x] 其余三个运行时标准包照常显示与加载
- [x] npm test 全绿（数据清理不涉及测试）

## Comments

- 2026-11-04 执行：删除孤儿包文件；sqlite 删除孤儿练习记录 9 行（518aa05e×7、7e2fdd25×2）。复核：listContent 标准 5 包（2 随代码 + 3 运行时，无 008cf111）；首页只剩 1 个 The dragon dance。其他运行时包未受影响。
