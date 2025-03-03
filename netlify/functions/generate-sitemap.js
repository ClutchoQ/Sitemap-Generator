const axios = require('axios');
const cheerio = require('cheerio');
const archiver = require('archiver');

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
        const output = new stream.PassThrough();
        const archive = archiver('zip', {
            zlib: { level: 9 } // 设置压缩级别
        });

        archive.on('error', function(err){
            throw err;
        });

        archive.pipe(output);

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

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename=${new URL(url).hostname}-sitemap.zip`
            },
            body: await streamToString(output)
        };
    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

// 辅助函数：将流转换为字符串
async function streamToString(stream) {
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    });
}