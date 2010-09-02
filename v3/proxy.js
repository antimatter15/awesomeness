//Storage
var url = require('url'),
		fs = require('fs'),
		io = require('socket.io'),
	  http = require('http');


var server = http.createServer(function (req, res) {
  var path = url.parse(req.url).pathname;
	if(req.method == 'POST'){
		var chunks = '';
		req.on('data', function(chunk){
			chunks += chunk;
		})
		req.on('end', function(){
			if(req.url == '/push'){
				res.writeHead(200)
			  push_updates(JSON.parse(chunks));
			}
		})
	}else if(req.method == 'GET'){
		//webinterface is testing ONLY
		if(req.url == '/' || req.url == ''){
			res.writeHead(301,{'content-type': 'text/html','location': '/client.html'});
			res.end()
		}else if(req.url == '/auth'){

			
		}else if (/\.(js|html|swf|css)$/.test(path)){
			try {
				var swf = path.substr(-4) === '.swf';
				if(swf){
				  res.writeHead(200, {'Content-Type': 'application/x-shockwave-flash'});
				}else if(path.substr(-3) == '.js'){
				  res.writeHead(200, {'Content-Type': 'text/javascript'});
				}else if(path.substr(-4) == '.css'){
				  res.writeHead(200, {'Content-Type': 'text/css'});
				}else{
				  res.writeHead(200, {'Content-Type': 'text/html'});
				}
				
				fs.readFile(__dirname + '/public/' + path, swf ? 'binary' : 'utf8', function(err, data){
					if (!err) res.write(data, swf ? 'binary' : 'utf8');
					res.end();
				});
			} catch(e){ 
				res.writeHead(404);
	      res.write('404');
	      res.end();
			}
		}else{
		  res.writeHead(404);
	    res.write('404');
	    res.end();
		}
	}
});

server.listen(8124, "127.0.0.1");
console.log('Server running at http://127.0.0.1:8124/');
function b64_decode(str){
  return (new Buffer(str, 'base64')).toString('utf-8');
}

function b64_encode(str){
  return (new Buffer(str)).toString('base64');
}


function push_updates(json){
	sock.broadcast(json)
}

// socket.io, I choose you
// simplest chat application evar
var sock = io.listen(server);

sock.on('connection', function(client){
  console.log('new client connection',client.sessionId);
  client.send('connected');
	client.on('message', function(str){
	  var message = JSON.parse(str);
	  console.log(message)
		if(message.op){
		  console.log('theres an op');
		  var json = message.op;
		  json.id = message.id;
			var target = url.parse(message.id);
			var hclient = http.createClient(target.port, target.hostname);
      var request = hclient.request('POST', '/', {
        'authorization': 'Basic '+b64_encode('admin:password')
      }); 
      request.end(JSON.stringify(json));
      request.on('response', function(response){
        console.log('getting response');
        var all = '';response.on('data', function(chunk){all += chunk});
        response.on('end', function(){
          console.log('getted response');
          client.send(all);
        })
      });
		}
	});

	client.on('disconnect', function(){
		console.log('client disconnected');
	});
});
