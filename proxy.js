import https from 'node:https';
import http from 'node:http';
import net from 'node:net'
import { URL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { readFileSync } from 'node:fs';

/**
 * Étape 1 : Construire le proxy HTTP
    Le proxy  doit :
    - Intercepter les requêtes entrantes.
    - Les transmettre au serveur cible.
    - Intercepter les réponses et les renvoyer au client.

    openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes
*/

const key = readFileSync('./key.pem');
const cert = readFileSync('./cert.pem');

const httpsServers = new Set();

const proxyServer = http.createServer(async (clientRequest, clientResponse) => {
    const targetUrl = new URL(clientRequest.url);
    const options = {
        hostname: clientRequest.headers['host'].split(':')[0],
        port: targetUrl.port ?? 80,
        path: targetUrl.pathname,
        method: clientRequest.method,
        headers: clientRequest.headers
    };

    //client -----> proxy-----> server
    //forward request 
    const serverRequest = http.request(options, async (serverResponse) => {
        clientResponse.writeHead(serverResponse.statusCode, serverResponse.headers);
        //redirect client
        await pipeline(
            serverResponse,
            clientResponse
        );
    });

    //get to server 
    await pipeline(
        clientRequest,
        serverRequest
    );

    serverRequest.on('error', (err) => {
        console.error('[HTTP Error]', err);
        clientResponse.writeHead(500);
        clientResponse.end('Proxy Error');
    });

});


//handle https 

proxyServer.on('connect', (request, clientSocket, head) => {
    const [hostname, port] = request.url.split(':');
    console.log(`[HTTPS] Tunnel vers ${hostname}:${port}`);
    //start temporary https server
    const httpsServer = https.createServer({
        key,
        cert
    },
        async (httpsRequest, httpsResponse) => {
            console.log(`[HTTPS] Requête interceptée : ${httpsRequest.url}`);

            const options = {
                hostname: httpsRequest.headers.host.split(':')[0],
                port: 443,
                path: httpsRequest.url,
                method: httpsRequest.method,
                headers: httpsRequest.headers,
            };

            const proxyRequest = https.request(options,async (proxyResponse) => {
                httpsResponse.writeHead(proxyResponse.statusCode, proxyResponse.headers);
                await pipeline(
                    proxyResponse,
                    httpsResponse
                );
            });

            await pipeline(
                httpsRequest,
                proxyRequest
            );
        });

    httpsServer.listen(0, () => {
        const { port } = httpsServer.address();
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

        httpsServers.add(httpsServer);

        const tunnel = net.connect(port, 'localhost', () => {
            console.log('connectiong on port',port);
            clientSocket.pipe(tunnel);
            tunnel.pipe(clientSocket);
        });

        tunnel.on('error', (err) => {
            console.error('[Tunnel Error]', err);
            clientSocket.end();
            httpsServer.close(() => {
                httpsServers.delete(httpsServer);
            });
        });

        clientSocket.on('end', () => console.log(`[HTTPS] Connexion terminée : ${hostname}:${port}`))

        clientSocket.on('close', () => {
            //close opened https connection
            httpsServer.close((err) => {
                if(err) console.error(err);
                console.log(`closing: ${hostname}:${port}`);
                httpsServers.delete(httpsServer);
            })
        });

        tunnel.setTimeout(10000, () => {
            console.error('[Tunnel Error] Timeout');
            tunnel.destroy();
            httpsServer.close(() => httpsServers.delete(httpsServer));
          });
      
          clientSocket.setTimeout(10000, () => {
            console.error('[Client Error] Timeout');
            clientSocket.destroy();
            httpsServer.close(() => httpsServers.delete(httpsServer));
          });
    });

    httpsServer.on('error', (err) => {
        console.error('[HTTPS Server Error]', err);
        clientSocket.end();
    });
});


// Clean up on exit
process.on('SIGINT', () => {
    console.log('\nArrêt du proxy...');
    for (const server of httpsServers) {
      server.close(() => httpsServers.delete(server));
    }
    process.exit();
  });

proxyServer.listen(8080, '127.0.0.1', () => {
    console.log('server is listening on ', proxyServer.address());
});

