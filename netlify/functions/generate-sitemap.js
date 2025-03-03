const axios = require('axios');
const cheerio = require('cheerio');

exports.handler = async (event) => {
    try {
        const { url, format } = JSON.parse(event.body);

        // 检查 URL 是否为空或无效
        if (!url || !url.startsWith('http')) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid URL' }) };
        }

        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // 提取所有链接
        let links = [];
        $('a').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href && href.startsWith('/')) links.push(new URL(href, url).href);
        });

        // 根据请求的格式生成输出内容
        let outputContent;
        switch(format.toLowerCase()) {
            case 'xml':
                outputContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${links.map(link => `
    <url>
        <loc>${link}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
    </url>`).join('')}
</urlset>`;
                break;
            case 'txt':
                outputContent = links.join('\n');
                break;
            case 'html':
                outputContent = `<html>
<head><title>Sitemap</title></head>
<body>
<h1>Site Links</h1>
<ul>
${links.map(link => `<li><a href="${link}" target="_blank">${link}</a></li>`).join('')}
</ul>
</body>
</html>`;
                break;
            default:
                return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported format' }) };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': format === 'html' ? 'text/html' : 'text/plain' },
            body: outputContent
        };
    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};