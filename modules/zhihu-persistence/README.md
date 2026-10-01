# ZhihuPersistence

Expo 本地原生模块，自动链接于 Android/iOS。新增或修改本模块后须 prebuild 并重新编译；没有模块的旧开发包不会回退到不安全的文件写入。

- `writeAtomically(uri, value)`：仅应用私有 Documents/files 下的 UTF-8 文本，最多 16 MiB。iOS 原子替换并使用首次解锁后保护；Android `AtomicFile` 提交与失败回滚。
- `readAtomically(uri)`：对应私有文本读取，不存在返回 `null`，损坏、权限或容量错误拒绝。Android 经过 `openRead` 恢复中断写入留下的 `.bak`；不能用普通 FileSystem 读取替代。
- `inspectApk(uri)`：仅私有 Documents/files 与 cache 下的普通文件，最多 1 GiB，按 1 MiB 分块计算 SHA-256，同时返回实际字节数和 ZIP 开头标记。它不读取整包到 JS、不验证 APK 签名或完整 ZIP 结构。更新器另外校验发行附件的长度和 SHA-256，最终安装与签名校验交给 Android 安装器。

路径按 canonical/symlink-resolved 范围验证；桥接错误只含固定类别，不附原文件路径、文本或底层异常。账号加密及备份恢复规则见 [账号保存与恢复](../../docs/AUTH_STORAGE.md)。
