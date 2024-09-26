/**
 * emlog迁移WordPress数据库Node.js脚本
 * version: 1.0
 * Author: 阿珏酱
 * Date: 2024-09-26
 * Blog: https://MoeJue.cn
 * Github: https://github.com/iAJue/migrate_emlog_to_wp
 */
import mysql from 'mysql2/promise';

(async () => {
  // 配置 emlog 和 WordPress 数据库连接
  const emlogDbConfig = {
    host: 'localhost',
    user: 'root',
    password: '123456789',
    database: 'emlog',
    charset: 'utf8mb4',
  };

  const wpDbConfig = {
    host: 'localhost',
    user: 'root',
    password: '123456789',
    database: 'WordPress',
    charset: 'utf8mb4',
  };

  // 创建数据库连接
  console.log('正在连接到 emlog 数据库...');
  const emlogConnection = await mysql.createConnection(emlogDbConfig);
  console.log('已连接到 emlog 数据库。');

  console.log('正在连接到 WordPress 数据库...');
  const wpConnection = await mysql.createConnection(wpDbConfig);
  console.log('已连接到 WordPress 数据库。');

  try {
    // 开始事务
    await emlogConnection.beginTransaction();
    await wpConnection.beginTransaction();

    console.log('开始迁移用户数据...');
    // 1. 迁移用户（作者）
    const [emlogUsers] = await emlogConnection.execute('SELECT * FROM emlog_user');
    for (const user of emlogUsers) {
      const [result] = await wpConnection.execute(
        `INSERT INTO wp_users (user_login, user_pass, user_nicename, user_email, user_registered, display_name)
         VALUES (?, ?, ?, ?, NOW(), ?)`,
        [
          user.username,
          user.password, // 注意：密码加密方式不兼容,需要提示用户重新设置密码
          user.nickname,
          user.email,
          user.nickname,
        ]
      );
      user.wp_id = result.insertId;
      console.log(`已迁移用户：${user.username}`);
    }

    // 创建用户数据
    for (const user of emlogUsers) {
      await wpConnection.execute(
        `INSERT INTO wp_usermeta (user_id, meta_key, meta_value)
         VALUES (?, 'wp_capabilities', ?), (?, 'wp_user_level', ?)`,
        [
          user.wp_id,
          user.role === 'admin' ? 'a:1:{s:13:"administrator";b:1;}' : 'a:1:{s:6:"author";b:1;}',
          user.wp_id,
          user.role === 'admin' ? 10 : 2,
        ]
      );
    }
    console.log('用户数据迁移完成。');

    // 2. 迁移分类（分类和标签）
    console.log('开始迁移分类数据...');
    // 分类
    const [emlogCategories] = await emlogConnection.execute('SELECT * FROM emlog_sort');
    for (const category of emlogCategories) {
      const [termResult] = await wpConnection.execute(
        `INSERT INTO wp_terms (name, slug, term_group) VALUES (?, ?, 0)`,
        [category.sortname, category.alias || category.sortname]
      );
      const termId = termResult.insertId;

      const [taxonomyResult] = await wpConnection.execute(
        `INSERT INTO wp_term_taxonomy (term_id, taxonomy, description, parent, count)
         VALUES (?, 'category', ?, ?, 0)`,
        [termId, category.description, category.pid]
      );
      category.term_taxonomy_id = taxonomyResult.insertId;
      console.log(`已迁移分类：${category.sortname}`);
    }

    // 标签
    console.log('开始迁移标签数据...');
    const [emlogTags] = await emlogConnection.execute('SELECT * FROM emlog_tag');
    for (const tag of emlogTags) {
      const [termResult] = await wpConnection.execute(
        `INSERT INTO wp_terms (name, slug, term_group) VALUES (?, ?, 0)`,
        [tag.tagname, tag.tagname]
      );
      const termId = termResult.insertId;

      const [taxonomyResult] = await wpConnection.execute(
        `INSERT INTO wp_term_taxonomy (term_id, taxonomy, description, parent, count)
         VALUES (?, 'post_tag', '', 0, 0)`,
        [termId]
      );
      tag.term_taxonomy_id = taxonomyResult.insertId;
      console.log(`已迁移标签：${tag.tagname}`);
    }
    console.log('分类和标签数据迁移完成。');

    // 创建 term_id 和 term_taxonomy_id 的映射
    const termTaxonomyMap = {};
    for (const category of emlogCategories) {
      termTaxonomyMap[category.sid] = category.term_taxonomy_id;
    }

    // 3. 迁移文章
    console.log('开始迁移文章数据...');
    const [emlogPosts] = await emlogConnection.execute('SELECT * FROM emlog_blog');
    for (const post of emlogPosts) {
      const author = emlogUsers.find((user) => user.uid === post.author);
      try {
        const postContent = post.content || '';
        const postTitle = post.title || '';
        const postExcerpt = post.excerpt || '';
        const postName = post.alias || '';
    
        const [result] = await wpConnection.execute(
          `INSERT INTO wp_posts (
            post_author, post_date, post_date_gmt, post_content, post_title, post_excerpt,
            post_status, comment_status, ping_status, post_name, post_modified, post_modified_gmt,
            post_parent, menu_order, post_type, comment_count, to_ping, pinged, post_content_filtered
          )
          VALUES (?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?, ?, ?, ?, '', '', '')`,
          [
            author ? author.wp_id : 1,
            post.date,
            post.date,
            postContent,
            postTitle,
            postExcerpt,
            post.hide === 'n' ? 'publish' : 'draft',
            post.allow_remark === 'y' ? 'open' : 'closed',
            'open',
            postName,
            post.date,
            post.date,
            0,
            0,
            post.type === 'blog' ? 'post' : 'page',
            post.comnum,
          ]
        );
        post.wp_id = result.insertId;
        console.log(`已迁移文章：${postTitle}`);
      } catch (postError) {
        console.error(`迁移文章 "${postTitle}" 时出错：${postError.message}`);
        continue; // 跳过此文章，继续迁移下一个
      }

      // 设置文章分类
      if (post.sortid !== -1 && termTaxonomyMap[post.sortid]) {
        await wpConnection.execute(
          `INSERT INTO wp_term_relationships (object_id, term_taxonomy_id, term_order)
           VALUES (?, ?, 0)`,
          [post.wp_id, termTaxonomyMap[post.sortid]]
        );
      }

      // 设置标签
      if (post.tags) {
        const tagNames = post.tags.split(',');
        for (const tagName of tagNames) {
          const tag = emlogTags.find((t) => t.tagname === tagName.trim());
          if (tag && tag.term_taxonomy_id) {
            await wpConnection.execute(
              `INSERT INTO wp_term_relationships (object_id, term_taxonomy_id, term_order)
               VALUES (?, ?, 0)`,
              [post.wp_id, tag.term_taxonomy_id]
            );
          }
        }
      }

      // 更新 term_taxonomy 表中的计数
      await wpConnection.execute(
        `UPDATE wp_term_taxonomy SET count = count + 1 WHERE term_taxonomy_id IN (SELECT term_taxonomy_id FROM wp_term_relationships WHERE object_id = ?)`,
        [post.wp_id]
      );
    }
    console.log('文章数据迁移完成。');

    // 4. 迁移评论
    console.log('开始迁移评论数据...');
    const [emlogComments] = await emlogConnection.execute('SELECT * FROM emlog_comment');
    for (const comment of emlogComments) {
      const post = emlogPosts.find((p) => p.gid === comment.gid);
      if (post) {
        try {
          const [result] = await wpConnection.execute(
            `INSERT INTO wp_comments (
              comment_post_ID, comment_author, comment_author_email, comment_author_url,
              comment_author_IP, comment_date, comment_date_gmt, comment_content, comment_approved,
              comment_parent, user_id
            )
            VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?, ?, ?, ?)`,
            [
              post.wp_id,
              comment.poster,
              comment.mail,
              comment.url,
              comment.ip,
              comment.date,
              comment.date,
              comment.comment,
              comment.hide === 'n' ? '1' : '0',
              comment.pid,
              0,
            ]
          );
          comment.wp_id = result.insertId;
          console.log(`已迁移评论：ID ${comment.cid} 对应文章 ID ${post.wp_id}`);
        } catch (commentError) {
          console.error(`迁移评论 ID ${comment.cid} 时出错：${commentError.message}`);
          continue; // 跳过此评论，继续迁移下一个
        }
      }
    }
    console.log('评论数据迁移完成。');

    // 5. 迁移导航栏（菜单）
    console.log('开始迁移导航栏数据...');
    const [emlogNavis] = await emlogConnection.execute('SELECT * FROM emlog_navi');
    for (const navi of emlogNavis) {
      try {
        const [result] = await wpConnection.execute(
          `INSERT INTO wp_posts (post_title, post_status, post_type)
           VALUES (?, 'publish', 'nav_menu_item')`,
          [navi.naviname]
        );
        const menuItemId = result.insertId;

        // 设置导航菜单元数据
        await wpConnection.execute(
          `INSERT INTO wp_postmeta (post_id, meta_key, meta_value)
           VALUES
           (?, '_menu_item_type', 'custom'),
           (?, '_menu_item_url', ?),
           (?, '_menu_item_menu_item_parent', ?),
           (?, '_menu_item_target', ?),
           (?, '_menu_item_classes', 'a:0:{}'),
           (?, '_menu_item_xfn', '')`,
          [
            menuItemId,
            menuItemId,
            navi.url,
            menuItemId,
            navi.pid || 0,
            menuItemId,
            navi.newtab === 'y' ? '_blank' : '',
            menuItemId,
            menuItemId,
          ]
        );
        console.log(`已迁移导航项：${navi.naviname}`);
      } catch (naviError) {
        console.error(`迁移导航项 "${navi.naviname}" 时出错：${naviError.message}`);
        continue; // 跳过此导航项，继续迁移下一个
      }
    }
    console.log('导航栏数据迁移完成。');

    // 6. 迁移友情链接
    console.log('开始迁移友情链接数据...');
    const [emlogLinks] = await emlogConnection.execute('SELECT * FROM emlog_link');
    for (const link of emlogLinks) {
      try {
        await wpConnection.execute(
          `INSERT INTO wp_links (link_url, link_name, link_image, link_target, link_description, link_visible, link_owner,
            link_rating, link_updated, link_rel, link_notes, link_rss)
           VALUES (?, ?, '', '_blank', ?, ?, 1, 0, NOW(), '', '', '')`,
          [link.siteurl, link.sitename, link.description, link.hide === 'n' ? 'Y' : 'N']
        );
        console.log(`已迁移友情链接：${link.sitename}`);
      } catch (linkError) {
        console.error(`迁移友情链接 "${link.sitename}" 时出错：${linkError.message}`);
        continue; // 跳过此友情链接，继续迁移下一个
      }
    }
    console.log('友情链接数据迁移完成。');

    // 提交事务
    await emlogConnection.commit();
    await wpConnection.commit();

    console.log('数据迁移完成！');
  } catch (error) {
    // 回滚事务
    await emlogConnection.rollback();
    await wpConnection.rollback();
    console.error('数据迁移过程中发生错误：', error.message);
  } finally {
    // 关闭数据库连接
    await emlogConnection.end();
    await wpConnection.end();
  }
})();