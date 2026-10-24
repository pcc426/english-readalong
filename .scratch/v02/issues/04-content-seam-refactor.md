# 04: 内容 seam 预重构与 schema 兼容

**What to build:** "让改动变容易"的预重构：内容包 schema 扩展 `type`（可选，缺省视为 standard）与可空 `owner`；内容加载 seam 泛化为「标准目录 + 按账号的自定义目录」合并读取，查询可按账号过滤；新代码以 content 命名内容加载 seam（现有 units 命名一并迁移），避免与教材「单元」术语混淆。本票不改变任何用户可见行为，现有 U2/U3 内容包与测试保持原样通过。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 内容包 schema 接受可选 `type`（缺省 standard）与可空 `owner`，现有 U2/U3 内容包无需修改即通过校验
- [ ] 内容加载支持「标准目录 + 按账号自定义目录」合并读取，对现有调用方行为不变
- [ ] 内容查询可按账号过滤可见内容（账号参数可选，不传时行为不变）
- [ ] 内容加载 seam 统一以 content 命名，units 旧命名迁移完成
- [ ] 现有测试全部通过（纯重构、无行为变化）
