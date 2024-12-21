import http from 'node:http';



const server = http.createServer((req,res) => {
    if(req.url === '/') {
        res.writeHead(200,'OK',{
            'content-type':'application/json'
        });

        res.end(JSON.stringify({
            message:'hello world'
        }));
    }
});

//to test : curl -x http://localhost:8080 -k  http://localhost:8083/
server.listen(8083);