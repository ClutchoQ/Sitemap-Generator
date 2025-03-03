const axios = require('axios');
const cheerio = require('cheerio');

exports.handler = async (event) => {
    try {
        const { url } = JSON.parse(event.body);

        // 检查 URL 是否为空或无效
        if (!url || !url.startsWith('http')) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid URL' }) };
        }

        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // 简单示例：提取所有链接
        const links = [];
        $('a').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href && href.startsWith('/')) links.push(new URL(href, url).href);
        });

        // 生成XML
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${links.map(link => `
    <url>
        <loc>${link}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
    </url>`).join('')}
</urlset>`;

        return {
            statusCode: 200,
            body: JSON.stringify({ xmlContent: xml })
        };
    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};