/**
 * emlog迁移WordPress数据库Node.js脚本
 * version: 1.3
 * Author: 阿珏酱
 * Date: 2024-09-27
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
    await wpConnection.beginTransaction();

    console.log('开始迁移用户数据...');
    // 1. 迁移用户（作者）
    const [emlogUsers] = await emlogConnection.execute('SELECT * FROM emlog_user');
    const userIdMap = {}; // 用于存储 emlog 用户ID与 WordPress 用户ID的映射
    for (const user of emlogUsers) {
      const [result] = await wpConnection.execute(
        `INSERT INTO wp_users (user_login, user_pass, user_nicename, user_email, user_registered, display_name)
         VALUES (?, ?, ?, ?, NOW(), ?)`,
        [
          user.username,
          user.password,
          user.nickname || user.username,
          user.email || '',
          user.nickname || user.username,
        ]
      );
      user.wp_id = result.insertId;
      userIdMap[user.uid] = user.wp_id;
      console.log(`已迁移用户：${user.username}`);

      // 插入用户元数据
      await wpConnection.execute(
        `INSERT INTO wp_usermeta (user_id, meta_key, meta_value)
         VALUES (?, 'nickname', ?),
                (?, 'wp_capabilities', ?),
                (?, 'wp_user_level', ?)`,
        [
          user.wp_id, user.nickname || user.username,
          user.wp_id, user.role === 'admin' ? 'a:1:{s:13:"administrator";b:1;}' : 'a:1:{s:6:"author";b:1;}',
          user.wp_id, user.role === 'admin' ? 10 : 2,
        ]
      );
    }
    console.log('用户数据迁移完成。');

    // 2. 迁移分类（分类和标签）
    console.log('开始迁移分类数据...');
    // 分类
    const [emlogCategories] = await emlogConnection.execute('SELECT * FROM emlog_sort');
    const categoryIdMap = {}; // 用于存储 emlog 分类ID与 WordPress term_taxonomy_id 的映射
    for (const category of emlogCategories) {
      const [termResult] = await wpConnection.execute(
        `INSERT INTO wp_terms (name, slug, term_group) VALUES (?, ?, 0)`,
        [category.sortname, category.alias || category.sortname]
      );
      const termId = termResult.insertId;

      const parentId = category.pid && categoryIdMap[category.pid] ? categoryIdMap[category.pid] : 0;

      const [taxonomyResult] = await wpConnection.execute(
        `INSERT INTO wp_term_taxonomy (term_id, taxonomy, description, parent, count)
         VALUES (?, 'category', ?, ?, 0)`,
        [termId, category.description || '', parentId]
      );
      category.term_taxonomy_id = taxonomyResult.insertId;
      categoryIdMap[category.sid] = category.term_taxonomy_id;
      console.log(`已迁移分类：${category.sortname}`);
    }

    // 标签
    console.log('开始迁移标签数据...');
    const [emlogTags] = await emlogConnection.execute('SELECT * FROM emlog_tag');
    const tagIdMap = {}; // 用于存储 emlog 标签ID与标签名称的映射
    const tagNameToTaxonomyIdMap = {}; // 标签名称与 term_taxonomy_id 的映射
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
      tagIdMap[tag.tid] = tag.tagname;
      tagNameToTaxonomyIdMap[tag.tagname] = tag.term_taxonomy_id;
      console.log(`已迁移标签：${tag.tagname}`);
    }
    console.log('分类和标签数据迁移完成。');

    // 3. 迁移文章
    console.log('开始迁移文章数据...');
    const [emlogPosts] = await emlogConnection.execute('SELECT * FROM emlog_blog');
    const postIdMap = {}; // 用于存储 emlog 文章ID与 WordPress 文章ID的映射
    for (const post of emlogPosts) {
      const authorId = userIdMap[post.author] || 1;
      const postContent = post.content || '';
      const postTitle = post.title || '';
      const postExcerpt = post.excerpt || '';
      const postName = post.alias || '';
      const postStatus = post.hide === 'n' ? 'publish' : 'draft';
      const commentStatus = post.allow_remark === 'y' ? 'open' : 'closed';
      const postType = post.type === 'blog' ? 'post' : 'page';
      const postDate = new Date(post.date * 1000).toISOString().slice(0, 19).replace('T', ' ');

      try {
        const [result] = await wpConnection.execute(
          `INSERT INTO wp_posts (
            post_author, post_date, post_date_gmt, post_content, post_title, post_excerpt,
            post_status, comment_status, ping_status, post_password, post_name, to_ping, pinged,
            post_modified, post_modified_gmt, post_content_filtered, post_parent, guid, menu_order,
            post_type, post_mime_type, comment_count
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, '', 0, '', 0, ?, '', ?)`,
          [
            authorId,
            postDate,
            postDate,
            postContent,
            postTitle,
            postExcerpt,
            postStatus,
            commentStatus,
            'open',
            post.password || '',
            postName,
            postDate,
            postDate,
            postType,
            post.comnum || 0,
          ]
        );
        post.wp_id = result.insertId;
        postIdMap[post.gid] = post.wp_id;

        // 更新 guid
        const guid = `https://yourdomain.com/?p=${post.wp_id}`;
        await wpConnection.execute(
          `UPDATE wp_posts SET guid = ? WHERE ID = ?`,
          [guid, post.wp_id]
        );

        console.log(`已迁移文章：${postTitle}`);

        // 插入浏览量到 wp_postmeta 表
        await wpConnection.execute(
          `INSERT INTO wp_postmeta (post_id, meta_key, meta_value)
           VALUES (?, 'post_views_count', ?)`,
          [post.wp_id, post.views || 0]
        );

        // 设置文章分类
        if (post.sortid !== -1 && categoryIdMap[post.sortid]) {
          await wpConnection.execute(
            `INSERT INTO wp_term_relationships (object_id, term_taxonomy_id, term_order)
             VALUES (?, ?, 0)`,
            [post.wp_id, categoryIdMap[post.sortid]]
          );

          // 更新分类的 count
          await wpConnection.execute(
            `UPDATE wp_term_taxonomy SET count = count + 1 WHERE term_taxonomy_id = ?`,
            [categoryIdMap[post.sortid]]
          );
        }

        // 设置标签
        if (post.tags) {
          const tagIds = post.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
          for (const tagId of tagIds) {
            const tagName = tagIdMap[tagId];
            if (!tagName) {
              console.warn(`无法找到标签ID ${tagId} 对应的名称`);
              continue;
            }

            let termTaxonomyId = tagNameToTaxonomyIdMap[tagName];
            if (!termTaxonomyId) {
              // 如果标签不存在，创建新标签
              const [termInsert] = await wpConnection.execute(
                `INSERT INTO wp_terms (name, slug, term_group) VALUES (?, ?, 0)`,
                [tagName, tagName]
              );
              const termId = termInsert.insertId;

              const [taxonomyInsert] = await wpConnection.execute(
                `INSERT INTO wp_term_taxonomy (term_id, taxonomy, description, parent, count)
                 VALUES (?, 'post_tag', '', 0, 0)`,
                [termId]
              );
              termTaxonomyId = taxonomyInsert.insertId;
              tagNameToTaxonomyIdMap[tagName] = termTaxonomyId;
            }

            await wpConnection.execute(
              `INSERT INTO wp_term_relationships (object_id, term_taxonomy_id, term_order)
               VALUES (?, ?, 0)`,
              [post.wp_id, termTaxonomyId]
            );

            // 更新标签的 count
            await wpConnection.execute(
              `UPDATE wp_term_taxonomy SET count = count + 1 WHERE term_taxonomy_id = ?`,
              [termTaxonomyId]
            );
          }
        }

      } catch (postError) {
        console.error(`迁移文章 "${postTitle}" 时出错：${postError.message}`);
        continue; // 跳过此文章，继续迁移下一个
      }
    }
    console.log('文章数据迁移完成。');

    // 4. 迁移评论
    console.log('开始迁移评论数据...');
    const [emlogComments] = await emlogConnection.execute('SELECT * FROM emlog_comment ORDER BY cid ASC');
    const commentIdMap = {}; // 用于存储 emlog 评论ID与 WordPress 评论ID的映射
    for (const comment of emlogComments) {
      const postId = postIdMap[comment.gid];
      if (postId) {
        try {
          const wpCommentParentId = comment.pid ? commentIdMap[comment.pid] || 0 : 0;
          const commentDate = new Date(comment.date * 1000).toISOString().slice(0, 19).replace('T', ' ');

          const [result] = await wpConnection.execute(
            `INSERT INTO wp_comments (
              comment_post_ID, comment_author, comment_author_email, comment_author_url,
              comment_author_IP, comment_date, comment_date_gmt, comment_content, comment_karma, comment_approved,
              comment_agent, comment_type, comment_parent, user_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '', 'comment', ?, 0)`,
            [
              postId,
              comment.poster || '',
              comment.mail || '',
              comment.url || '',
              comment.ip || '',
              commentDate,
              commentDate,
              comment.comment || '',
              comment.hide === 'n' ? '1' : '0',
              wpCommentParentId,
            ]
          );
          comment.wp_id = result.insertId;
          commentIdMap[comment.cid] = comment.wp_id;
          console.log(`已迁移评论：ID ${comment.cid} 对应文章 ID ${postId}`);

          // **删除更新文章评论数的代码**
          // 已在文章插入时设置了评论数量，无需再次更新

        } catch (commentError) {
          console.error(`迁移评论 ID ${comment.cid} 时出错：${commentError.message}`);
          continue; // 跳过此评论，继续迁移下一个
        }
      }
    }
    console.log('评论数据迁移完成。');

    // 5. 迁移友情链接
    console.log('开始迁移友情链接数据...');
    const [emlogLinks] = await emlogConnection.execute('SELECT * FROM emlog_link');
    for (const link of emlogLinks) {
      try {
        await wpConnection.execute(
          `INSERT INTO wp_links (link_url, link_name, link_image, link_target, link_description, link_visible, link_owner,
            link_rating, link_updated, link_rel, link_notes, link_rss)
           VALUES (?, ?, '', '_blank', ?, ?, 1, 0, NOW(), '', '', '')`,
          [link.siteurl || '', link.sitename || '', link.description || '', link.hide === 'n' ? 'Y' : 'N']
        );
        console.log(`已迁移友情链接：${link.sitename}`);
      } catch (linkError) {
        console.error(`迁移友情链接 "${link.sitename}" 时出错：${linkError.message}`);
        continue; // 跳过此友情链接，继续迁移下一个
      }
    }
    console.log('友情链接数据迁移完成。');

    // 提交事务
    await wpConnection.commit();

    console.log('数据迁移完成！');
  } catch (error) {
    // 回滚事务
    await wpConnection.rollback();
    console.error('数据迁移过程中发生错误：', error.message);
  } finally {
    // 关闭数据库连接
    await emlogConnection.end();
    await wpConnection.end();
  }
})();