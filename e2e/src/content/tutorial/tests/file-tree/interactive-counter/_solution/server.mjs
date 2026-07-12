import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
};

createServer(async (request, response) => {
  const pathname = request.url === '/' ? '/example.html' : request.url?.split('?')[0] || '/example.html';

  try {
    const content = await readFile(join(process.cwd(), pathname));
    response.writeHead(200, { 'content-type': contentTypes[extname(pathname)] || 'text/plain' });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(3000, () => console.log('Counter lab ready at http://localhost:3000'));
