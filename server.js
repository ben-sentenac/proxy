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


server.listen(8083);