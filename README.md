# migrate_emlog_to_wp

一个用于将 **emlog** 博客系统的数据迁移到 **WordPress** 的 Node.js 脚本，包括文章、评论、导航栏、友情链接等所有数据。

## 目录

- [migrate\_emlog\_to\_wp](#migrate_emlog_to_wp)
  - [目录](#目录)
  - [介绍](#介绍)
  - [特性](#特性)
  - [条件](#条件)
  - [安装](#安装)
  - [使用方法](#使用方法)
  - [注意事项](#注意事项)
  - [许可证](#许可证)

## 介绍

本项目将帮助您从 **emlog** 博客系统的数据迁移到 **WordPress**，包括所有重要的数据，如用户、分类、标签、文章、评论、导航栏和友情链接。该脚本确保迁移的数据与 WordPress 兼容，帮助您顺利完成博客系统的过渡。

## 特性

- **迁移用户（作者）**：将 emlog 的用户账户迁移到 WordPress。
- **迁移分类和标签**：将 emlog 的分类和标签映射到 WordPress 的分类和标签系统。
- **迁移文章和页面**：包括文章的内容、标题、摘要、发布时间等,包括自定义页面。
- **迁移评论**：将文章的评论完整迁移，包括作者信息、发布时间等。
- **迁移导航栏（菜单）**：将 emlog 的导航栏迁移到 WordPress 的菜单系统。
- **迁移友情链接**：将 emlog 的友情链接迁移到 WordPress 的链接管理。
- **进度输出**：在迁移过程中输出详细的进度信息，便于监控。
- **错误处理**：完善的错误捕获和处理机制，保证数据迁移的可靠性。

## 条件

- **Node.js**：版本 12.x 或更高。
- **NPM**：Node 包管理器，用于安装依赖包。
- **MySQL**：emlog 和 WordPress 的数据库均为 MySQL 或兼容的数据库（如 MariaDB）。
- **数据库访问权限**：能够连接和操作 emlog 和 WordPress 的数据库。
- **备份**：在迁移前，请备份 emlog 和 WordPress 的数据库以防数据丢失。

## 安装

1. **克隆或下载本仓库**：

   ```bash
   git clone https://github.com/iAJue/migrate_emlog_to_wp.git
   ```

2. **进入项目目录**：

   ```bash
   cd migrate_emlog_to_wp
   ```

3. **安装依赖包**：

   ```bash
   npm install
   ```

## 使用方法

1. **配置数据库连接信息**：

   - 打开脚本文件 `migrate_emlog_to_wp.js`。
   - 找到以下配置部分，并根据实际情况修改：

     ```javascript
     const emlogDbConfig = {
       host: 'localhost',
       user: 'emlog_user',
       password: 'emlog_password',
       database: 'emlog_database',
       charset: 'utf8mb4',
     };

     const wpDbConfig = {
       host: 'localhost',
       user: 'wp_user',
       password: 'wp_password',
       database: 'wp_database',
       charset: 'utf8mb4',
     };
     ```

   - 确保填写正确的数据库主机、用户名、密码、数据库名称和字符集。

2. **运行迁移脚本**：

   ```bash
   node migrate.js
   ```

## 注意事项

- **页面配置**：页面配置可能出现不一致,需要登录wp的后台重新设置
- **用户权限**：迁移过去的数据默认用户权限是作者,如果不需要请在wp后台进行更新.
- **密码加密方式**：emlog 和 WordPress 使用的密码加密方式一样。迁移后，用户可以直接进行登录.
- **附件和媒体文件**：本脚本未处理附件和媒体文件的迁移。您需要手动将 emlog 的上传目录（`content/upload`）复制到 WordPress 的上传目录 `wp-content/uploads` 中。
- **插件数据**：如果 emlog 中使用了插件并存储了额外的数据，需根据实际情况扩展脚本以迁移这些数据。
- **数据备份**：在运行迁移脚本之前，请务必备份 emlog 和 WordPress 的数据库，以防止意外的数据丢失或损坏。
- **测试环境**：建议先在测试环境中进行迁移，确认无误后再在生产环境中执行。


## 许可证

MIT License

---

如有任何问题或建议，欢迎提交 issue 或 pull request。