import { error } from 'node:console';
import http from 'node:http';
import { URL}from 'node:url';
import { pipeline } from 'node:stream/promises';

/**
 * Étape 1 : Construire le proxy HTTP
    Le proxy  doit :
    - Intercepter les requêtes entrantes.
    - Les transmettre au serveur cible.
    - Intercepter les réponses et les renvoyer au client.

*/

const proxyServer = http.createServer(async (clientRequest,clientResponse) => {
    const targetUrl = new URL(clientRequest.url);
    const options = {
        hostname:clientRequest.headers['host'].split(':')[0],
        port:targetUrl.port ?? 80,
        path:targetUrl.pathname,
        method:clientRequest.method,
        headers:clientRequest.headers
    };

    //client -----> proxy-----> server
    //forward request 
    const serverRequest = http.request(options,async (serverResponse) => {
       clientResponse.writeHead(serverResponse.statusCode,serverResponse.headers);
       //serverResponse.pipe(clientResponse);
       await pipeline(
            serverResponse,
            clientResponse
       );
    });

    //clientRequest.pipe(serverRequest)
    await pipeline(
        clientRequest,
        serverRequest
    );

});




proxyServer.listen(8080,'127.0.0.1', () => {
    console.log('server is listening on ',proxyServer.address());
});