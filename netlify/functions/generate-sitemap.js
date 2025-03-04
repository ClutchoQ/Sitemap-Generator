const axios = require('axios');
const cheerio = require('cheerio');
const archiver = require('archiver');
const stream = require('stream');
const { promisify } = require('util');

async function collectStream(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

exports.handler = async (event) => {
    try {
        const { url } = JSON.parse(event.body);

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

        const archive = archiver('zip', { zlib: { level: 9 } });

        const passThroughStream = new stream.PassThrough();

        archive.on('error', err => {
            throw err;
        });

        archive.pipe(passThroughStream);

        // 添加XML文件到压缩包
        archive.append(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${links.map(link => `
    <url>
        <loc>${link}</loc>
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

        const buffer = await collectStream(passThroughStream);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename=${new URL(url).hostname}-sitemap.zip`
            },
            body: buffer.toString('base64'),
            isBase64Encoded: true
        };
    } catch (error) {
        console.error('Error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};