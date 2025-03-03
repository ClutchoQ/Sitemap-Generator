const axios = require('axios');
const cheerio = require('cheerio');
const archiver = require('archiver');
const stream = require('stream');
const { promisify } = require('util');

// 将流转换为字符串的辅助函数
async function streamToBase64(stream) {
    const buffer = await promisify(stream.pipe.bind(stream))(new stream.PassThrough());
    return buffer.toString('base64');
}

exports.handler = async (event) => {
    try {
        const { url } = JSON.parse(event.body);

        // 检查URL是否为空或无效
        if (!url || !url.startsWith('http')) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid URL' }) };
        }

        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        let links = new Set();
        $('a').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href && href.startsWith('/')) links.add(new URL(href, url).href);
        });
        links = Array.from(links);

        // 创建zip文件内容
        const archive = archiver('zip', {
            zlib: { level: 9 } // 设置压缩级别
        });

        const passThroughStream = new stream.PassThrough();

        archive.on('error', function(err){
            throw err;
        });

        archive.pipe(passThroughStream);

        // 添加XML文件到压缩包
        archive.append(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${links.map(link => `
    <url>
        <loc>${link}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
    </url>`).join('')}
</urlset>`, { name: 'sitemap.xml' });

        // 添加TXT文件到压缩包
        archive.append(links.join('\n'), { name: 'sitemap.txt' });

        // 添加HTML文件到压缩包
        archive.append(`<html>
<head><title>Sitemap</title></head>
<body>
<h1>Site Links</h1>
<ul>
${links.map(link => `<li><a href="${link}" target="_blank">${link}</a></li>`).join('')}
</ul>
</body>
</html>`, { name: 'sitemap.html' });

        await archive.finalize();

        const base64Data = await streamToBase64(passThroughStream);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename=${new URL(url).hostname}-sitemap.zip`
            },
            body: base64Data,
            isBase64Encoded: true // 标记body是Base64编码的
        };
    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};